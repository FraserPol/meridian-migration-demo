# Full Production Setup — Real AWS RDS + HCP Vault

This provisions the "what stays outside Vercel" infrastructure described in
`solution-architecture.md`: a private AWS RDS Postgres instance, an HCP Vault
Dedicated cluster that issues short-lived dynamic credentials to the app via
OIDC, and a VPC peering between the HCP HVN and Meridian's AWS VPC.

Takes 20–30 minutes, mostly waiting on the HCP Vault cluster to provision.

Run every command from inside `infra/terraform/` unless told otherwise.

---

## Step 1: Install Terraform and set credentials

```bash
brew install terraform
```

You'll need all of the following exported in the same terminal session:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export HCP_CLIENT_ID="..."          # HCP Portal → org → Service Principals
export HCP_CLIENT_SECRET="..."
export VERCEL_API_TOKEN="..."       # https://vercel.com/account/tokens
```

## Step 2: Fill in your variables

```bash
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` and set:
- `vercel_team_slug` — from your Vercel dashboard URL: `vercel.com/<this-part>`
- `vercel_oidc_issuer` — `https://oidc.vercel.com/<same-team-slug>`
- `github_repo` — `<your-github-username>/meridian-migration-demo`
- `auth_secret` — generate one: `openssl rand -base64 32`

Leave `vault_addr` blank for now.

## Step 3: Init and first apply — network, database, Vault cluster

```bash
terraform init
terraform apply \
  -target=module.aws_network \
  -target=module.aws_database \
  -target=module.aws_oidc_trust \
  -target=module.hcp_vault \
  -target=aws_vpc_peering_connection_accepter.hcp_vault \
  -target=hcp_hvn_route.main \
  -target=aws_route.hcp_vault
```

Type `yes` when prompted. This takes 10–15 minutes — the HCP Vault cluster
is the slow part. When it finishes you should see `vault_addr` in the outputs.

## Step 4: Point Terraform at the new Vault cluster

```bash
export VAULT_ADDR="$(terraform output -raw vault_addr)"
export VAULT_TOKEN="$(terraform output -raw vault_bootstrap_admin_token)"
```

Open `terraform.tfvars` and set:
```
vault_addr = "<paste the same VAULT_ADDR value here>"
```

## Step 5: Second apply — configures Vault, creates the Vercel project

```bash
terraform apply
```

Type `yes` when prompted.

## Step 6: Accept Secure Compute peering (manual, one click)

1. Go to your Vercel project → **Settings** → **Secure Compute**.
2. Accept the pending peering connection from the AWS VPC Terraform just created.

## Step 7: Load data into RDS (one time)

Still inside `infra/terraform`:

```bash
export PGUSER_TMP="$(terraform output -raw rds_master_username)"
export PGPASS_TMP="$(terraform output -raw rds_master_password)"
export PGHOST_TMP="$(terraform output -raw rds_endpoint)"
cd ../..
export DATABASE_URL="postgres://${PGUSER_TMP}:${PGPASS_TMP}@${PGHOST_TMP}:5432/meridian?sslmode=require"

npm run db:migrate
npm run db:seed
```

## Step 8: Switch the app to Vault credentials

```bash
vercel env rm DATABASE_URL production
```

Confirm `yes`. The `vercel_project` Terraform module already set `VAULT_ADDR`,
`VAULT_JWT_AUTH_ROLE`, `VAULT_DB_ROLE`, `PGHOST`, `PGPORT`, and `PGDATABASE`
— with `DATABASE_URL` gone, `lib/vault.ts` takes the Vault path automatically.

## Step 9: Redeploy

```bash
vercel deploy --prod
```

**Done.** The app now resolves short-lived, TTL-bound Postgres credentials from
HCP Vault on every request — the exact pattern described in
`../solution-architecture.md`.

---

## Troubleshooting

- **`terraform apply` fails on the vault provider in Step 5:** you likely
  skipped exporting `VAULT_ADDR`/`VAULT_TOKEN` in Step 4, or the cluster
  from Step 3 is still provisioning — check `terraform output vault_addr`
  resolves to something before retrying.
- **HVN route stays in FAILED state:** the VPC peering accepter must be ACTIVE
  before HCP will accept the route — confirm the peering is accepted in the AWS
  console and re-run the Step 3 apply.
- **Anything else:** see "Known limitations" in `README.md` and
  `infra/terraform/README.md`.
