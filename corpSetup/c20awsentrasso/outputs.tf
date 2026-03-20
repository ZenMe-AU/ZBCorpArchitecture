
# Intentionally no post-apply provisioners:
# this stage now deploys only resources that are directly represented in Terraform.

# Output the application details

# output "application_id" {
#   description = "The Application (Client) ID"
#   value       = azuread_application_from_template.aws_sso_corp.application_id
# }

# output "object_id" {
#   description = "The Object ID of the Enterprise Application (service principal)"
#   value       = azuread_application_from_template.aws_sso_corp.service_principal_object_id
# }

# output "federation_metadata_url" {
#   description = "Federation metadata URL used for IAM SAML provider creation"
#   value       = local.aws_sso_federation_metadata_url
# }

# output "aws_iam_saml_provider_arn" {
#   description = "ARN of the IAM SAML provider created in AWS"
#   value       = aws_iam_saml_provider.entra_c.arn
# }

# output "aws_iam_policy_arn" {
#   description = "ARN of the IAM policy created for Azure AD SSO user role access"
#   value       = aws_iam_policy.azuread_sso_user_role_policy_c.arn
# }

# output "aws_iam_user_name" {
#   description = "Name of the IAM user created for Azure AD role management"
#   value       = aws_iam_user.azuread_role_manager_c.name
# }

# output "aws_iam_role_arn" {
#   description = "ARN of the Entra-backed IAM administrator role"
#   value       = aws_iam_role.entra_id_admin_access_c.arn
# }
