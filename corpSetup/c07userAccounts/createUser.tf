// Create users (azuread_user resources)
// TODO: lookup manager object_id based on the manager upn ()

locals {
  primary_domain     = data.azuread_domains.primary.domains[0].domain_name
  domain_is_primary  = local.primary_domain == var.dns_name
}


# Fetch existing Entra users for only the UPNs we care about
data "azuread_users" "existing" {
  count = length(local.target_upns) > 0 ? 1 : 0

  user_principal_names = local.target_upns
  ignore_missing       = true
}

resource "azuread_user" "users" { //creatuserAccess
  for_each = local.users_to_create

  user_principal_name     = each.value.Upn
  display_name            = each.value.DisplayName
  given_name              = each.value.Name
  surname                 = each.value.LastName
  country                 = each.value.Location
  # sam_account_name        = each.value.SamAccountName
  mail_nickname           = replace(lower("${each.value.Name}${each.value.LastName}"), " ", "")
  account_enabled         = true
  mail                    = each.value.PrimaryEmail
  other_mails             = [for email in [for e in split(",", each.value.OtherEmail) : trimspace(e) if trimspace(e) != ""] : email]
  manager_id              = lookup(local.all_user_object_ids, lower(each.value.ManagerUpn), null) // check to see if this works as expected

  password                = random_password.user_passwords[each.key].result
  force_password_change   = false #TODO: change to true after demonstration

  lifecycle {
    precondition {
      condition     = local.domain_is_primary
      error_message = "${var.dns_name} is not the primary domain in this tenant."
    }
  }
}

// Create users — generates initial passwords for new users
resource "random_password" "user_passwords" {
  for_each = local.users_to_create

  length           = 16
  special          = true
  override_special = "!@#$%&*()-_+=<>?"
}

// Output: list of created users
output "created_users" {
  value = {
    for k, u in azuread_user.users : k => {
      user_principal_name = u.user_principal_name
      object_id           = u.object_id
      password            = random_password.user_passwords[k].result
    }
  }
  sensitive = true
}