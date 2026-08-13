# Creates the Vercel project and wires the environment variables the app
# needs for the Vault-backed path (see .env.example / lib/vault.ts).
#
# Notably absent: DATABASE_URL, AI_GATEWAY_API_KEY, and any Vault token.
# Those are either the local-dev-only fallback (DATABASE_URL) or handled
# entirely by Vercel OIDC Federation (AI Gateway auth, Vault auth) — see
# solution-architecture.md Section 3. There is nothing static to rotate
# here by design.
#
# target = ["production"] only, deliberately: this demo provisions a single
# RDS/Vault backend, not a separate preview-safe one, and
# modules/vault-config's JWT role only trusts Vercel's environment:production
# claim (see var.vercel_deployment_environment) — preview deployments get no
# Vault/RDS env vars at all rather than silently sharing production access.

resource "vercel_project" "app" {
  name      = var.vercel_project_name
  framework = "nextjs"

  git_repository = {
    type = "github"
    repo = var.github_repo # "your-org/your-repo"
  }

  # Without this, VERCEL_ENV/VERCEL_DEPLOYMENT_ID/etc. are never populated
  # in process.env at runtime — the provider's default is false. Confirmed
  # the hard way: with this off, the Migration Copilot's DurableAgent
  # workflow crashed on every real chat message in production
  # ("Cannot find module '.../.well-known/workflow/v1/flow/route.js'",
  # then "VERCEL_DEPLOYMENT_ID environment variable is not set") — the
  # Workflow SDK's Vercel World integration (workflows/migration-copilot/
  # workflow.ts, via @workflow/next) depends on VERCEL_DEPLOYMENT_ID being
  # present to know which deployment a run belongs to (see
  # node_modules/workflow/docs/deploying/world/vercel-world.mdx
  # "Versioning"). See README.md "Known limitations."
  automatically_expose_system_environment_variables = true
}

resource "vercel_project_environment_variable" "vault_addr" {
  project_id = vercel_project.app.id
  key        = "VAULT_ADDR"
  value      = var.vault_addr
  target     = ["production"]
}

resource "vercel_project_environment_variable" "vault_namespace" {
  project_id = vercel_project.app.id
  key        = "VAULT_NAMESPACE"
  value      = var.vault_namespace
  target     = ["production"]
}

resource "vercel_project_environment_variable" "vault_jwt_role" {
  project_id = vercel_project.app.id
  key        = "VAULT_JWT_AUTH_ROLE"
  value      = var.vault_jwt_role_name
  target     = ["production"]
}

resource "vercel_project_environment_variable" "vault_db_role" {
  project_id = vercel_project.app.id
  key        = "VAULT_DB_ROLE"
  value      = var.vault_db_role_name
  target     = ["production"]
}

resource "vercel_project_environment_variable" "vault_kv_app_config_path" {
  project_id = vercel_project.app.id
  key        = "VAULT_KV_APP_CONFIG_PATH"
  value      = var.vault_kv_app_config_path
  target     = ["production"]
}

resource "vercel_project_environment_variable" "pghost" {
  project_id = vercel_project.app.id
  key        = "PGHOST"
  value      = var.rds_endpoint
  target     = ["production"]
}

resource "vercel_project_environment_variable" "pgport" {
  project_id = vercel_project.app.id
  key        = "PGPORT"
  value      = tostring(var.rds_port)
  target     = ["production"]
}

resource "vercel_project_environment_variable" "pgdatabase" {
  project_id = vercel_project.app.id
  key        = "PGDATABASE"
  value      = var.rds_db_name
  target     = ["production"]
}

# Secure Compute itself (VPC peering acceptance between Vercel's network
# and the AWS VPC) is set up interactively from the Vercel dashboard as of
# this writing — see README.md "Known limitations" for why that step
# isn't in this module.
