// Add groups from groups.csv
resource "azuread_group" "security_groups" {
  for_each = { for group in local.groups_csv : group.GroupName => group }

  display_name     = each.value.GroupName
  description      = each.value.Description
  security_enabled = true
  mail_enabled     = false
  assignable_to_role = false
}