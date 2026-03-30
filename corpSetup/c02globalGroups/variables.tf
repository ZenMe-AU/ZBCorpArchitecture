
# Define variables for the environment deployment

# The target environment will automatically load from the environment variable TF_VAR_target_env
variable "subscription_id" {
  description = "The ID of the Azure Subscription"
  type        = string
}

variable "lead_developer_assignable_to_role" {
  description = "Set true only when tenant has Microsoft Entra ID P1/P2 and role-assignable groups are required"
  type        = bool
  default     = false
}