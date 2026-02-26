// Create IAM Identity Center user and AdministratorAccess permission set in AWS

# Get the current AWS account ID
data "aws_caller_identity" "current" {}

# Get the IAM Identity Center instance
data "aws_ssoadmin_instances" "main" {}

# Create IAM Identity Center user
resource "aws_identitystore_user" "ryan_weber" {
  identity_store_id = tolist(data.aws_ssoadmin_instances.main.identity_store_ids)[0]

  display_name = "Ryan Weber"
  user_name    = "RyanWeber@zenme.com.au"

  emails {
    value = "RyanWeber@zenme.com.au"
  }

  name {
    given_name  = "Ryan"
    family_name = "Weber"
  }
}

# Create AdministratorAccess permission set
resource "aws_ssoadmin_permission_set" "administrator_access" {
  instance_arn       = tolist(data.aws_ssoadmin_instances.main.arns)[0]
  name               = "AdministratorAccess"
  description        = "Permission set for administrator access"
  session_duration   = "PT8H" # 8 hours
}

# Attach the AdministratorAccess managed policy to the permission set
resource "aws_ssoadmin_managed_policy_attachment" "administrator_access" {
  instance_arn       = tolist(data.aws_ssoadmin_instances.main.arns)[0]
  permission_set_arn = aws_ssoadmin_permission_set.administrator_access.arn
  managed_policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# Assign the user to the AWS account with AdministratorAccess permission set
resource "aws_ssoadmin_account_assignment" "ryan_weber_admin" {
  instance_arn       = tolist(data.aws_ssoadmin_instances.main.arns)[0]
  permission_set_arn = aws_ssoadmin_permission_set.administrator_access.arn
  principal_id       = aws_identitystore_user.ryan_weber.user_id
  principal_type     = "USER"
  target_id          = data.aws_caller_identity.current.account_id
  target_type        = "AWS_ACCOUNT"
}

# Output the user ID
output "user_id" {
  description = "The ID of the IAM Identity Center user"
  value       = aws_identitystore_user.ryan_weber.user_id
}

# Output the permission set ARN
output "permission_set_arn" {
  description = "The ARN of the AdministratorAccess permission set"
  value       = aws_ssoadmin_permission_set.administrator_access.arn
}
