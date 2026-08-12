variable "environment" {
  type = string
}

variable "vercel_oidc_issuer" {
  type = string
}

variable "vercel_team_slug" {
  type = string
}

variable "vercel_project_name" {
  type = string
}

variable "vercel_deployment_environment" {
  description = "Vercel's own OIDC 'environment' claim value — one of production, preview, or development (see https://vercel.com/docs/oidc/aws). Distinct from var.environment, which is only an internal AWS/HCP resource-naming convention (e.g. \"dev\") and never appears in a real Vercel OIDC token."
  type        = string
  default     = "production"
}
