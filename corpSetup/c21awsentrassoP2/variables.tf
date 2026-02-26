# Define variables for the environment deployment
variable "provider_region" {
  description = "The AWS region for the provider"
  type        = string
  default     = "ap-southeast-2"
}

variable "subscription_id" {
  description = "The ID of the Azure Subscription"
  type        = string
}

variable "tenant_id" {
  description = "The Azure AD Tenant ID"
  type        = string
}
