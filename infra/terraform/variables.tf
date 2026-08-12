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

variable "hcp_project_id" {
  description = "HCP project ID for the meridian-demo project. Find it in the HCP portal URL: portal.cloud.hashicorp.com/orgs/.../projects/<this-id>/..."
  type        = string
}

variable "hcp_hvn_region" {
  description = "HCP HashiCorp Virtual Network region — should match aws_region for peering."
  type        = string
  default     = "us-east-1"
}

variable "hvn_cidr" {
  description = "CIDR for the HCP HVN — must not overlap with vpc_cidr."
  type        = string
  default     = "172.25.16.0/20"
}

variable "vault_public_endpoint" {
  description = "Whether the HCP Vault cluster exposes a public endpoint. Defaults to false — Vault is reached only via the HVN peering + Vercel Secure Compute. Set to true temporarily only if Step 5's terraform apply can't reach the private endpoint (no network path into the peered VPC), then set back to false and re-apply once module.vault_config has been configured."
  type        = bool
  default     = false
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
