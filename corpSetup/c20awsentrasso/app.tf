resource "azuread_service_principal" "aws_sso_corp" {
  client_id                     = data.azuread_application.aws_sso_corp.client_id
  preferred_single_sign_on_mode = "saml"
  app_role_assignment_required  = true
  use_existing                  = true
  feature_tags {
    enterprise = true
  }
}

resource "azuread_service_principal_token_signing_certificate" "aws_sso_corp" {
  service_principal_id = azuread_service_principal.aws_sso_corp.id
  display_name         = "CN=AWS SSO Signing"
  depends_on           = [azuread_service_principal.aws_sso_corp]
}

resource "azuread_application_identifier_uri" "aws_sso_corp" {
  application_id = data.azuread_application.aws_sso_corp.id
  identifier_uri = "https://signin.aws.amazon.com/saml#${azuread_application_from_template.aws_sso_corp.application_object_id}"
  depends_on     = [azuread_service_principal.aws_sso_corp] # Ensure sso mode is set as SAML before setting identifier URI
}

resource "null_resource" "wait_metadata_ready" {
  provisioner "local-exec" {
    interpreter = ["pwsh", "-Command"]

    command = <<EOT
      $MetadataUrl        = $env:METADATA_URL
      $ExpectedThumbprint = $env:EXPECTED_THUMBPRINT
      $MetadataPath       = $env:METADATA_PATH
      $AwsProviderArn     = $env:AWS_PROVIDER_ARN
      $count              = 1
      $maxAttempts        = 20
      $waitSeconds    = 5

      while (-not $found -and $count -le $maxAttempts) {
          try {
              $response = Invoke-WebRequest -Uri $MetadataUrl -UseBasicParsing -ErrorAction Stop
              $xmlString = $response.Content -replace '^\uFEFF',''
              $xmlString = $xmlString.Trim()
              if (-not [string]::IsNullOrEmpty($xmlString)) {
                  $xmlDoc = New-Object System.Xml.XmlDocument
                  $xmlDoc.LoadXml($xmlString)

                  $nsMgr = New-Object System.Xml.XmlNamespaceManager($xmlDoc.NameTable)
                  $nsMgr.AddNamespace("md", "urn:oasis:names:tc:SAML:2.0:metadata")
                  $nsMgr.AddNamespace("ds", "http://www.w3.org/2000/09/xmldsig#")

                  $signingKeys = $xmlDoc.SelectNodes("//md:IDPSSODescriptor/md:KeyDescriptor[@use='signing']", $nsMgr)
                  if ($signingKeys.Count -eq 1) {
                      $certNodes = $signingKeys[0].SelectNodes(".//ds:X509Certificate", $nsMgr)
                      if ($certNodes.Count -eq 1) {
                        $certValue = $certNodes[0].InnerText.Trim()
                        $tmpCertPath = [System.IO.Path]::GetTempFileName() + ".cer"
                        [System.IO.File]::WriteAllBytes($tmpCertPath, [Convert]::FromBase64String($certValue))
                        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($tmpCertPath)
                        $thumbprint = $cert.Thumbprint
                        if ($thumbprint -eq $ExpectedThumbprint) {
                            Write-Host "Metadata ready and correct cert found."
                            $xmlDoc.OuterXml | Out-File -FilePath $MetadataPath -Encoding UTF8
                            exit 0
                        }
                    }
                  }
              }
          } catch { }

          Write-Host "Attempt $($count): metadata not ready yet..."
          Start-Sleep -Seconds $waitSeconds
          $count++
      }

      Write-Error "Metadata still not ready or cert mismatch after $($maxAttempts * $waitSeconds)s"
      exit 1
      EOT
    environment = {
      METADATA_URL        = local.aws_sso_federation_metadata_url
      EXPECTED_THUMBPRINT = azuread_service_principal_token_signing_certificate.aws_sso_corp.thumbprint
      METADATA_PATH       = local.federation_metadata_path
      AWS_PROVIDER_ARN    = aws_iam_saml_provider.entra.arn
    }
  }

  depends_on = [
    azuread_service_principal.aws_sso_corp,
    azuread_service_principal_token_signing_certificate.aws_sso_corp,
    azuread_application_identifier_uri.aws_sso_corp,
    aws_iam_saml_provider.entra # Ensure the SAML provider is created before we can update it with metadata
  ]
}


