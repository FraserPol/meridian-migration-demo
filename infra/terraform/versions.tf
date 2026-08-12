terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    hcp = {
      source  = "hashicorp/hcp"
      version = "~> 0.100"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "~> 4.0"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 1.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Swap for a remote backend (S3 + DynamoDB lock table, or HCP Terraform)
  # before anyone but you runs this. Left as local state on purpose so the
  # repo is runnable standalone for review.
  backend "local" {
    path = "terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region
}

# Configure via env vars: HCP_CLIENT_ID / HCP_CLIENT_SECRET
# project_id pins all HCP resources to the meridian-demo project; without
# this, the provider defaults to the oldest project in the org (a footgun
# when multiple projects exist).
provider "hcp" {
  project_id = var.hcp_project_id
}

# Points at the cluster this same config creates (see modules/hcp-vault).
# Terraform can't provider-configure from a resource it hasn't created yet
# in a single apply, so the recommended pattern (and the one used here) is
# two-phase: apply hcp-vault first, then apply everything else with
# VAULT_ADDR / VAULT_TOKEN env vars pointed at the new cluster. See
# infra/terraform/README.md for the exact command sequence.
#
# namespace is required, not optional: HCP Vault Dedicated reserves the
# root namespace for HashiCorp's platform operations (not customer
# accessible) and every resource this config creates actually lives under
# "admin/" — this was previously implicit only because VAULT_TOKEN happens
# to be homed in that namespace by default, which the app's own runtime
# Vault calls have no equivalent of (see lib/vault.ts's X-Vault-Namespace
# header, var.vault_namespace).
provider "vault" {
  address   = var.vault_addr
  namespace = var.vault_namespace
}

# Configure via env var: VERCEL_API_TOKEN
provider "vercel" {
  team = var.vercel_team_slug
}
