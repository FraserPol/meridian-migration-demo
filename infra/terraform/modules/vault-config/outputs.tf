output "jwt_auth_path" {
  value = vault_jwt_auth_backend.vercel.path
}

output "jwt_role_name" {
  value = vault_jwt_auth_backend_role.vercel_app.role_name
}

output "db_role_name" {
  value = vault_database_secret_backend_role.app.name
}
