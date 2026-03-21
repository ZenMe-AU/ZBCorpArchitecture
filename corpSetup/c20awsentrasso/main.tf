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
  # Refresh after identifier URI is set by msgraph resources
  depends_on = [
    msgraph_resource_action.add_identifier_uri,
  ]
}

locals {
  # App-specific federation metadata endpoint for the AWS Single-Account Access app.
  aws_sso_federation_metadata_url = format(
    "https://login.microsoftonline.com/%s/federationmetadata/2007-06/federationmetadata.xml?appid=%s",
    var.tenant_id,
    data.azuread_application.aws_sso_corp.client_id
  )
  federation_metadata_path = "${path.module}/federationmetadata.xml"
}

data "http" "entra_federation_metadata" {
  url = local.aws_sso_federation_metadata_url
  request_headers = {
    Accept = "application/xml"
  }

  # Wait for all Azure AD configuration to complete before fetching federation metadata
  depends_on = [
    msgraph_resource_action.saml_setup,
    msgraph_resource_action.add_cert,
    msgraph_resource_action.add_identifier_uri,
  ]
}

# resource "local_file" "entra_metadata" {
#   content  = data.http.entra_federation_metadata.response_body
#   filename = local.federation_metadata_path
# }

resource "aws_iam_saml_provider" "entra_c" {
  name                   = var.identity_provider_name
  saml_metadata_document = data.http.entra_federation_metadata.response_body

  # Wait for all Azure AD configuration to complete before fetching federation metadata
  depends_on = [
    msgraph_resource_action.saml_setup,
    msgraph_resource_action.add_cert,
    msgraph_resource_action.add_identifier_uri,
  ]

  lifecycle {
    # Ignore changes to the SAML metadata document, manually update if needed
    ignore_changes = [saml_metadata_document]
  }
}

# data "aws_iam_policy_document" "role_policy" {
#   statement {
#     effect    = "Allow"
#     actions   = ["*"]
#     resources = ["*"]
#   }
# }

# resource "aws_iam_policy" "azuread_sso_user_role_policy_c" {
#   name   = var.role_policy_name
#   policy = data.aws_iam_policy_document.role_policy.json
# }

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
    # condition to ensure the role is only assumable in the context of AWS SSO
    condition {
      test     = "StringEquals"
      variable = "SAML:aud"
      values   = ["https://signin.aws.amazon.com/saml"]
    }
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

resource "aws_iam_role" "entra_id_read_only_access_c" {
  name               = var.role_ro_name
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

resource "aws_iam_role_policy_attachment" "entra_id_read_only_access_c" {
  role       = aws_iam_role.entra_id_read_only_access_c.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}
