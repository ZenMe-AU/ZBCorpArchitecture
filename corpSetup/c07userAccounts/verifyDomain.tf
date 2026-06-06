
resource "msgraph_resource_action" "verify_dns_name" {
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
}

resource "msgraph_resource_action" "make_dns_name_primary" {
  api_version  = "v1.0"
  method       = "PATCH"
  resource_url = "domains/${var.dns_name}"

  body = {
    isDefault = true
  }

  depends_on = [msgraph_resource_action.verify_dns_name]
}
