// Decides whether a Host header names a genuine subdomain of the production
// domain that middleware.ts should rewrite to /<subdomain>/<path> (this
// powers public rep profile pages, e.g. jett.millerstorm.tech -> /jett/...).
//
// Returns the subdomain to rewrite to, or null when the request should pass
// through untouched: the bare domain, "www", localhost, an IPv4 address, or
// an IPv6 address (always bracketed in a Host header, e.g. "[::1]:6790").
//
// An IP host must never be treated as a subdomain: splitting "127.0.0.1" on
// "." yields four parts, which used to be mistaken for "127" + a two-part
// domain, rewriting every page to /127/... and 404ing it. Any internal health
// check or load balancer that requests the app by IP would see the whole app
// as down.
export function resolveSubdomain(hostHeader: string): string | null {
  const host = hostHeader.trim();
  if (!host) return null;

  // IPv6 host: always bracketed in a Host header, e.g. "[::1]:6790". Bail out
  // before any dot-splitting, since a bracketed IPv6 host can itself contain
  // dots (an embedded IPv4 mapping like "[::ffff:192.168.1.1]").
  if (host.startsWith('[')) return null;

  // Strip a trailing port ("host:port" -> "host"). A bare hostname or IPv4
  // address has at most one colon, so the first colon is always the port
  // separator here (bracketed IPv6 is already handled above).
  const colonIndex = host.indexOf(':');
  const hostname = colonIndex === -1 ? host : host.slice(0, colonIndex);

  if (hostname === 'localhost') return null;

  const segments = hostname.split('.');

  // IPv4 address: every dot-separated segment is all-digits.
  if (segments.every((seg) => /^\d+$/.test(seg))) return null;

  // Only rewrite if there's a subdomain before the main two-part domain
  // (e.g. "jett.millerstorm.tech"), and never for "www".
  if (segments.length < 3 || segments[0] === 'www') return null;

  return segments[0];
}
