# Configures Vault itself once the cluster exists (modules/hcp-vault).
# This is the module that makes the boundary-crossing pattern in
# solution-architecture.md / lib/vault.ts real:
#
#   1. JWT auth backend trusting Vercel's OIDC issuer — lets a Vercel
#      Function exchange its VERCEL_OIDC_TOKEN for a short-lived Vault
#      token, no static Vault token ever stored in Vercel env vars.
#   2. Database secrets engine against the RDS instance — issues
#      short-lived, TTL-bound Postgres credentials per invocation instead
#      of a standing application password.
#   3. A KV mount for static application/configuration secrets (anything
#      that isn't a rotatable DB credential — e.g. the session signing
#      secret) — this is the "application secrets and configuration
#      secrets" half of the original requirement, as distinct from the
#      dynamic DB credentials above.

# ---------------------------------------------------------------------------
# 1. JWT/OIDC auth method trusting Vercel as an identity provider
# ---------------------------------------------------------------------------

resource "vault_jwt_auth_backend" "vercel" {
  path               = "jwt"
  oidc_discovery_url = var.vercel_oidc_issuer
  bound_issuer       = var.vercel_oidc_issuer
}

resource "vault_policy" "app" {
  name   = "meridian-app-${var.environment}"
  policy = <<-EOT
    path "database/creds/${var.db_role_name}" {
      capabilities = ["read"]
    }
    path "kv/data/meridian/${var.environment}/*" {
      capabilities = ["read"]
    }
  EOT
}

resource "vault_jwt_auth_backend_role" "vercel_app" {
  backend        = vault_jwt_auth_backend.vercel.path
  role_name      = var.jwt_role_name
  token_policies = [vault_policy.app.name]

  role_type       = "jwt"
  user_claim      = "sub"
  bound_audiences = [var.vercel_oidc_issuer]

  # Scopes which Vercel deployments can authenticate as this role — only
  # this project, in this environment. A preview deployment for a
  # different project (or a different Vercel team) cannot obtain these
  # credentials even with a validly-signed OIDC token.
  bound_claims = {
    sub = "owner:${var.vercel_team_slug}:project:${var.vercel_project_name}:environment:${var.environment}"
  }
  bound_claims_type = "glob"

  token_ttl     = 300 # 5 minutes — matches the short-lived-by-design pattern
  token_max_ttl = 900
}

# ---------------------------------------------------------------------------
# 2. Database secrets engine — dynamic, TTL-bound Postgres credentials
# ---------------------------------------------------------------------------

resource "vault_mount" "db" {
  path = "database"
  type = "database"
}

resource "vault_database_secret_backend_connection" "rds" {
  backend       = vault_mount.db.path
  name          = "meridian-rds-${var.environment}"
  allowed_roles = [var.db_role_name]

  postgresql {
    connection_url = "postgresql://{{username}}:{{password}}@${var.rds_endpoint}:${var.rds_port}/${var.rds_db_name}?sslmode=require"
    username       = var.rds_master_username
    password       = var.rds_master_password
  }
}

resource "vault_database_secret_backend_role" "app" {
  backend     = vault_mount.db.path
  name        = var.db_role_name
  db_name     = vault_database_secret_backend_connection.rds.name
  default_ttl = 300 # 5 minutes — see lib/vault.ts credential caching
  max_ttl     = 3600
  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";",
  ]
  revocation_statements = [
    "REASSIGN OWNED BY \"{{name}}\" TO ${var.rds_master_username};",
    "DROP OWNED BY \"{{name}}\";",
    "DROP ROLE IF EXISTS \"{{name}}\";",
  ]
}

# ---------------------------------------------------------------------------
# 3. KV mount for static application/configuration secrets
# ---------------------------------------------------------------------------

resource "vault_mount" "kv" {
  path = "kv"
  type = "kv-v2"
}

resource "vault_kv_secret_v2" "app_config" {
  mount = vault_mount.kv.path
  name  = "meridian/${var.environment}/app-config"

  data_json = jsonencode({
    AUTH_SECRET = var.auth_secret
  })
}
