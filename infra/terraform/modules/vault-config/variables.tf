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
