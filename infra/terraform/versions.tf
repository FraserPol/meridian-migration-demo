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
provider "hcp" {}

# Points at the cluster this same config creates (see modules/hcp-vault).
# Terraform can't provider-configure from a resource it hasn't created yet
# in a single apply, so the recommended pattern (and the one used here) is
# two-phase: apply hcp-vault first, then apply everything else with
# VAULT_ADDR / VAULT_TOKEN env vars pointed at the new cluster. See
# infra/terraform/README.md for the exact command sequence.
provider "vault" {
  address = var.vault_addr
}

# Configure via env var: VERCEL_API_TOKEN
provider "vercel" {
  team = var.vercel_team_slug
}
