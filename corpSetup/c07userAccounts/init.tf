terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    msgraph = {
      source = "microsoft/msgraph"
    }
  }
  required_version = ">= 1.1.0"
}

provider "azurerm"  {
  features {}
  subscription_id = var.subscription_id
}

provider "msgraph" {}