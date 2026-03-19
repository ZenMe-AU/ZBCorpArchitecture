resource "msgraph_resource_action" "claims_policy" {
  api_version  = "beta"
  method       = "PUT"
  resource_url = "servicePrincipals/${azuread_application_from_template.aws_sso_corp.service_principal_object_id}/claimsPolicy"

  body = {
    includeBasicClaimSet         = true
    includeApplicationIdInIssuer = false
    audienceOverride             = null
    groupFilter                  = null

    claims = [
      {
        "@odata.type"                = "#microsoft.graph.samlNameIdClaim"
        serviceProviderNameQualifier = null
        nameIdFormat                 = "emailAddress"
        configurations = [
          {
            condition = null
            attribute = {
              "@odata.type"        = "#microsoft.graph.sourcedAttribute"
              id                   = "userprincipalname"
              source               = "user"
              isExtensionAttribute = false
            }
            transformations = []
          }
        ]
      },
      {
        "@odata.type"           = "#microsoft.graph.customClaim"
        name                    = "givenname"
        namespace               = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims"
        tokenFormat             = ["saml"]
        samlAttributeNameFormat = null
        configurations = [
          {
            condition = null
            attribute = {
              "@odata.type"        = "#microsoft.graph.sourcedAttribute"
              id                   = "givenname"
              source               = "user"
              isExtensionAttribute = false
            }
            transformations = []
          }
        ]
      },
      {
        "@odata.type"           = "#microsoft.graph.customClaim"
        name                    = "surname"
        namespace               = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims"
        tokenFormat             = ["saml"]
        samlAttributeNameFormat = null
        configurations = [
          {
            condition = null
            attribute = {
              "@odata.type"        = "#microsoft.graph.sourcedAttribute"
              id                   = "surname"
              source               = "user"
              isExtensionAttribute = false
            }
            transformations = []
          }
        ]
      },
      {
        "@odata.type"           = "#microsoft.graph.customClaim"
        name                    = "emailaddress"
        namespace               = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims"
        tokenFormat             = ["saml"]
        samlAttributeNameFormat = null
        configurations = [
          {
            condition = null
            attribute = {
              "@odata.type"        = "#microsoft.graph.sourcedAttribute"
              id                   = "mail"
              source               = "user"
              isExtensionAttribute = false
            }
            transformations = []
          }
        ]
      },
      {
        "@odata.type"           = "#microsoft.graph.customClaim"
        name                    = "name"
        namespace               = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims"
        tokenFormat             = ["saml"]
        samlAttributeNameFormat = null
        configurations = [
          {
            condition = null
            attribute = {
              "@odata.type"        = "#microsoft.graph.sourcedAttribute"
              id                   = "userprincipalname"
              source               = "user"
              isExtensionAttribute = false
            }
            transformations = []
          }
        ]
      },
      # AWS attributes
      {
        "@odata.type"           = "#microsoft.graph.customClaim"
        name                    = "RoleSessionName"
        namespace               = "https://aws.amazon.com/SAML/Attributes"
        tokenFormat             = ["saml"]
        samlAttributeNameFormat = null
        configurations = [
          {
            condition = null
            attribute = {
              "@odata.type"        = "#microsoft.graph.sourcedAttribute"
              id                   = "mail"
              source               = "user"
              isExtensionAttribute = false
            }
            transformations = []
          }
        ]
      },
      {
        "@odata.type"           = "#microsoft.graph.customClaim"
        name                    = "SessionDuration"
        namespace               = "https://aws.amazon.com/SAML/Attributes"
        tokenFormat             = ["saml"]
        samlAttributeNameFormat = null
        configurations = [
          {
            condition = null
            attribute = {
              "@odata.type" = "#microsoft.graph.valueBasedAttribute"
              value         = "900"
            }
            transformations = []
          }
        ]
      },
      {
        "@odata.type"           = "#microsoft.graph.customClaim"
        name                    = "Role"
        namespace               = "https://aws.amazon.com/SAML/Attributes"
        tokenFormat             = ["saml"]
        samlAttributeNameFormat = null
        configurations = [
          {
            condition = null
            attribute = {
              "@odata.type" = "#microsoft.graph.valueBasedAttribute"
              value         = "${aws_iam_role.entra_id_admin_access_c.arn},${aws_iam_saml_provider.entra_c.arn}"
            }
            transformations = []
          }
        ]
      }
    ]
  }
}
