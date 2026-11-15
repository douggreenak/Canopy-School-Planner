// ============================================================
// Validation for user-supplied PowerSchool portal URLs.
//
// The URL a user saves is opened by headless Chromium running on OUR server,
// with their credentials typed into whatever page loads. Without a check, a
// logged-in user could point it at http://169.254.169.254 (cloud metadata),
// localhost services, or other internal hosts and read results back through
// the sync log / error messages (SSRF). Real PowerSchool portals are always
// public HTTPS hostnames, so we require exactly that.
//
// Note: this validates the literal hostname. A public DNS name that resolves
// to a private address is not caught here — block that at the network layer
// (egress firewall) if you self-host the sync runner on a private network.
// ============================================================

export type PowerSchoolUrlCheck = { ok: true; origin: string } | { ok: false; error: string };

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet'];

function isIpLiteral(host: string): boolean {
  // IPv6 literals come bracketed from URL.hostname ("[::1]"); IPv4 is dotted digits.
  return host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host);
}

export function checkPowerSchoolUrl(raw: unknown): PowerSchoolUrlCheck {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'Enter your PowerSchool URL.' };
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'That doesn’t look like a valid URL (try https://your-school.powerschool.com).' };
  }
  if (u.protocol !== 'https:') return { ok: false, error: 'The PowerSchool URL must start with https://.' };
  if (u.username || u.password) return { ok: false, error: 'The PowerSchool URL must not contain a username or password.' };
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || isIpLiteral(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: 'The PowerSchool URL must be a public school website address, not an IP address or internal host.' };
  }
  return { ok: true, origin: u.origin };
}

/** Throws with a user-facing message if the URL isn't an acceptable PowerSchool portal. */
export function assertPowerSchoolUrl(raw: unknown): string {
  const check = checkPowerSchoolUrl(raw);
  if (!check.ok) throw new Error(check.error);
  return check.origin;
}
