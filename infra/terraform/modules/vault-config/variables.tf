variable "environment" {
  type = string
}

variable "vercel_oidc_issuer" {
  type = string
}

variable "vercel_team_slug" {
  type = string
}

variable "vercel_project_name" {
  type = string
}

variable "vercel_deployment_environment" {
  description = "Vercel's own OIDC 'environment' claim value — one of production, preview, or development (see https://vercel.com/docs/oidc/aws). Distinct from var.environment, which is only an internal Vault-path/resource-naming convention (e.g. \"dev\") and never appears in a real Vercel OIDC token."
  type        = string
  default     = "production"
}

variable "jwt_role_name" {
  type    = string
  default = "vercel-app"
}

variable "db_role_name" {
  type    = string
  default = "meridian-app-role"
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

variable "rds_master_username" {
  type = string
}

variable "rds_master_password" {
  type      = string
  sensitive = true
}

variable "auth_secret" {
  description = "Session cookie signing secret, stored in Vault's KV mount alongside the dynamic DB credentials — the 'application secrets and configuration secrets' half of the Vault requirement."
  type        = string
  sensitive   = true
}
