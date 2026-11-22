// Provider error taxonomy: docs/09-interfaces-and-integrations.md section 1.2.

export type ProviderErrorCode =
  | 'no_network'
  | 'timeout'
  | 'auth_invalid'
  | 'model_not_found'
  | 'no_vision'
  | 'quota_exceeded'
  | 'provider_unavailable'
  | 'content_refused'
  | 'invalid_output'
  | 'insecure_url'
  | 'unknown';

const MAX_TEXT = 1000;

/**
 * Redacts first and truncates last, so a secret cut by the limit cannot leak a prefix.
 * Removes anything that could identify the user or reveal a credential from
 * text that may be shown or stored: the API key itself, bearer tokens,
 * well-known key shapes, and long base64 runs (image data).
 */
export function redact(text: string, secrets: readonly (string | null | undefined)[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 6) continue;
    // The key as typed, and as it would appear URL-encoded (including the + form of a space).
    const encoded = encodeURIComponent(secret);
    for (const form of new Set([secret, encoded, encoded.replace(/%20/g, '+')])) {
      out = out.split(form).join('[redacted]');
    }
  }
  out = out
    .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/[A-Za-z0-9+/=_-]{200,}/g, '[data]');
  return out.length > MAX_TEXT * 2 ? `${out.slice(0, MAX_TEXT * 2)}…` : out;
}

export interface ProviderErrorOptions {
  /** Seconds until the limit resets, when the provider says so. */
  retryAfterS?: number;
  /** Redacted human-readable detail. Never contains the key. */
  detail?: string;
  /** HTTP status when the failure came from a response. */
  status?: number;
  /** Redacted raw model output, for the debug view (`invalid_output`). */
  rawResponse?: string;
  /** Secrets to strip from `detail` and `rawResponse`. */
  secrets?: readonly (string | null | undefined)[];
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryAfterS?: number;
  readonly detail?: string;
  readonly status?: number;
  readonly rawResponse?: string;

  constructor(code: ProviderErrorCode, options: ProviderErrorOptions = {}) {
    super(code);
    this.name = 'ProviderError';
    this.code = code;
    this.retryAfterS = options.retryAfterS;
    this.status = options.status;
    this.detail = options.detail === undefined ? undefined : redact(options.detail, options.secrets);
    this.rawResponse = options.rawResponse === undefined ? undefined : redact(options.rawResponse, options.secrets);
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

/** The model answered, but the photo has no food. Not a provider failure. */
export class NoFoodDetectedError extends Error {
  constructor() {
    super('no_food_detected');
    this.name = 'NoFoodDetectedError';
    Object.setPrototypeOf(this, NoFoodDetectedError.prototype);
  }
}

/** The caller aborted. Named like the platform's own abort error. */
export class CancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'AbortError';
    Object.setPrototypeOf(this, CancelledError.prototype);
  }
}
