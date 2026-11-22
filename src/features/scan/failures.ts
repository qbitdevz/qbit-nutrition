import { CancelledError, NoFoodDetectedError, ProviderError, redact } from '@/core/ai';
import { SecretStoreError } from '@/platform/secretStore';
import { ScanSetupError } from './scanGateway';

/** The causes of a failed scan, one screen each (docs/04 flow C). */
export type FailureKind =
  | 'no_provider'
  | 'no_network'
  | 'auth_invalid'
  | 'quota'
  | 'no_vision'
  | 'model_not_found'
  | 'invalid_output'
  | 'no_food'
  | 'provider_changed'
  | 'insecure_url'
  | 'timeout'
  | 'provider_unavailable'
  | 'photo_unreadable'
  | 'unknown';

export interface ScanFailure {
  kind: FailureKind;
  /** Seconds until a limit resets, when the provider says so. */
  retryAfterS?: number;
  /** A redacted technical detail, shown only for an unknown error. Never contains the key. */
  detail?: string;
  /** The profile the scan used, for "AI provider: X"; null when there was none. */
  providerLabel: string | null;
  /** The host of that profile's base URL, shown next to the label: a label can say anything, the address cannot. */
  providerHost?: string | null;
}

/** What `scan.error_code` stores for an attempt that did not produce a result. */
export interface Classified {
  failure: Omit<ScanFailure, 'providerLabel' | 'providerHost'>;
  /** `ok` is never returned here: a finished scan is not a failure. */
  status: 'error' | 'no_food';
  errorCode: string | null;
}

const PROVIDER_KINDS: Record<string, FailureKind> = {
  no_network: 'no_network',
  timeout: 'timeout',
  auth_invalid: 'auth_invalid',
  model_not_found: 'model_not_found',
  no_vision: 'no_vision',
  quota_exceeded: 'quota',
  provider_unavailable: 'provider_unavailable',
  content_refused: 'no_food', // docs/07 section 9: a refusal is shown as "no food detected"
  invalid_output: 'invalid_output',
  insecure_url: 'insecure_url',
};

/**
 * Maps whatever the scan threw to its failure screen and its `scan` row. Technical text is redacted
 * (key shapes, bearer tokens, long base64 runs) and only the unknown case shows it at all.
 */
export function classifyFailure(error: unknown): Classified {
  if (error instanceof NoFoodDetectedError) return { failure: { kind: 'no_food' }, status: 'no_food', errorCode: null };
  if (error instanceof CancelledError) return { failure: { kind: 'unknown' }, status: 'error', errorCode: 'cancelled' };
  if (error instanceof ScanSetupError) {
    return { failure: { kind: error.code === 'no_provider' ? 'no_provider' : 'provider_changed' }, status: 'error', errorCode: error.code };
  }
  if (error instanceof ProviderError) {
    const kind = PROVIDER_KINDS[error.code] ?? 'unknown';
    return {
      failure: { kind, ...(error.retryAfterS !== undefined ? { retryAfterS: error.retryAfterS } : {}), ...(kind === 'unknown' ? { detail: describe(error) } : {}) },
      status: kind === 'no_food' ? 'no_food' : 'error',
      errorCode: kind === 'no_food' ? null : error.code,
    };
  }
  if (error instanceof SecretStoreError) {
    return { failure: { kind: 'unknown', detail: `SecretStoreError (${error.code}): the key could not be read from secure storage.` }, status: 'error', errorCode: 'secret_store' };
  }
  return { failure: { kind: 'unknown', detail: describe(error) }, status: 'error', errorCode: 'unknown' };
}

function describe(error: unknown): string {
  if (error instanceof ProviderError) {
    const status = error.status && !error.detail?.includes(String(error.status)) ? ` (HTTP ${error.status})` : '';
    return redact(`${error.code}${status}${error.detail ? `: ${error.detail}` : ''}`);
  }
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return redact(`${name}: ${message}`);
}
