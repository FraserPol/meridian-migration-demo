output "role_arn" {
  value = aws_iam_role.vercel_app.arn
}

output "oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.vercel.arn
}
