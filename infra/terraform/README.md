# Infrastructure: Terraform

Provisions the "what stays outside Vercel" half of `solution-architecture.md`:
an AWS VPC + RDS Postgres instance, an HCP Vault Dedicated cluster peered
into that VPC, Vault's JWT/OIDC trust of Vercel plus its database secrets
engine, an AWS IAM OIDC trust for anything the app needs directly on AWS,
and (optionally) the Vercel project itself.

**This has since been applied for real** against live AWS/HCP/Vercel
accounts, end to end through `PRODUCTION_SETUP.md` — not just
`terraform validate`/`plan`. That run surfaced (and this repo now fixes)
several bugs that hand-review alone missed: `modules/hcp-vault`'s
`vault_addr` output comparing a possibly-`null` attribute against `""`
instead of checking `public_endpoint` directly; `modules/aws-oidc-trust`
and `modules/vault-config` both using the OIDC *issuer* URL where Vercel's
token `aud` claim actually needs a different URL, and both using an
internal `environment` naming convention ("dev") where Vercel's real OIDC
`environment` claim needed `production`; and HCP Vault Dedicated requiring
every request to carry `X-Vault-Namespace: admin` (root is reserved for
HashiCorp's own platform operations) — none of which surface in
`terraform plan`, only in a real `apply` plus a real login attempt. See
`PRODUCTION_SETUP.md`'s Troubleshooting section and the git history for
specifics if you're debugging something similar.

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

## Vault namespace

The `vault` provider block sets `namespace = var.vault_namespace` (default
`"admin"`). HCP Vault Dedicated reserves the root namespace for
HashiCorp's own platform operations — every resource this config creates
(JWT auth backend, database secrets engine, KV mount) actually lives under
`admin/`, not root. This has to be explicit on both sides: the provider
config here, and a `VAULT_NAMESPACE` env var on the app
(`module.vercel_project` → `lib/vault.ts`'s `X-Vault-Namespace` header).
Terraform's own bootstrap token happens to default into `admin/`, which is
why this was easy to miss by hand-review alone — see
`PRODUCTION_SETUP.md`'s Step 5 note and Troubleshooting section.

## What this does NOT automate

- **Secure Compute VPC peering between Vercel and this AWS VPC.** Beyond
  not being a stable Terraform resource in the `vercel/vercel` provider
  yet, **Secure Compute itself is an Enterprise-only Vercel feature** — on
  Hobby/Pro the dashboard just says "Contact Sales," so this can't be set
  up at all on those plans, not just "not yet automated." `terraform.tfvars`
  has `vault_public_endpoint`/`rds_publicly_accessible` escape hatches for
  reaching Vault/RDS over the public internet instead — see
  `PRODUCTION_SETUP.md`'s Step 6 for the full workaround and why it's
  demo-only, not a production recommendation.
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
