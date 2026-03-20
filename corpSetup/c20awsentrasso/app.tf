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
    command = <<EOT
COUNT=0
while [ $COUNT -lt 20 ]; do
  XML=$(curl -sf "${local.aws_sso_federation_metadata_url}")
  ENTITY=$(echo "$XML" | grep -o "<EntityDescriptor.*entityID=")
  CERT=$(echo "$XML" | grep -o "<X509Certificate>.*</X509Certificate>")
  SIGNING_COUNT=$(echo "$XML" | xmllint --xpath 'count(//*[local-name()="IDPSSODescriptor"]/*[local-name()="KeyDescriptor" and @use="signing"])' - 2>/dev/null)

  if [ -n "$ENTITY" ] && [ -n "$CERT" ] && [ "$SIGNING_COUNT" -eq 1 ]; then
    echo "Metadata ready and exactly 1 signing cert found"
    echo "updating AWS SAML provider with latest metadata."
    echo "$XML" > ${local.federation_metadata_path}
    aws iam update-saml-provider \
    --saml-provider-arn "${aws_iam_saml_provider.entra_c.arn}" \
    --saml-metadata-document file://${local.federation_metadata_path}

    exit 0
  fi

  COUNT=$((COUNT+1))
  echo "Metadata not ready yet, wait 5s..."
  sleep 5
done

echo "Metadata still not ready after 100s or signing cert count != 1"
exit 1
EOT
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
