# Root wiring. Apply in two passes — see README.md for the exact commands
# — because the vault provider needs a live cluster address/token that
# only exists after modules/hcp-vault has already been applied once.
#
#   Pass 1: everything except module.vault_config and module.vercel_project
#           (target aws-network, aws-database, aws-oidc-trust, hcp-vault)
#   Pass 2: full apply, with VAULT_ADDR/VAULT_TOKEN exported from Pass 1's
#           outputs, which also brings up vault-config and vercel-project.

data "aws_caller_identity" "current" {}

module "aws_network" {
  source = "./modules/aws-network"

  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  hvn_cidr    = var.hvn_cidr
}

module "aws_database" {
  source = "./modules/aws-database"

  environment            = var.environment
  db_instance_class      = var.db_instance_class
  db_name                = var.db_name
  db_master_username     = var.db_master_username
  db_subnet_group_name   = module.aws_network.db_subnet_group_name
  rds_security_group_id  = module.aws_network.rds_security_group_id
}

module "aws_oidc_trust" {
  source = "./modules/aws-oidc-trust"

  environment          = var.environment
  vercel_oidc_issuer   = var.vercel_oidc_issuer
  vercel_team_slug     = var.vercel_team_slug
  vercel_project_name  = var.vercel_project_name
}

module "hcp_vault" {
  source = "./modules/hcp-vault"

  environment    = var.environment
  hcp_hvn_region = var.hcp_hvn_region
  hvn_cidr       = var.hvn_cidr
  aws_vpc_id     = module.aws_network.vpc_id
  aws_vpc_cidr   = module.aws_network.vpc_cidr
  aws_account_id = data.aws_caller_identity.current.account_id
  aws_region     = var.aws_region
}

# Accepts, on the AWS side, the peering connection HCP's HVN initiates
# toward Meridian's VPC (see modules/hcp-vault's hcp_aws_network_peering).
resource "aws_vpc_peering_connection_accepter" "hcp_vault" {
  vpc_peering_connection_id = module.hcp_vault.aws_peering_connection_id
  auto_accept                = true

  tags = {
    Name = "meridian-${var.environment}-hcp-vault-peering"
  }
}

# Route on the HVN side directing traffic destined for the AWS VPC CIDR
# through the peering connection. Placed here (not inside modules/hcp-vault)
# so it can depend on aws_vpc_peering_connection_accepter — the peering must
# be ACTIVE (accepted on the AWS side) before HCP will accept the route.
resource "hcp_hvn_route" "main" {
  hvn_link         = module.hcp_vault.hvn_self_link
  hvn_route_id     = "meridian-${var.environment}-to-vpc"
  destination_cidr = module.aws_network.vpc_cidr
  target_link      = module.hcp_vault.peering_self_link

  depends_on = [aws_vpc_peering_connection_accepter.hcp_vault]
}

# Route on the AWS side directing traffic destined for the HVN CIDR
# through the accepted VPC peering connection.
resource "aws_route" "hcp_vault" {
  route_table_id            = module.aws_network.private_route_table_id
  destination_cidr_block    = var.hvn_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection_accepter.hcp_vault.id
}

# --- Pass 2 only (requires VAULT_ADDR/VAULT_TOKEN — see README.md) ---

module "vault_config" {
  source = "./modules/vault-config"

  environment          = var.environment
  vercel_oidc_issuer   = var.vercel_oidc_issuer
  vercel_team_slug     = var.vercel_team_slug
  vercel_project_name  = var.vercel_project_name

  rds_endpoint         = module.aws_database.endpoint
  rds_port             = module.aws_database.port
  rds_db_name          = module.aws_database.db_name
  rds_master_username  = module.aws_database.master_username
  rds_master_password  = module.aws_database.master_password

  auth_secret = var.auth_secret
}

module "vercel_project" {
  source = "./modules/vercel-project"

  vercel_project_name = var.vercel_project_name
  github_repo         = var.github_repo

  vault_addr          = module.hcp_vault.vault_addr
  vault_jwt_role_name = module.vault_config.jwt_role_name
  vault_db_role_name  = module.vault_config.db_role_name

  rds_endpoint = module.aws_database.endpoint
  rds_port     = module.aws_database.port
  rds_db_name  = module.aws_database.db_name
}
