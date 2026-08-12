output "jwt_auth_path" {
  value = vault_jwt_auth_backend.vercel.path
}

output "jwt_role_name" {
  value = vault_jwt_auth_backend_role.vercel_app.role_name
}

output "db_role_name" {
  value = vault_database_secret_backend_role.app.name
}

output "kv_app_config_path" {
  description = "Full KV-v2 data path (mount/data/name) for the app-config secret, for the app's runtime GET — see lib/vault.ts."
  value       = "${vault_mount.kv.path}/data/${vault_kv_secret_v2.app_config.name}"
}
