resource "hcloud_ssh_key" "admin" {
  name       = "${var.name}-admin"
  public_key = trimspace(file(pathexpand(var.admin_ssh_public_key_path)))
}

resource "hcloud_firewall" "main" {
  name = "${var.name}-fw"

  rule {
    description = "HTTP (ACME + redirect to HTTPS)"
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "HTTPS"
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
  }

  rule {
    description = "SSH (admin only)"
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = var.ssh_allowed_cidrs
  }
}

resource "hcloud_server" "main" {
  name        = "${var.name}-1"
  server_type = var.server_type
  image       = var.image
  location    = var.location
  backups     = var.backups

  ssh_keys     = [hcloud_ssh_key.admin.id]
  firewall_ids = [hcloud_firewall.main.id]

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    admin_user    = var.admin_user
    admin_key     = trimspace(file(pathexpand(var.admin_ssh_public_key_path)))
    deploy_key    = trimspace(file(pathexpand(var.deploy_ssh_public_key_path)))
    repo_url      = var.repo_url
    bootstrap_ref = var.bootstrap_ref
    domain        = var.domain
    rate1_deploy  = file("${path.module}/../deploy/rate1-deploy")
  })

  # Hetzner-side guard: the server cannot be deleted or rebuilt until this is switched off (see README "Destroy").
  delete_protection  = true
  rebuild_protection = true

  lifecycle {
    # cloud-init only runs on first boot; editing it (or the image / initial key) must never replace the live server.
    ignore_changes = [user_data, image, ssh_keys]
  }

  labels = {
    project = var.name
  }
}
