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

resource "null_resource" "wait_metadata_ready" {
  provisioner "local-exec" {
    command = "node ${path.module}/wait_metadata_ready.mjs"
    environment = {
      FEDERATION_METADATA_URL = local.aws_sso_federation_metadata_url
      METADATA_PATH           = local.federation_metadata_path
      SAML_PROVIDER_ARN       = aws_iam_saml_provider.entra_c.arn
      MAX_RETRIES             = "20"
      RETRY_DELAY_SECONDS     = "5"
      MIN_SIGNING_CERTS       = "1"
    }
  }

  depends_on = [
    msgraph_resource_action.saml_setup,
    msgraph_resource_action.add_cert,
    msgraph_resource_action.add_identifier_uri,
    aws_iam_saml_provider.entra_c
  ]
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
