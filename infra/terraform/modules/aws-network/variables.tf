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
