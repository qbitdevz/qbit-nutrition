// HTTPS rule: docs/09 section 2.5. Plain HTTP only to loopback and
// private-network hosts. Parsed by hand so it behaves the same in Node and
// React Native (whose URL implementation is partial).
import { ProviderError } from './errors';

const URL_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(?:([^@/?#]*)@)?(\[[^\]]*\]|[^:/?#]*)(?::(\d*))?(?:[/?#]|$)/i;

function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 127 || // loopback
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // link-local
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT, used by Tailscale
  );
}

/** True for loopback and private-network hosts (host without brackets or port). */
export function isPrivateHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const v4 = ipv4(host);
  if (v4) return isPrivateIpv4(v4);

  if (host.includes(':')) {
    if (host === '::1') return true;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
    if (mapped) {
      const inner = ipv4(mapped[1]);
      return inner ? isPrivateIpv4(inner) : false;
    }
    const first = parseInt(host.split(':')[0] || '0', 16);
    if (Number.isNaN(first)) return false;
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  }
  return false;
}

/**
 * Throws `insecure_url` for plain HTTP to a public host. Anything that is not
 * a plain http(s) URL, or that embeds credentials, is rejected as `unknown`
 * (credentials in a URL would travel outside the headers).
 */
export function assertSecureBaseUrl(baseUrl: string): void {
  const m = URL_PATTERN.exec(baseUrl.trim());
  if (!m) throw new ProviderError('unknown', { detail: 'The base URL is not a valid http(s) URL.' });
  const scheme = m[1].toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new ProviderError('unknown', { detail: `Unsupported URL scheme "${scheme}".` });
  }
  if (m[2] !== undefined) {
    throw new ProviderError('unknown', { detail: 'The base URL must not contain credentials.' });
  }
  const host = m[3].replace(/^\[|\]$/g, '');
  if (!host) throw new ProviderError('unknown', { detail: 'The base URL has no host.' });
  if (scheme === 'http' && !isPrivateHost(host)) {
    throw new ProviderError('insecure_url', {
      detail: 'Plain HTTP is only allowed for loopback and private-network hosts.',
    });
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}${path}`;
}
