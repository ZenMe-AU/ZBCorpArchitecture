// roles needed: 
// Policy.ReadWrite.AuthenticationMethod
// UserAuthenticationMethod.ReadWrite.All
// RoleManagement.ReadWrite.Directory
// User.ReadWrite.All
// GroupMember.ReadWrite.All
// Group.ReadWrite.All

// check if domain is verified and is the root domain (default domain)
data "azuread_domains" "primary" {
  only_default = true
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
    { for upn, u in azuread_user.users : lower(upn) => u.object_id }
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

