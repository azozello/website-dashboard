variable "name" {
  description = "Prefix for every Hetzner resource name."
  type        = string
  default     = "rate1"
}

variable "location" {
  description = "Hetzner location. nbg1 = Nuremberg, fsn1 = Falkenstein (fallback)."
  type        = string
  default     = "nbg1"
}

variable "server_type" {
  description = "Hetzner server type. cx23 = 2 vCPU / 4 GB, x86. Changing to an ARM type (cax*) means every image must be arm64."
  type        = string
  default     = "cx23"
}

variable "image" {
  type    = string
  default = "ubuntu-24.04"
}

variable "domain" {
  description = "Base domain. Caddy serves collect.<domain> and app.<domain>."
  type        = string
  default     = "bazed.live"
}

variable "admin_user" {
  description = "Non-root sudo user created by cloud-init."
  type        = string
  default     = "ops"
}

variable "admin_ssh_public_key_path" {
  description = "Path to the admin's SSH public key (it is uploaded to Hetzner and installed for admin_user)."
  type        = string
}

variable "deploy_ssh_public_key_path" {
  description = "Path to the CI deploy key's public half. It is installed for the 'deploy' user, restricted to the rate1-deploy command."
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "Source CIDRs allowed to reach port 22, e.g. [\"203.0.113.7/32\"]. CI adds its own address temporarily during a deploy."
  type        = list(string)
}

variable "repo_url" {
  description = "Git repository the server clones and deploys from (must be readable without credentials)."
  type        = string
  default     = "https://github.com/azozello/website-dashboard.git"
}

variable "bootstrap_ref" {
  description = "Branch the server deploys on first boot. Later deploys are driven by CI on merge to main."
  type        = string
  default     = "main"
}

variable "backups" {
  description = "Hetzner automatic backups (+20% of the server price)."
  type        = bool
  default     = true
}
