# Infrastructure: Terraform

Provisions the "what stays outside Vercel" half of `solution-architecture.md`:
an AWS VPC + RDS Postgres instance, an HCP Vault Dedicated cluster peered
into that VPC, Vault's JWT/OIDC trust of Vercel plus its database secrets
engine, an AWS IAM OIDC trust for anything the app needs directly on AWS,
and (optionally) the Vercel project itself.

**This was written and reviewed by hand, not applied.** The sandbox this
repo was built in has no `terraform` binary, no AWS/HCP/Vercel credentials,
and no outbound access to releases.hashicorp.com — so `terraform validate`
/ `terraform plan` could not be run here. Run both yourself before
`apply`, especially on the `hcp_vault_cluster`, `hcp_aws_network_peering`,
and `vault_database_secret_backend_*` resources, which are the ones most
likely to have drifted from the provider docs by the time you read this.

## Prerequisites

- Terraform >= 1.7
- An AWS account with credentials exported (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or an SSO profile)
- An HCP account with a service principal: `HCP_CLIENT_ID` / `HCP_CLIENT_SECRET`
- A Vercel account + team, and a Vercel API token: `VERCEL_API_TOKEN`
- Your Vercel OIDC issuer URL (Project Settings → find it once the project exists, or construct it as `https://oidc.vercel.com/<team-slug>` per [the OIDC docs](https://vercel.com/docs/oidc))

```bash
cp terraform.tfvars.example terraform.tfvars
# fill in the values — see comments in the file
```

## Why two apply passes

The `vault` provider needs a live `address` to configure anything. That
address doesn't exist until `hcp_vault_cluster` has already been created —
a classic bootstrap ordering problem. This repo resolves it the same way
most teams do: two passes.

```bash
# Pass 1 — everything except Vault's internal config and the Vercel project
terraform init
terraform apply \
  -target=module.aws_network \
  -target=module.aws_database \
  -target=module.aws_oidc_trust \
  -target=module.hcp_vault \
  -target=aws_vpc_peering_connection_accepter.hcp_vault \
  -target=hcp_hvn_route.main \
  -target=aws_route.hcp_vault

# Grab the cluster address and bootstrap token from Pass 1's outputs
terraform output vault_addr
terraform output -raw vault_bootstrap_admin_token

# Export them for the vault provider, then set vault_addr in terraform.tfvars
export VAULT_ADDR="$(terraform output -raw vault_addr)"
export VAULT_TOKEN="$(terraform output -raw vault_bootstrap_admin_token)"

# Pass 2 — full apply, now that the vault provider has something to talk to
terraform apply
```

After Pass 2, `terraform output rds_endpoint` and the Vercel project's
environment variables (set by `module.vercel_project`) are all an admin
needs to point the app's `VAULT_ADDR` / `PGHOST` at the real
infrastructure instead of the local `DATABASE_URL` fallback — see
`../../.env.example`.

## What this does NOT automate

- **Secure Compute VPC peering between Vercel and this AWS VPC.** As of
  this writing that's a dashboard/API step on Vercel's side (accept the
  peering connection Vercel initiates), not yet a stable Terraform
  resource in the `vercel/vercel` provider. Do this manually after
  `module.vercel_project` creates the project: Vercel dashboard → Project
  → Settings → Secure Compute.
- **HCP Vault cluster tier for production.** `terraform.tfvars.example`
  defaults to `dev_small` to keep this cheap to try. Bump `vault_tier` to
  at least `plus_small` before pointing this at a real Staging
  environment — `dev_small` clusters are not intended to hold anything
  that matters.
- **RDS credential rotation for the master password.** Vault's database
  secrets engine issues short-lived *application* credentials fine; the
  *master* credential `aws_db_instance` creates still needs a rotation
  policy of its own (e.g. Vault's `rotate-root` on the database
  connection) before this is production-ready.

## Module layout

| Module | Provisions |
|---|---|
| `modules/aws-network` | VPC, private subnets, DB subnet group, RDS security group |
| `modules/aws-database` | RDS Postgres instance (master credential only used by Vault) |
| `modules/aws-oidc-trust` | AWS IAM OIDC provider + role trusting Vercel's OIDC tokens directly (for AWS-native services outside of Vault) |
| `modules/hcp-vault` | HCP HVN, AWS peering, HCP Vault Dedicated cluster |
| `modules/vault-config` | JWT auth backend (trusts Vercel), database secrets engine (dynamic RDS creds), KV mount (static app secrets) |
| `modules/vercel-project` | The Vercel project itself + non-secret env vars pointing at Vault/RDS |
