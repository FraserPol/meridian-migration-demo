# Lets Vercel Functions assume an AWS IAM role directly via
# AssumeRoleWithWebIdentity, using Vercel's own OIDC token — no static AWS
# access keys stored anywhere. See solution-architecture.md Section 3,
# point 4: "The same OIDC pattern can hand the function short-lived AWS
# credentials directly if a call needs to reach an AWS-native service
# rather than going through Vault."
#
# This is separate from the Vault JWT trust in modules/vault-config —
# that one lets Vault itself trust Vercel's OIDC tokens for database
# credential issuance. This one is for anything the app needs to reach on
# AWS *without* going through Vault (e.g. a future S3 bucket, SES, etc.).
#
# Reference: https://vercel.com/docs/oidc/aws

data "tls_certificate" "vercel_oidc" {
  url = var.vercel_oidc_issuer
}

# Vercel's OIDC token's aud claim defaults to https://vercel.com/<team-slug>,
# NOT the oidc.vercel.com issuer URL above — the issuer and audience are two
# different Vercel domains. See https://vercel.com/docs/oidc/aws.
locals {
  vercel_oidc_audience = "https://vercel.com/${var.vercel_team_slug}"
}

resource "aws_iam_openid_connect_provider" "vercel" {
  url             = var.vercel_oidc_issuer
  client_id_list  = [local.vercel_oidc_audience]
  thumbprint_list = [data.tls_certificate.vercel_oidc.certificates[0].sha1_fingerprint]

  tags = {
    Name      = "vercel-oidc-${var.environment}"
    ManagedBy = "terraform"
  }
}

data "aws_iam_policy_document" "vercel_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.vercel.arn]
    }

    # Scope the trust to this specific Vercel project + environment so a
    # token minted for a different Vercel project can't assume this role.
    # https://vercel.com/docs/oidc/reference for the full claim set.
    condition {
      test     = "StringEquals"
      variable = "${replace(var.vercel_oidc_issuer, "https://", "")}:aud"
      values   = [local.vercel_oidc_audience]
    }

    condition {
      test     = "StringLike"
      variable = "${replace(var.vercel_oidc_issuer, "https://", "")}:sub"
      values   = ["owner:${var.vercel_team_slug}:project:${var.vercel_project_name}:environment:${var.vercel_deployment_environment}"]
    }
  }
}

resource "aws_iam_role" "vercel_app" {
  name               = "vercel-app-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.vercel_trust.json

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Deliberately no policy attachments here. This role is created with zero
# permissions on purpose — attach least-privilege, service-specific
# policies (e.g. a scoped S3 bucket policy) only as the app actually needs
# to reach a given AWS-native service directly, outside of Vault.
