output "vpc_id" {
  value = module.aws_network.vpc_id
}

output "rds_endpoint" {
  value = module.aws_database.endpoint
}

output "vault_addr" {
  description = "Feed this into VAULT_ADDR (both the root variable, for pass 2, and the app's own env var / vercel-project module input)."
  value       = module.hcp_vault.vault_addr
}

output "vault_bootstrap_admin_token" {
  value     = module.hcp_vault.bootstrap_admin_token
  sensitive = true
}

output "vercel_iam_role_arn" {
  description = "For any AWS-native service the app needs to reach directly via OIDC, bypassing Vault (see modules/aws-oidc-trust)."
  value       = module.aws_oidc_trust.role_arn
}

output "rds_master_username" {
  description = "For the one-time migration bootstrap only (SETUP_INSTRUCTIONS.md Part 2, Step 9) — the running app never uses this, only Vault's dynamic app credentials."
  value       = module.aws_database.master_username
}

output "rds_master_password" {
  description = "For the one-time migration bootstrap only (SETUP_INSTRUCTIONS.md Part 2, Step 9)."
  value       = module.aws_database.master_password
  sensitive   = true
}
