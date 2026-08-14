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

**Before Step 5:** install the Vercel GitHub App, or `module.vercel_project`
will fail with `Could not create project ... you need to install the GitHub
integration first`:

1. Go to [github.com/apps/vercel](https://github.com/apps/vercel) and click
   **Install** (or **Configure** if it's already installed somewhere).
2. When GitHub asks which account/org to install into, pick the account that
   owns `github_repo` — not a different org.
3. Under repository access, choose **All repositories**, or **Only select
   repositories** and check the one from `github_repo`.
4. Save. Confirm it under Vercel dashboard → your team → **Settings →
   Integrations** (or **Git**) — it should show GitHub as connected.

This is a one-time setup per Vercel team/GitHub account, not per project —
skip it if already done for this pair.

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

**Network access required for Step 5:** `vault_addr` resolves to the
cluster's *private* endpoint by default (`hcp_vault_cluster` is created with
`public_endpoint = false`) — reachable only through the HVN↔VPC peering
Step 3 created, never the public internet. The machine running `terraform
apply` in Step 5 must have a network path into that peering (e.g. an EC2
instance/bastion inside the VPC, or a VPN into it) or every `vault_*`
resource in `module.vault_config` will fail with `context deadline
exceeded` while the provider tries to reach it.

**No such network path? See "Working around Secure Compute" below** — the
same Enterprise-only limitation that blocks Step 6 also blocks this, and
both are worked around with the one `vault_public_endpoint` flag. Set it
before continuing to Step 5.

## Step 5: Second apply — configures Vault, creates the Vercel project

```bash
terraform apply
```

Type `yes` when prompted.

**Why the `vault` provider block has a `namespace`:** HCP Vault Dedicated
reserves the root namespace for HashiCorp's own platform operations — it's
not customer-accessible. Everything this apply creates (the JWT auth
backend, the `vercel-app` role, the database secrets engine, the KV mount)
actually lives under the `admin` namespace, confirmed directly against a
live cluster. `var.vault_namespace` (default `"admin"`) makes this
explicit on the Terraform side; the app needs the same value at runtime,
which is why `module.vercel_project` also sets a `VAULT_NAMESPACE` env var
— see `lib/vault.ts`'s `X-Vault-Namespace` header. If you ever see Vault
report a role or path as "not found" despite Terraform showing it as
created, this is almost certainly why — check Troubleshooting below.

**Why `module.vercel_project`'s `vercel_project` resource sets
`automatically_expose_system_environment_variables = true`:** without it,
`VERCEL_ENV`/`VERCEL_DEPLOYMENT_ID`/etc. are never populated into the
deployed Function's `process.env` — the Vercel provider's default is
`false`. This isn't hypothetical: it's exactly what broke the Migration
Copilot in production on 2026-08-13 (see README.md's Known limitations)
before this attribute was added — the Workflow SDK's Vercel-vs-local
detection depends on `VERCEL_DEPLOYMENT_ID` being present, and without it
every real chat message crashed. If you're applying this module against an
**already-existing** project created before this fix landed, Terraform
will show a diff for this attribute on your next `terraform apply` —
apply it.

## Step 6: Give the deployed app a path to Vault + RDS

The architecture in `solution-architecture.md` calls for **Vercel Secure
Compute** here: accept a VPC peering connection (Vercel project → Settings
→ Secure Compute) so the deployed app reaches Vault and RDS privately,
never over the public internet. **Secure Compute is an Enterprise-only
feature** — on Hobby/Pro it's not available at all (`Contact Sales`), so
this demo can't use it.

### Working around Secure Compute (demo-only)

Two settings substitute for Secure Compute so the app can still reach both
services, purely over the public internet with TLS + credential auth
instead of network-level isolation:

1. **Vault**: already handled if you followed Step 4's note —
   `vault_public_endpoint = true` in `terraform.tfvars` makes `vault_addr`
   (and therefore the app's `VAULT_ADDR` env var, set by
   `module.vercel_project`) resolve to Vault's public endpoint. Keep this
   `true` for as long as the demo runs without Secure Compute — the app
   needs it on every request, not just during setup.
2. **RDS**: set in `terraform.tfvars`:
   ```
   rds_publicly_accessible = true
   ```
   then re-apply:
   ```bash
   terraform apply -target=module.aws_network -target=module.aws_database
   ```
   This makes `aws_db_instance.main` publicly reachable and opens the RDS
   security group to inbound Postgres from `0.0.0.0/0` — Vercel Functions
   don't have a fixed outbound IP on Hobby/Pro, so there's no way to scope
   this tighter without a paid add-on (see below). The RDS master password
   is a strong random 32-character value never exposed as a Terraform
   output, and the app itself only ever uses Vault's short-lived dynamic
   credentials (5 min TTL) — but the database port itself is now exposed to
   the internet. Treat this as demo-only.

### Production recommendation

Don't run either workaround in a real deployment. Instead:

- **Vault + RDS private access**: use Vercel Secure Compute (requires
  Enterprise) — the original design in `solution-architecture.md`.
- **If Enterprise isn't an option**: [Vercel Static IPs](https://vercel.com/docs/networking/static-ips)
  (a paid Pro/Enterprise add-on, ~$100/mo/project as of this writing) gives
  the deployment a small fixed egress IP range, so the RDS security group
  can allowlist that range instead of `0.0.0.0/0` — meaningfully better than
  the open-internet workaround above, though still not equivalent to true
  network isolation.
- Either way, set `vault_public_endpoint = false` and
  `rds_publicly_accessible = false` and re-apply once a private path exists.

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

The Vercel project was created by `module.vercel_project` in Terraform, not
by `vercel link`/`vercel new` — so this checkout has no local
`.vercel/project.json` telling the CLI which project it maps to yet.
Link it once, from `meridian-migration-demo/` (this directory):

```bash
vercel link --yes --project meridian-migration-demo --scope <your-vercel-team-slug>
```

Use your own `vercel_project_name`/`vercel_team_slug` from `terraform.tfvars`
— `meridian-migration-demo` and `<your-vercel-team-slug>` above are only
this repo's own defaults. Without this, `vercel env rm` (and Step 9's
`vercel deploy`) fail with `Your codebase isn't linked to a project on
Vercel`.

```bash
vercel env rm DATABASE_URL production
```

Confirm `yes`. **If this errors with `Environment Variable was not found`,
that's expected, not a problem** — `module.vercel_project` never sets
`DATABASE_URL` in the first place, so this only removes something if you
previously ran `SETUP_INSTRUCTIONS.md`'s quick Neon-based setup against the
same project and are now graduating off it. Either way, the outcome is the
same: `DATABASE_URL` is unset for production. The `vercel_project` Terraform
module already set `VAULT_ADDR`, `VAULT_JWT_AUTH_ROLE`, `VAULT_DB_ROLE`,
`PGHOST`, `PGPORT`, and `PGDATABASE` — with `DATABASE_URL` gone,
`lib/vault.ts`'s `getDatabaseConnectionString()` takes the Vault path
automatically (see its fallback logic in `lib/vault.ts`).

## Step 9: Redeploy

```bash
vercel deploy --prod
```

**Done.** The app now resolves short-lived, TTL-bound Postgres credentials from
HCP Vault on every request — the exact pattern described in
`../solution-architecture.md`.

## Step 10: AI Gateway billing (for the Migration Copilot)

None of the above touches AI Gateway — the Migration Copilot is a separate
dependency with its own gate, unrelated to Vault/RDS being correctly wired.
Without this step the rest of the app works, but the Migration Copilot's
chat stream starts ("thinking…") and then fails:

1. Vercel dashboard → your team → **AI** → add a payment method. Without
   one, every Gateway call fails with a 403
   (`customer_verification_required`), even free-tier ones.
2. Top up (or enable auto top-up for) actual paid Gateway credits, same
   tab. A verified card alone doesn't unlock every model — some return a
   separate 403 ("Free tier users do not have access to this model") until
   the team has real paid credits, not just a card on file.

No Terraform variable or app code controls this — it's purely a Vercel
team-level billing setting. See `README.md`'s Known Limitations for how
this surfaces if skipped, and `scripts/verify-gateway-fallback.ts` for a
standalone script that confirms Gateway is actually serving requests
end-to-end.

---

## Troubleshooting

- **`terraform apply` fails on the vault provider in Step 5:** you likely
  skipped exporting `VAULT_ADDR`/`VAULT_TOKEN` in Step 4, or the cluster
  from Step 3 is still provisioning — check `terraform output vault_addr`
  resolves to something before retrying.
- **`terraform apply` fails on every single `vault_*` resource at once with
  `403`, `"failed to lookup token"`, `"invalid token"`:** different from
  the bullet above — this is a `VAULT_TOKEN` that *was* set but has since
  expired, not one that was never set. `hcp_vault_cluster_admin_token` (see
  Step 4) is a short-lived bootstrap token, not a credential meant for
  reuse across sessions — confirm with `terraform state show
  'module.hcp_vault.hcp_vault_cluster_admin_token.bootstrap'` and check
  `created_at`. Fix: force a fresh one and re-export it before retrying:
  ```bash
  terraform apply -replace="module.hcp_vault.hcp_vault_cluster_admin_token.bootstrap" -target=module.hcp_vault
  export VAULT_ADDR="$(terraform output -raw vault_addr)"
  export VAULT_TOKEN="$(terraform output -raw vault_bootstrap_admin_token)"
  terraform apply
  ```
- **HVN route stays in FAILED state:** the VPC peering accepter must be ACTIVE
  before HCP will accept the route — confirm the peering is accepted in the AWS
  console and re-run the Step 3 apply.
- **`Could not create project ... install the GitHub integration first` in
  Step 5:** see the GitHub App install steps under Step 2 — this has to be
  done once via the Vercel dashboard, Terraform can't do it for you.
- **App deploys fine but every DB read/write times out or hangs:** if
  Secure Compute isn't set up (see Step 6), the deployed app has no network
  path to RDS unless `rds_publicly_accessible = true` has been applied —
  check `terraform state show module.aws_database.aws_db_instance.main |
  grep publicly_accessible`.
- **`Your codebase isn't linked to a project on Vercel` on `vercel env rm`
  or `vercel deploy` (Steps 8–9):** see the `vercel link` command under
  Step 8 — Terraform created the project via the API, so this checkout was
  never linked locally the way `vercel link`/`vercel new` would do it.
- **Vault says a role or path "could not be found," but `terraform state
  show` confirms it exists:** see the namespace note under Step 5 — you're
  almost certainly hitting the resource without `X-Vault-Namespace: admin`.
  On the Terraform side this means the `vault` provider block is missing
  `namespace = var.vault_namespace`; on the app side it means
  `VAULT_NAMESPACE` isn't set or isn't reaching `lib/vault.ts`'s Vault API
  calls.
- **The Migration Copilot's chat stream starts, then the deployed Function
  logs `Cannot find module '.../.well-known/workflow/v1/flow/route.js'`
  followed by `VERCEL_DEPLOYMENT_ID environment variable is not set`:** the
  project's `automatically_expose_system_environment_variables` setting is
  `false` — see the note under Step 5. Fix it either by re-applying this
  module (it's set in Terraform now) or directly: `PATCH
  https://api.vercel.com/v10/projects/<project>?teamId=<team>` with body
  `{"autoExposeSystemEnvs": true}`, then redeploy (`vercel deploy --prod`)
  so the running Function actually picks it up — the setting alone doesn't
  restart existing deployments.
- **Everything above succeeds — DB reads work, login works — but the
  Migration Copilot's chat stream starts then fails:** this is unrelated to
  Terraform/Vault/RDS; see Step 10. It's an AI Gateway billing gate at the
  Vercel team level, not something this infra provisions.
- **Anything else:** see "Known limitations" in `README.md` and
  `infra/terraform/README.md`.
