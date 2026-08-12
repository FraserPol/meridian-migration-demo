variable "environment" {
  type = string
}

variable "db_instance_class" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_master_username" {
  type = string
}

variable "db_subnet_group_name" {
  type = string
}

variable "rds_security_group_id" {
  type = string
}

variable "publicly_accessible" {
  description = "DEMO-ONLY escape hatch — see aws-network's allow_public_rds_access. Defaults to false; not for production."
  type        = bool
  default     = false
}
