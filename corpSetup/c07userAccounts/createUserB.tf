
locals {
  users_csv = csvdecode(file("${path.module}/users.csv"))
  users_map = {
    for u in local.users_csv : lower(u.Upn) => u
  }
  users_to_create = local.users_map

  # Map UPN to object ID for all created users
  user_object_ids = {
    for upn, user in azuread_user.users : upn => user.object_id
  }

  # Map user UPN to their manager's UPN (only non-empty)
  user_managers = {
    for upn, user in local.users_map : upn => lower(user.ManagerUpn)
    if try(user.ManagerUpn, "") != ""
  }
}

resource "azuread_user" "users" {
  for_each = local.users_to_create

  user_principal_name   = each.value.Upn
  display_name          = each.value.DisplayName
  given_name            = each.value.Name
  surname               = each.value.LastName
  country               = each.value.Location
  mail_nickname         = replace(lower("${each.value.Name}${each.value.LastName}"), " ", "")
  account_enabled       = true
  mail                  = each.value.PrimaryEmail
  other_mails           = [for email in [for e in split(",", each.value.OtherEmail) : trimspace(e) if trimspace(e) != ""] : email]
  password              = "Th3 specified password does not comply with password complexity requirements!!"
  force_password_change = false #TODO: change to true after demonstration
}

resource "msgraph_resource_action" "assign_managers" {
  for_each     = local.user_managers
  resource_url = "users/${local.user_object_ids[each.key]}/manager/$ref"
  api_version  = "v1.0"
  method       = "PUT"
  body = {
    "@odata.id" = "https://graph.microsoft.com/v1.0/users/${local.user_object_ids[each.value]}"
  }
  depends_on = [azuread_user.users]
}
