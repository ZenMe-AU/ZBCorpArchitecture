resource "msgraph_resource_action" "saml_setup" {
  api_version  = "v1.0"
  method       = "PATCH"
  resource_url = "servicePrincipals/${azuread_application_from_template.aws_sso_corp.service_principal_object_id}"
  body         = { preferredSingleSignOnMode : "saml" }
}

resource "msgraph_resource_action" "add_cert" {
  api_version  = "v1.0"
  method       = "POST"
  resource_url = "servicePrincipals/${azuread_application_from_template.aws_sso_corp.service_principal_object_id}/addTokenSigningCertificate"
  body         = { displayName = "CN=AWS SSO Signing" }
  depends_on   = [msgraph_resource_action.saml_setup]
}

resource "msgraph_resource_action" "add_identifier_uri" {
  api_version  = "v1.0"
  method       = "PATCH"
  resource_url = "applications/${azuread_application_from_template.aws_sso_corp.application_object_id}"
  body         = { identifierUris = ["https://signin.aws.amazon.com/saml#${azuread_application_from_template.aws_sso_corp.application_object_id}"] }
  depends_on   = [msgraph_resource_action.saml_setup]
}
# resource "msgraph_resource_action" "get_key_credentials" {
#   api_version  = "v1.0"
#   method       = "POST"
#   resource_url = "servicePrincipals/${azuread_application_from_template.aws_sso_corp.service_principal_object_id}/keyCredentials"
# }


# resource "msgraph_resource_action" "update_preferred_thumbprint" {
#   api_version  = "v1.0"
#   method       = "PATCH"
#   resource_url = "servicePrincipals/${azuread_application_from_template.aws_sso_corp.service_principal_object_id}"
#   body = {
#     preferredTokenSigningKeyThumbprint : "$THUMBPRINT"
#   }
# }
