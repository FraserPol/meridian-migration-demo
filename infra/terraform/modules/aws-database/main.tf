# The AWS RDS Postgres instance — the system of record that stays on AWS
# per solution-architecture.md Section 5 ("What Stays Outside Vercel").
# The app never talks to this using the master credential below; Vault's
# database secrets engine (see modules/vault-config) uses it to mint and
# revoke short-lived, per-invocation application credentials.

resource "random_password" "master" {
  length  = 32
  special = false # avoid characters that need extra escaping in connection strings
}

resource "aws_db_instance" "main" {
  identifier     = "meridian-${var.environment}"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_master_username
  password = random_password.master.result

  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = [var.rds_security_group_id]

  multi_az                = var.environment == "production"
  publicly_accessible     = var.publicly_accessible
  deletion_protection     = var.environment == "production"
  skip_final_snapshot     = var.environment != "production"
  backup_retention_period = var.environment == "production" ? 7 : 1
  # false (the aws provider default) would otherwise queue changes like
  # publicly_accessible for the next weekly maintenance window instead of
  # applying them now. Fine for a non-prod demo instance; a real production
  # database should keep the default off-hours-scheduled behavior.
  apply_immediately = var.environment != "production"

  tags = {
    Name        = "meridian-${var.environment}"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# The master password is stored in Terraform state (as AWS credentials
# always are for aws_db_instance) and is intentionally NOT an output of
# this module — it is written directly into Vault as part of
# modules/vault-config's database secrets engine connection config, so it
# never needs to appear in a human-readable output or in the app's own
# environment variables. See infra/terraform/main.tf for the wiring.
