// TODOs for this module:
// - [x] Add groups from groups.csv
// - [x] Load users.csv
// - [x] Create users (upn is unique identifier)
// - [x] Add users to groups
// - [x] Add users to eligible roles (requires Graph / elevated privileges)
// - [x - SamAccountName] add other properties to users (e.g. SamAccountName, PrimaryEmail, OtherEmail) from users.csv
// - [x] Enable Passkey (FIDO2) for users (requires Graph / admin action)
// - [x] Create 1-day temporary access passes for all users
// - [x] Output Apass.csv with each user's display name, email, and temporary access pass details
//         (the pass is returned by Graph on create, so it is still present in Terraform state)

variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "dns_name" {
  description = "The DNS name for the environment"
  type        = string
}

// create users — used to construct user principal names (email)
variable "domain" {
  type        = string
  description = "Primary email domain for users (e.g. contoso.com) - must be registered with Entra ID"
  default     = "ryworkzegmail.onmicrosoft.com"
}

variable "custom_domain" {
  type        = string
  description = "Custom domain to add to the tenant and verify"
  default     = "z3nm3.com.au"
}

// Check for existing domains
data "msgraph_resource_action" "existing_domains" {
  api_version  = "v1.0"
  method       = "GET"
  resource_url = "domains"

  response_export_values = {
    domains = "value"
  }
}

// creating custom domain — only if it doesn't already exist
data "msgraph_resource_action" "custom_domain" {
  api_version  = "v1.0"
  method       = "POST"
  resource_url = "domains"

  body = { id = var.custom_domain }
  
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], var.custom_domain) ? 1 : 0
}

data "msgraph_resource_action" "custom_domain_verify" {
  api_version  = "v1.0"
  method       = "GET"
  resource_url = "domains/${var.custom_domain}/verificationDnsRecords"

  response_export_values = {
    records = "value"
  }
  
  # Only verify if domain was just created
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], var.custom_domain) ? 1 : 0

  # Ensure the domain is actually created before trying to get verification records
  depends_on = [data.msgraph_resource_action.custom_domain]
}

locals {
  # Create a list of existing domain IDs
  existing_ids = [for d in data.msgraph_resource_action.existing_domains.output.domains : d.id]
  
  # Determine if we need to create the record (Empty map if exists, 1-item map if missing)
  create_verify_record = contains(local.existing_ids, var.custom_domain) ? {} : { "create" = true }
}

resource "azurerm_dns_txt_record" "verify" {
  #for_each = local.create_verify_record

  name                = "@"
  zone_name           = var.dns_name
  resource_group_name = var.resource_group_name
  ttl                 = 3600

  record {
    # Fetches the MS verification token from the Graph API
    #value = length(data.msgraph_resource_action.custom_domain_verify) > 0 ? data.msgraph_resource_action.custom_domain_verify[0].output.records[0].text : ""
    value = try(data.msgraph_resource_action.custom_domain_verify[0].output.records[0].text, "MS=already-verified")
  }

  # Ensures the record remains in Azure after successful domain verification
  lifecycle {
    ignore_changes = [record]
  }
}

resource "msgraph_resource_action" "verify_custom_domain" {
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], var.custom_domain) ? 1 : 0

  api_version  = "v1.0"
  method       = "POST"
  resource_url = "domains/${var.custom_domain}/verify"

  # DNS verification can be eventually consistent; retry until record is visible.
  retry = {
    error_message_regex = [
      "(?i)TargetHostCannotBeResolved",
      "(?i)DNS verification",
      "(?i)InternalError"
    ]
  }

  timeouts {
    create = "2m"
  }

  depends_on = [azurerm_dns_txt_record.verify]
}

resource "msgraph_resource_action" "make_custom_domain_primary" {
  # Only run when we created the domain
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], var.custom_domain) ? 1 : 0

  api_version  = "v1.0"
  method       = "PATCH"
  resource_url = "domains/${var.custom_domain}"

  body = {
    isDefault = true
  }

  depends_on = [msgraph_resource_action.verify_custom_domain]
}

