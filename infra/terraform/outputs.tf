output "ipv4" {
  value = hcloud_server.main.ipv4_address
}

output "ipv6" {
  # Hetzner gives a /64; the server answers on ::1 of it.
  value = hcloud_server.main.ipv6_address
}

output "firewall_name" {
  value = hcloud_firewall.main.name
}

output "dns_records" {
  description = "Records to create at the DNS host."
  value = [
    "collect.${var.domain}  A     ${hcloud_server.main.ipv4_address}",
    "collect.${var.domain}  AAAA  ${hcloud_server.main.ipv6_address}",
    "app.${var.domain}      A     ${hcloud_server.main.ipv4_address}",
    "app.${var.domain}      AAAA  ${hcloud_server.main.ipv6_address}",
    "${var.domain}          A     ${hcloud_server.main.ipv4_address}",
    "${var.domain}          AAAA  ${hcloud_server.main.ipv6_address}",
  ]
}

output "ssh" {
  value = "ssh ${var.admin_user}@${hcloud_server.main.ipv4_address}"
}
