variable "environment" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "hvn_cidr" {
  description = "CIDR block of the HCP HVN — used to allow Vault to reach RDS over the VPC peering."
  type        = string
}

variable "allow_public_rds_access" {
  description = "DEMO-ONLY escape hatch: opens the RDS security group to inbound Postgres from the public internet (0.0.0.0/0), for when Vercel Secure Compute (Enterprise-only) isn't available to give the deployed app a private path to RDS. Defaults to false. Do not enable this for a real deployment — use Secure Compute or Vercel Static IPs instead (see PRODUCTION_SETUP.md)."
  type        = bool
  default     = false
}