resource "msgraph_update_resource" "enable_fido2" {
  url         = "policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Fido2"
  api_version = "v1.0"

  body = {
    state = "enabled"
    includeTargets = [
      {
        "@odata.type"          = "#microsoft.graph.authenticationMethodTarget"
        id                      = "all_users"
        targetType              = "group"
        isRegistrationRequired  = false
      }
    ]
  }

  depends_on = [msgraph_resource_action.make_custom_domain_primary]
}

// Add groups from groups.csv, Load users.csv, Create users, Add users to groups, Add groups to groups
locals {
  # loads groups.csv -> used by azuread_group
  groups_csv = csvdecode(file("${path.module}/groups.csv"))

  # loads users.csv -> used to create azuread_user
  users_csv  = csvdecode(file("${path.module}/users.csv"))

  # map users by UPN from CSV
  users_map = {
    for u in local.users_csv : lower(u.Upn) => u
  }

  # target UPNs from users.csv used to query existing Entra users
  target_upns = [for u in local.users_csv : lower(u.Upn)]

  # flattened list of user -> group mappings for group membership resource
  user_memberships = flatten([
    for upn, u in local.users_map : [
      for g in [for group in split(",", u.MemberOfGroups) : trimspace(group) if trimspace(group) != ""] : {
        upn   = upn
        group = g
      }
    ]
  ])

  # flattened list of child-group -> parent-group mappings from groups.csv
  group_memberships = flatten([
    for g in local.groups_csv : [
      for parent in [for p in split(",", g.MemberOfGroups) : trimspace(p) if trimspace(p) != ""] : {
        child_group  = g.GroupName
        parent_group = parent
      }
    ]
  ])
}

// Add groups from groups.csv
resource "azuread_group" "security_groups" {
  for_each = { for group in local.groups_csv : group.GroupName => group }

  display_name     = each.value.GroupName
  description      = each.value.Description
  security_enabled = true
  mail_enabled     = false
  assignable_to_role = false
}

// Create users — generates initial passwords for new users
resource "random_password" "user_passwords" {
  for_each = local.users_to_create

  length           = 16
  special          = true
  override_special = "!@#$%&*()-_+=<>?"
}

# Fetch existing Entra users for only the UPNs we care about
data "azuread_users" "existing" {
  count = length(local.target_upns) > 0 ? 1 : 0

  user_principal_names = local.target_upns
  ignore_missing       = true
}

locals {
  # Existing users that match our target UPNs
  existing_upns = length(local.target_upns) > 0 ? [
    for u in data.azuread_users.existing[0].users : lower(u.user_principal_name)
  ] : []

  # Existing users keyed by UPN
  existing_user_object_ids = length(local.target_upns) > 0 ? {
    for u in data.azuread_users.existing[0].users : lower(u.user_principal_name) => u.object_id
  } : {}

  # Only create users that are not already present in Entra ID.
  users_to_create = {
    for upn, v in local.users_map : upn => v
    if !contains(local.existing_upns, upn)
  }

  # Resolve membership IDs from all known users (existing + managed/created).
  all_user_object_ids = merge(
    local.existing_user_object_ids,
    { for upn, u in azuread_user.users : upn => u.object_id }
  )

  # Flatten users.csv into user -> eligible role pairs.
  eligible_role_assignments = flatten([
    for upn, u in local.users_map : [
      for role_name in [for r in split(",", try(u.EligibleRoles, "")) : trimspace(r) if trimspace(r) != ""] : {
        upn           = upn
        display_name  = trimspace(u.DisplayName)
        role_name     = role_name
      }
    ]
  ])

  # Unique Entra role names from users.csv.
  eligible_role_names = toset([
    for a in local.eligible_role_assignments : a.role_name
  ])

  # Map role display name -> role template object_id from azuread_directory_role_templates.
  eligible_role_template_object_ids = {
    for rt in data.azuread_directory_role_templates.eligible_roles.role_templates : rt.display_name => rt.object_id
  }

  temporary_access_pass_users = {
    for upn, user in local.users_map : upn => user
  }
}

