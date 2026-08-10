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

variable "vault_jwt_role_name" {
  type = string
}

variable "vault_db_role_name" {
  type = string
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
