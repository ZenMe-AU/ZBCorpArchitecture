//Create the resources to make sso inside on entra possible with aws

# Use the AWS gallery template so the enterprise app is created as
# "AWS Single-Account Access" instead of a custom SAML app.
data "azuread_application_template" "aws_single_account_access" {
  display_name = "AWS Single-Account Access"
}

resource "azuread_application_from_template" "aws_sso_corp" {
  display_name = var.app_name
  template_id  = data.azuread_application_template.aws_single_account_access.template_id
}

data "azuread_application" "aws_sso_corp" {
  object_id = azuread_application_from_template.aws_sso_corp.application_object_id
}

locals {
  # App-specific federation metadata endpoint for the AWS Single-Account Access app.
  aws_sso_federation_metadata_url = format(
    "https://login.microsoftonline.com/%s/federationmetadata/2007-06/federationmetadata.xml?appid=%s",
    var.tenant_id,
    data.azuread_application.aws_sso_corp.client_id
  )
}

data "http" "entra_federation_metadata" {
  url = local.aws_sso_federation_metadata_url
  request_headers = {
    Accept = "application/xml"
  }
}

# resource "local_file" "entra_metadata" {
#   content  = data.http.entra_federation_metadata.response_body
#   filename = "${path.module}/federationmetadata.xml"
# }

resource "aws_iam_saml_provider" "entra_c" {
  name                   = var.identity_provider_name
  saml_metadata_document = data.http.entra_federation_metadata.response_body

  lifecycle {
    # Ignore changes to the SAML metadata document, manually update if needed
    ignore_changes = [saml_metadata_document]
  }
}

data "aws_iam_policy_document" "role_policy" {
  statement {
    effect    = "Allow"
    actions   = ["*"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "azuread_sso_user_role_policy_c" {
  name   = var.role_policy_name
  policy = data.aws_iam_policy_document.role_policy.json
}

# resource "aws_iam_user" "azuread_role_manager_c" {
#   name = var.user_name
# }

# resource "aws_iam_user_policy_attachment" "azuread_role_manager_c" {
#   user       = aws_iam_user.azuread_role_manager_c.name
#   policy_arn = aws_iam_policy.azuread_sso_user_role_policy_c.arn
# }

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithSAML"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_saml_provider.entra_c.arn]
    }
    # recommended but optional condition to ensure the role is only assumable in the context of AWS SSO
    # condition {
    #   test     = "StringEquals"
    #   variable = "SAML:aud"
    #   values   = ["https://signin.aws.amazon.com/saml"]
    # }
  }
}

resource "aws_iam_role" "entra_id_admin_access_c" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_iam_role_policy_attachment" "entra_id_admin_access_c" {
  role       = aws_iam_role.entra_id_admin_access_c.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# Intentionally no post-apply provisioners:
# this stage now deploys only resources that are directly represented in Terraform.

# Output the application details
output "application_id" {
  description = "The Application (Client) ID"
  value       = azuread_application_from_template.aws_sso_corp.application_id
}

output "object_id" {
  description = "The Object ID of the Enterprise Application (service principal)"
  value       = azuread_application_from_template.aws_sso_corp.service_principal_object_id
}

output "federation_metadata_url" {
  description = "Federation metadata URL used for IAM SAML provider creation"
  value       = local.aws_sso_federation_metadata_url
}

output "aws_iam_saml_provider_arn" {
  description = "ARN of the IAM SAML provider created in AWS"
  value       = aws_iam_saml_provider.entra_c.arn
}

output "aws_iam_policy_arn" {
  description = "ARN of the IAM policy created for Azure AD SSO user role access"
  value       = aws_iam_policy.azuread_sso_user_role_policy_c.arn
}

# output "aws_iam_user_name" {
#   description = "Name of the IAM user created for Azure AD role management"
#   value       = aws_iam_user.azuread_role_manager_c.name
# }

output "aws_iam_role_arn" {
  description = "ARN of the Entra-backed IAM administrator role"
  value       = aws_iam_role.entra_id_admin_access_c.arn
}
