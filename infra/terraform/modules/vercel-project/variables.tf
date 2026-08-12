variable "vercel_project_name" {
  type = string
}

variable "github_repo" {
  description = "owner/repo of the public GitHub repository this Vercel project deploys from."
  type        = string
}

variable "vault_addr" {
  type = string
}

variable "vault_namespace" {
  description = "Vault namespace the app must send as X-Vault-Namespace on every request — see infra/terraform/versions.tf's provider \"vault\" block for why this isn't optional on HCP Vault Dedicated."
  type        = string
}

variable "vault_jwt_role_name" {
  type = string
}

variable "vault_db_role_name" {
  type = string
}

variable "vault_kv_app_config_path" {
  description = "Full KV-v2 data path Vault stores AUTH_SECRET under — see modules/vault-config's kv_app_config_path output."
  type        = string
}

variable "rds_endpoint" {
  type = string
}

variable "rds_port" {
  type = number
}

variable "rds_db_name" {
  type = string
}
