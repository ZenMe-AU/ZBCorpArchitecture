// TODOs for this module:
// - [x] Add groups from groups.csv
// - [x] Load users.csv
// - [x] Create users
// - [x] Add users to groups
// - [ ] Add users to eligible roles (requires Graph / elevated privileges)
// - [ ] Enable Passkey (FIDO2) for users (requires Graph / admin action)
// - [ ] Create 1-day temporary access passes and output to a file (external script)
// - [ ] Output a file with every user's temporary access pass and email address
//         (avoid storing secrets in Terraform state; use secure script/secret store)

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

  body = {"id": "z3nm3.com.au"}
  
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], "z3nm3.com.au") ? 1 : 0
}

data "msgraph_resource_action" "custom_domain_verify" {
  api_version  = "v1.0"
  method       = "GET"
  resource_url = "domains/z3nm3.com.au/verificationDnsRecords"

  response_export_values = {
    records = "value"
  }
  
  # Only verify if domain was just created
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], "z3nm3.com.au") ? 1 : 0

  # Ensure the domain is actually created before trying to get verification records
  depends_on = [data.msgraph_resource_action.custom_domain]
}

locals {
  # Create a list of existing domain IDs
  existing_ids = [for d in data.msgraph_resource_action.existing_domains.output.domains : d.id]
  
  # Determine if we need to create the record (Empty map if exists, 1-item map if missing)
  create_verify_record = contains(local.existing_ids, "z3nm3.com.au") ? {} : { "create" = true }
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

data "msgraph_resource_action" "verify_custom_domain" {
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], "z3nm3.com.au") ? 1 : 0

  api_version  = "v1.0"
  method       = "POST"
  resource_url = "domains/z3nm3.com.au/verify"

  # DNS verification can be eventually consistent; retry until record is visible.
  retry = {
    error_message_regex = [
      "(?i)TargetHostCannotBeResolved",
      "(?i)DNS verification",
      "(?i)InternalError"
    ]
  }

  timeouts {
    read = "2m"
  }

  depends_on = [azurerm_dns_txt_record.verify]
}

// Add groups from groups.csv, Load users.csv, Create users, Add users to groups, Add groups to groups
locals {
  # loads groups.csv -> used by azuread_group
  groups_csv = csvdecode(file("${path.module}/groups.csv"))

  # loads users.csv -> used to create azuread_user
  users_csv  = csvdecode(file("${path.module}/users.csv"))

  # map users by username (name.surname)
  users_map = {
    for u in local.users_csv : lower("${u.Name}.${u.LastName}") => u
  }

  # target UPNs from users.csv used to query existing Entra users
  target_upns = [for k in keys(local.users_map) : lower("${k}@${var.domain}")]

  # flattened list of user -> group mappings for group membership resource
  user_memberships = flatten([
    for u_key, u in local.users_map : [
      for g in split(",", replace(u.MemberOfGroups, " ", "")) : {
        user_key = u_key
        group    = g
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

  # Existing users keyed by username part of UPN (name.surname)
  existing_user_object_ids = length(local.target_upns) > 0 ? {
    for u in data.azuread_users.existing[0].users : lower(split("@", u.user_principal_name)[0]) => u.object_id
  } : {}

  # Only create users that are not already present in Entra ID.
  users_to_create = {
    for k, v in local.users_map : k => v
    if !contains(local.existing_upns, lower("${k}@${var.domain}"))
  }

  # Resolve membership IDs from all known users (existing + managed/created).
  all_user_object_ids = merge(
    local.existing_user_object_ids,
    { for k, u in azuread_user.users : k => u.object_id }
  )

  # Flatten users.csv into user -> eligible role pairs.
  eligible_role_assignments = flatten([
    for u_key, u in local.users_map : [
      for role_name in [for r in split(",", try(u.EligibleRoles, "")) : trimspace(r) if trimspace(r) != ""] : {
        user_key      = u_key
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
}

// Create users (azuread_user resources)
resource "azuread_user" "users" {
  for_each = local.users_to_create

  user_principal_name = "${each.key}@${var.domain}"
  display_name        = each.value.DisplayName
  mail_nickname       = replace(lower("${each.value.Name}${each.value.LastName}"), " ", "")
  account_enabled     = true

  password = random_password.user_passwords[each.key].result
  force_password_change = false #TODO: change to true after demonstration
}

// Add users to groups (azuread_group_member resources)
resource "azuread_group_member" "membership" {
  for_each = { for m in local.user_memberships : "${m.user_key}__${m.group}" => m }

  group_object_id  = azuread_group.security_groups[each.value.group].object_id
  member_object_id = local.all_user_object_ids[each.value.user_key]
}

// Add groups to groups (child group memberships in parent groups)
resource "azuread_group_member" "group_membership" {
  for_each = { for m in local.group_memberships : "${m.child_group}__${m.parent_group}" => m }

  group_object_id  = azuread_group.security_groups[each.value.parent_group].object_id
  member_object_id = azuread_group.security_groups[each.value.child_group].object_id
}

// Note: this is under the assumption that all display names in users.csv are unique. In production, you'd want a more reliable key (e.g. email or a dedicated username column) to avoid ambiguity.
// Add users to eligible roles from users.csv (DisplayName -> EligibleRoles)
data "azuread_directory_role_templates" "eligible_roles" {
}

// Note: This requires elevated permissions (e.g. User Access Administrator) to manage role assignments in Entra ID
// Creates eligible role assignments
resource "azuread_directory_role_assignment" "eligible_roles" {
  for_each = {
    for a in local.eligible_role_assignments :
    "${a.user_key}__${replace(lower(a.role_name), " ", "_")}" => a
  }

  role_id             = local.eligible_role_template_object_ids[each.value.role_name]
  principal_object_id = local.all_user_object_ids[each.value.user_key]
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