// Create users (azuread_user resources)
resource "azuread_user" "users" {
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

  password                = random_password.user_passwords[each.key].result
  force_password_change   = false #TODO: change to true after demonstration

  depends_on = [msgraph_resource_action.make_custom_domain_primary]
}

// Add users to groups (azuread_group_member resources)
resource "azuread_group_member" "membership" {
  for_each = { for m in local.user_memberships : "${m.upn}__${m.group}" => m }

  group_object_id  = azuread_group.security_groups[each.value.group].object_id
  member_object_id = local.all_user_object_ids[each.value.upn]
}

// Add groups to groups (child group memberships in parent groups)
resource "azuread_group_member" "group_membership" {
  for_each = { for m in local.group_memberships : "${m.child_group}__${m.parent_group}" => m }

  group_object_id  = azuread_group.security_groups[each.value.parent_group].object_id
  member_object_id = azuread_group.security_groups[each.value.child_group].object_id
}

// Note: this is under the assumption that all display names in users.csv are unique. In production, you'd want a more reliable key (e.g. email or a dedicated username column) to avoid ambiguity.
// This data source fetches all available role templates (e.g., "Global Administrator", "User Administrator") 
data "azuread_directory_role_templates" "eligible_roles" {
}

// Note: This requires elevated permissions (e.g. User Access Administrator) to manage role assignments in Entra ID
// Creates eligible role assignments
resource "azuread_directory_role_assignment" "eligible_roles" {
  for_each = {
    for a in local.eligible_role_assignments :
    "${a.upn}__${replace(lower(a.role_name), " ", "_")}" => a
  }

  role_id             = local.eligible_role_template_object_ids[each.value.role_name]
  principal_object_id = local.all_user_object_ids[each.value.upn]
}

resource "msgraph_resource_action" "temporary_access_pass" {
  for_each = local.temporary_access_pass_users

  api_version  = "v1.0"
  method       = "POST"
  resource_url = "users/${each.key}/authentication/temporaryAccessPassMethods"

  body = {
    isUsableOnce      = true
    lifetimeInMinutes = 480
  }

  response_export_values = {
    temporary_access_pass = "temporaryAccessPass"
    id                    = "id"
    created_date_time     = "createdDateTime"
    start_date_time       = "startDateTime"
    lifetime_in_minutes   = "lifetimeInMinutes"
    is_usable_once        = "isUsableOnce"
    is_usable             = "isUsable"
    usability_reason      = "methodUsabilityReason"
  }

  depends_on = [
    azuread_user.users
  ]
}

locals {
  temporary_access_pass_rows = [
    for upn, user in local.temporary_access_pass_users : {
      display_name = trimspace(user.DisplayName)
      email        = coalesce(try(trimspace(user.PrimaryEmail), ""), trimspace(user.Upn))
      access_pass_code = msgraph_resource_action.temporary_access_pass[upn].output.temporary_access_pass
    }
  ]
}

resource "local_file" "apass_csv" {
  filename = "${path.module}/Apass.csv"

  content = join("\n", concat(
    ["display_name,email,access_pass_code"],
    [
      for row in local.temporary_access_pass_rows : format(
        "\"%s\",\"%s\",\"%s\"",
        replace(row.display_name, "\"", "\"\""),
        replace(row.email, "\"", "\"\""),
        replace(row.access_pass_code, "\"", "\"\"")
      )
    ]
  ))

  depends_on = [msgraph_resource_action.temporary_access_pass]
}

// Output: list of eligible role assignments created (or already existing) for users
output "eligible_role_assignment_details" {
  value = [
    for a in local.eligible_role_assignments :
    "Assigned role '${a.role_name}' to user '${a.display_name}'"
  ]
}


// Output: list of created users (helps verify user creation)
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