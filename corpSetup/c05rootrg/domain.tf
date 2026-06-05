# terraform {
#   required_providers {
#     azurerm = {
#       source  = "hashicorp/azurerm"
#       version = "~> 4.0"
#     }

#     msgraph = {
#       source = "microsoft/msgraph"
#     }
#   }
#   required_version = ">= 1.1.0"
# }

# variable "resource_group_name" {
#   description = "The name of the resource group"
#   type        = string
# }

# variable "dns_name" {
#   description = "The DNS name for the environment"
#   type        = string
# }

// create users — used to construct user principal names (email)
# variable "domain" {
#   type        = string
#   description = "Primary email domain for users (e.g. contoso.com) - must be registered with Entra ID"
#   default     = "ryworkzegmail.onmicrosoft.com"
# }

# variable "dns_name" {
#   type        = string
#   description = "Custom domain to add to the tenant and verify"
#   default     = "z3nm3.com.au"
# }


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
data "msgraph_resource_action" "dns_name" {
  api_version  = "v1.0"
  method       = "POST"
  resource_url = "domains"

  body = { id = var.dns_name }

  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], var.dns_name) ? 1 : 0
}

data "msgraph_resource_action" "dns_name_verify" {
  api_version  = "v1.0"
  method       = "GET"
  resource_url = "domains/${var.dns_name}/verificationDnsRecords"

  response_export_values = {
    records = "value"
  }

  # Only verify if domain was just created
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], var.dns_name) ? 1 : 0

  # Ensure the domain is actually created before trying to get verification records
  depends_on = [data.msgraph_resource_action.dns_name]
}

locals {
  # Create a list of existing domain IDs
  existing_ids = [for d in data.msgraph_resource_action.existing_domains.output.domains : d.id]

  # Determine if we need to create the record (Empty map if exists, 1-item map if missing)
  create_verify_record = contains(local.existing_ids, var.dns_name) ? {} : { "create" = true }
}

resource "azurerm_dns_txt_record" "verify" {
  #for_each = local.create_verify_record

  name                = "@"
  zone_name           = var.dns_name
  resource_group_name = var.resource_group_name
  ttl                 = 3600

  record {
    # Fetches the MS verification token from the Graph API
    #value = length(data.msgraph_resource_action.dns_name_verify) > 0 ? data.msgraph_resource_action.dns_name_verify[0].output.records[0].text : ""
    value = try(data.msgraph_resource_action.dns_name_verify[0].output.records[0].text, "MS=already-verified")
  }

  # Ensures the record remains in Azure after successful domain verification
  lifecycle {
    ignore_changes = [record]
  }
}

resource "msgraph_resource_action" "verify_dns_name" {
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], var.dns_name) ? 1 : 0

  api_version  = "v1.0"
  method       = "POST"
  resource_url = "domains/${var.dns_name}/verify"

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

resource "msgraph_resource_action" "make_dns_name_primary" {
  # Only run when we created the domain
  count = !contains([for d in data.msgraph_resource_action.existing_domains.output.domains : d.id], var.dns_name) ? 1 : 0

  api_version  = "v1.0"
  method       = "PATCH"
  resource_url = "domains/${var.dns_name}"

  body = {
    isDefault = true
  }

  depends_on = [msgraph_resource_action.verify_dns_name]
}

