import net from 'node:net';

/**
 * §2: the client IP comes from CLIENT_IP_HEADER, trusted only when the direct
 * peer is in TRUSTED_PROXY_CIDRS. For X-Forwarded-For, walk from the right and
 * take the first address that isn't a trusted proxy (the proxy appends the
 * address it saw; anything to the left was sent by the client).
 */
export function makeClientIp(cidrs: string[], header: string) {
  const trusted = new net.BlockList();
  for (const c of cidrs) {
    const [addr, bits] = c.split('/');
    const type = net.isIPv6(addr) ? 'ipv6' : 'ipv4';
    if (!net.isIP(addr)) continue;
    trusted.addSubnet(addr, Number(bits ?? (type === 'ipv6' ? 128 : 32)), type);
  }
  const isTrusted = (ip: string) => {
    const t = net.isIP(ip);
    return t ? trusted.check(ip, t === 6 ? 'ipv6' : 'ipv4') : false;
  };
  const clean = (ip: string) => ip.trim().replace(/^\[|\]$/g, '').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1');

  return (peerRaw: string | undefined, headers: Record<string, string | string[] | undefined>): string => {
    const peer = clean(peerRaw || '');
    if (!isTrusted(peer)) return peer;
    const raw = headers[header];
    const value = Array.isArray(raw) ? raw.join(',') : raw;
    if (!value) return peer;
    const hops = value
      .split(',')
      .map(clean)
      .filter((h) => net.isIP(h));
    for (let i = hops.length - 1; i >= 0; i--) if (!isTrusted(hops[i]) || i === 0) return hops[i];
    return peer;
  };
}
