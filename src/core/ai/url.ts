// HTTPS rule: docs/09 section 2.5. Plain HTTP only to loopback and
// private-network hosts. Parsed by hand so it behaves the same in Node and
// React Native (whose URL implementation is partial).
//
// The parser is deliberately stricter than the WHATWG URL parser: anything
// ambiguous is rejected, because a platform `fetch` may read a URL differently
// from this check (backslashes, octal octets, odd hosts) and connect somewhere
// this check never judged.
import { ProviderError } from './errors';

const URL_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(?:([^@/?#]*)@)?(\[[^\]]*\]|[^:/?#]*)(?::(\d*))?(?:[/?#]|$)/i;

const reject = (detail: string) => new ProviderError('unknown', { detail });

/** Backslash, whitespace (including Unicode spaces), and control characters. */
function hasForbiddenCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code <= 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f) || char === '\\') return true;
    if (/\s/.test(char)) return true;
  }
  return false;
}

const DOTTED_NUMERIC = /^\d+(?:\.\d+){3}$/;

/** Canonical dotted quad, or null. Octets with a leading zero are never canonical (fetch may read them as octal). */
function ipv4(host: string): number[] | null {
  if (!DOTTED_NUMERIC.test(host)) return null;
  const octets = host.split('.');
  if (octets.some((o) => o.length > 3 || (o.length > 1 && o.startsWith('0')))) return null;
  const parts = octets.map(Number);
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

/** Expands an IPv6 literal to eight 16-bit groups, or null when it is malformed. */
function parseIpv6(host: string): number[] | null {
  if (!/^[0-9a-f:.]+$/i.test(host)) return null; // also rejects zone ids (%)
  const halves = host.split('::');
  if (halves.length > 2) return null;

  const toGroups = (side: string, allowIpv4Tail: boolean): number[] | null => {
    if (side === '') return [];
    const pieces = side.split(':');
    const groups: number[] = [];
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      if (piece.includes('.')) {
        const v4 = i === pieces.length - 1 && allowIpv4Tail ? ipv4(piece) : null;
        if (!v4) return null;
        groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else if (/^[0-9a-f]{1,4}$/i.test(piece)) {
        groups.push(parseInt(piece, 16));
      } else {
        return null;
      }
    }
    return groups;
  };

  if (halves.length === 1) {
    const groups = toGroups(halves[0], true);
    return groups && groups.length === 8 ? groups : null;
  }
  const head = toGroups(halves[0], false);
  const tail = toGroups(halves[1], true);
  if (!head || !tail || head.length + tail.length > 7) return null;
  return [...head, ...new Array<number>(8 - head.length - tail.length).fill(0), ...tail];
}

function isPrivateIpv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  if (groups.slice(0, 7).every((g) => g === 0) && g7 === 1) return true; // ::1
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    // IPv4-mapped: judge the embedded address.
    return isPrivateIpv4([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]);
  }
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/** True for loopback and private-network hosts (host without brackets or port). Expects a validated host. */
export function isPrivateHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const v4 = ipv4(host);
  if (v4) return isPrivateIpv4(v4);

  if (host.includes(':')) {
    const groups = parseIpv6(host);
    return groups ? isPrivateIpv6(groups) : false;
  }
  return false;
}

interface ParsedUrl {
  scheme: 'http' | 'https';
  host: string; // lower-case, no brackets, no trailing dot
  port: number;
}

/**
 * Parses and validates an http(s) URL; throws `unknown` for anything this
 * module cannot judge unambiguously.
 */
function parseStrict(url: string): ParsedUrl {
  if (hasForbiddenCharacter(url)) {
    throw reject('The URL must not contain backslashes, whitespace, or control characters.');
  }
  const m = URL_PATTERN.exec(url);
  if (!m) throw reject('The base URL is not a valid http(s) URL.');
  const scheme = m[1].toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') throw reject(`Unsupported URL scheme "${scheme}".`);
  if (m[2] !== undefined) throw reject('The base URL must not contain credentials.');

  const rawHost = m[3];
  const bracketed = rawHost.startsWith('[');
  const host = (bracketed ? rawHost.slice(1, -1) : rawHost).toLowerCase();
  if (!host) throw reject('The base URL has no host.');

  if (bracketed) {
    if (!parseIpv6(host)) throw reject('The base URL has a malformed IPv6 address.');
  } else {
    if (DOTTED_NUMERIC.test(host) && !ipv4(host)) {
      throw reject('IPv4 octets must be plain decimal numbers without leading zeros.');
    }
    // One trailing dot (an absolute name) is fine; any other empty label is not.
    if (host.replace(/\.$/, '').split('.').some((label) => label === '')) {
      throw reject('The base URL host has an empty label.');
    }
  }

  const port = m[4] === undefined || m[4] === '' ? (scheme === 'https' ? 443 : 80) : Number(m[4]);
  if (!(port >= 1 && port <= 65535)) throw reject('The base URL port is out of range.');

  return { scheme, host: host.replace(/\.$/, ''), port };
}

/**
 * Throws `insecure_url` for plain HTTP to a public host. Anything that is not
 * an unambiguous http(s) URL, or that embeds credentials, is rejected as
 * `unknown` (credentials in a URL would travel outside the headers).
 */
export function assertSecureBaseUrl(baseUrl: string): void {
  const { scheme, host } = parseStrict(baseUrl);
  if (scheme === 'http' && !isPrivateHost(host)) {
    throw new ProviderError('insecure_url', {
      detail: 'Plain HTTP is only allowed for loopback and private-network hosts.',
    });
  }
}

/** `scheme://host:port` in canonical form, or null when the URL cannot be parsed. Default ports are explicit. */
export function originOf(url: string): string | null {
  try {
    const { scheme, host, port } = parseStrict(url);
    return `${scheme}://${host}:${port}`;
  } catch {
    return null;
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}
