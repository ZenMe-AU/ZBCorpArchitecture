
# Define variables for the environment deployment
variable "provider_region" {
  description = "The AWS region for the provider"
  type        = string
  default     = "us-east-1"
}

variable "subscription_id" {
  description = "The ID of the Azure Subscription"
  type        = string
  # default     = "0930d9a7-2369-4a2d-a0b6-5805ef505868"
}

variable "tenant_id" {
  description = "The Azure AD Tenant ID"
  type        = string
  # default     = "15fb0613-7977-4551-801b-6aadac824241"
}