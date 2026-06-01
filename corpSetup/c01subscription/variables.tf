
# Define variables for the environment deployment
variable "billing_account_name" {
  description = "The name of the Azure Billing Account"
  type        = string
  default     = "7fb91379-7253-5555-7fc5-c0635f5b57a1:15c45fa6-5313-480e-98c1-7c88255ab94e_2019-05-31"
}
variable "billing_profile_name" {
  description = "The name of the Azure Billing Profile"
  type        = string
  default     = "E3SG-2O2T-BG7-PGB"
}
variable "invoice_section_name" {
  description = "The name of the new Azure Invoice Section to be created"
  type        = string
  default     = "47b81dbe-df4a-41d3-8b50-7a4001464a1a"
}
variable "subscription_name" {
  description = "The name of the Azure Subscription"
  type        = string
}
variable "subscription_id" {
  description = "The ID of the Azure Subscription"
  type        = string
}
variable "contact_emails" {
  description = "List of contact emails for budget notification"
  type        = list(string)
  default     = ["ryworkze@gmail.com"]
}