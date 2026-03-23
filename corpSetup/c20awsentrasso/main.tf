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
