/**
 * Where a request goes, in words the person can check. A profile's label is whatever was typed (or came in a file), so it can say
 * "OpenAI" while the address points somewhere else: every place that says where data goes, or asks for a key, shows the host of
 * the base URL next to the label.
 */
const AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)(?::(\d+))?/i;

/** `host` or `host:port` of a base URL, lower-case, without credentials, path or query. Text that is not a URL is returned as it is. */
export function hostOf(baseUrl: string): string {
  const match = AUTHORITY.exec(baseUrl.trim());
  if (!match || !match[1]) return baseUrl.trim();
  return `${match[1].toLowerCase()}${match[2] ? `:${match[2]}` : ''}`;
}

/** "Label (host)". */
export const destinationOf = (provider: { label: string; baseUrl: string }): string => `${provider.label} (${hostOf(provider.baseUrl)})`;
