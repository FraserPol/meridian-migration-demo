# Provisions the HCP Vault Dedicated cluster referenced throughout
# solution-architecture.md as the customer's secrets control plane, plus
# an HVN (HashiCorp Virtual Network) peered to Meridian's AWS VPC so the
# database secrets engine (modules/vault-config) can reach RDS.
#
# NOTE: this uses HCP Vault Dedicated (a full Vault server), not the
# lighter-weight "HCP Vault Secrets" product, because the architecture
# depends on two Vault Dedicated-only features: the JWT/OIDC auth method
# (to trust Vercel's OIDC issuer) and the database secrets engine (to
# issue dynamic, TTL-bound Postgres credentials). See README.md's "Known
# limitations" for the cost/lead-time trade-off this implies.

resource "hcp_hvn" "main" {
  hvn_id         = "meridian-${var.environment}"
  cloud_provider = "aws"
  region         = var.hcp_hvn_region
  cidr_block     = var.hvn_cidr
}

# Peers the HVN to Meridian's existing AWS VPC so Vault can reach RDS to
# issue/revoke dynamic credentials. Accepting this on the AWS side
# requires the aws_vpc_peering_connection_accepter — wired up in
# infra/terraform/main.tf once both this module and aws-network exist.
resource "hcp_aws_network_peering" "main" {
  hvn_id          = hcp_hvn.main.hvn_id
  peering_id      = "meridian-${var.environment}"
  peer_vpc_id     = var.aws_vpc_id
  peer_account_id = var.aws_account_id
  peer_vpc_region = var.aws_region
}

resource "hcp_hvn_route" "main" {
  hvn_link         = hcp_hvn.main.self_link
  hvn_route_id     = "meridian-${var.environment}-to-vpc"
  destination_cidr = var.aws_vpc_cidr
  target_link      = hcp_aws_network_peering.main.self_link
}

resource "hcp_vault_cluster" "main" {
  cluster_id      = "meridian-${var.environment}"
  hvn_id          = hcp_hvn.main.hvn_id
  tier            = var.vault_tier
  public_endpoint = false # reached only via the HVN peering + Vercel Secure Compute, never the public internet
}

resource "hcp_vault_cluster_admin_token" "bootstrap" {
  cluster_id = hcp_vault_cluster.main.cluster_id
}
