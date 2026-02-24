//Create the resources to make sso inside on entra possible with aws

# Create the Application Registration (non-gallery using SAML template)
resource "azuread_application" "aws_sso_corp" {
  display_name            = "AWS SSO Corp"
  template_id             = "8adf8e6e-67b2-4cf2-a259-e3dc5476c621"
  sign_in_audience        = "AzureADMyOrg"

  web {
    implicit_grant {
      access_token_issuance_enabled = false
      id_token_issuance_enabled     = true
    }
  }
}

# Output the application details
output "application_id" {
  description = "The Application (Client) ID"
  value       = azuread_application.aws_sso_corp.client_id
}

output "object_id" {
  description = "The Object ID of the Application"
  value       = azuread_application.aws_sso_corp.object_id
}