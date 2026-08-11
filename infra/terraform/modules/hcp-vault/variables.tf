variable "environment" {
  type = string
}

variable "hcp_hvn_region" {
  type = string
}

variable "hvn_cidr" {
  description = "CIDR for the HCP HVN — must not overlap with the AWS VPC CIDR it peers to."
  type        = string
  default     = "172.25.16.0/20"
}

variable "vault_tier" {
  description = "HCP Vault cluster tier. plus_small is the minimum tier that includes the database secrets engine and namespaces for a production-grade setup; dev is the cheapest option for pure demo purposes."
  type        = string
  default     = "dev"
}

variable "aws_vpc_id" {
  type = string
}

variable "aws_vpc_cidr" {
  type = string
}

variable "aws_account_id" {
  type = string
}

variable "aws_region" {
  type = string
}
