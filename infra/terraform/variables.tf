variable "environment" {
  description = "Environment name, used to tag/name resources (dev, qa, staging)."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for the network, RDS instance, and OIDC trust."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for Meridian's VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance class. Small on purpose — this is a demo-scale workload."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  type    = string
  default = "meridian"
}

variable "db_master_username" {
  description = "Master username for the RDS instance. Vault manages app-level dynamic credentials on top of this; this master credential is only used by Vault's database secrets engine to create/revoke them."
  type        = string
  default     = "vault_root"
}

variable "vercel_oidc_issuer" {
  description = "Vercel's OIDC issuer URL for this team, used by both the AWS IAM OIDC trust and the Vault JWT auth backend. Format: https://oidc.vercel.com/<team-slug>. See https://vercel.com/docs/oidc"
  type        = string
}

variable "vercel_team_slug" {
  description = "Vercel team slug that owns the project (used by the vercel provider and to construct the OIDC issuer/audience)."
  type        = string
}

variable "vercel_project_name" {
  type    = string
  default = "meridian-migration-demo"
}

variable "hcp_hvn_region" {
  description = "HCP HashiCorp Virtual Network region — should match aws_region for peering."
  type        = string
  default     = "us-east-1"
}

variable "vault_addr" {
  description = "HCP Vault cluster address. Required for the second `terraform apply` pass (see README.md) once modules/hcp-vault has created the cluster — leave blank on the first pass."
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "owner/repo of the public GitHub repository (this repo, once you've pushed it) that the Vercel project deploys from."
  type        = string
}

variable "auth_secret" {
  description = "Session cookie signing secret, written into Vault's KV mount as a static application/configuration secret."
  type        = string
  sensitive   = true
}
