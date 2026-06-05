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

output "eligible_role_assignment_details" {
  value = [
    for a in local.eligible_role_assignments :
    "Assigned role '${a.role_name}' to user '${a.display_name}'"
  ]
}
