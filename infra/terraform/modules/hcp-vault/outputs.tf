output "vault_addr" {
  description = "Feed this into VAULT_ADDR (root variables.tf) for the second terraform apply pass, and into the app's VAULT_ADDR env var."
  value       = hcp_vault_cluster.main.public_endpoint ? hcp_vault_cluster.main.vault_public_endpoint_url : hcp_vault_cluster.main.vault_private_endpoint_url
}

output "cluster_id" {
  value = hcp_vault_cluster.main.cluster_id
}

output "aws_peering_connection_id" {
  description = "AWS-side VPC peering connection ID that HCP's HVN peering created — accepted by aws_vpc_peering_connection_accepter in the root module."
  value       = hcp_aws_network_peering.main.provider_peering_id
}

output "hvn_self_link" {
  description = "Self-link of the HVN — used by hcp_hvn_route in the root module (where it can depend on the peering accepter)."
  value       = hcp_hvn.main.self_link
}

output "peering_self_link" {
  description = "Self-link of the HCP network peering — used by hcp_hvn_route in the root module."
  value       = hcp_aws_network_peering.main.self_link
}

output "bootstrap_admin_token" {
  description = "One-time admin token for configuring auth methods/secrets engines in modules/vault-config. Not for application use."
  value       = hcp_vault_cluster_admin_token.bootstrap.token
  sensitive   = true
}
