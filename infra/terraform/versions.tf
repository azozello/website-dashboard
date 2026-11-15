terraform {
  required_version = ">= 1.6"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.52"
    }
  }
}

# The token comes from the HCLOUD_TOKEN environment variable. Never put it in a file in this repo.
provider "hcloud" {}
