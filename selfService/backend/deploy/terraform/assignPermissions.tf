/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

# Equivalent of assignPermissions.mjs: grants Microsoft Graph application permissions
# GroupMember.ReadWrite.All and AdministrativeUnit.ReadWrite.All to the app registration.
data "azuread_application_published_app_ids" "well_known" {}

data "azuread_service_principal" "msgraph" {
  client_id = data.azuread_application_published_app_ids.well_known.result["MicrosoftGraph"]
}

resource "azuread_application_api_access" "msgraph" {
  application_id = azuread_application.access_pass_backend.id
  api_client_id  = data.azuread_service_principal.msgraph.client_id

  role_ids = [
    data.azuread_service_principal.msgraph.app_role_ids["GroupMember.ReadWrite.All"],
    data.azuread_service_principal.msgraph.app_role_ids["AdministrativeUnit.ReadWrite.All"],
  ]
}
