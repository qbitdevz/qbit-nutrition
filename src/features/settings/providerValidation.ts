import { ProviderError, assertSecureBaseUrl, type ProviderErrorCode } from '@/core/ai';
import { MAX_TIMEOUT_S, MIN_TIMEOUT_S } from '@/data';
import { normalizeBaseUrl } from './providerService';

export type UrlProblem = 'required' | 'insecure' | 'invalid' | 'credentials';

/**
 * Judges a base URL with core's own rule (`assertSecureBaseUrl`, docs/09 section 2.5), so the form and
 * the request layer can never disagree. Returns which message to show, or null when the URL is fine.
 */
export function checkBaseUrl(text: string): UrlProblem | null {
  const url = normalizeBaseUrl(text);
  if (url === '') return 'required';
  try {
    assertSecureBaseUrl(url);
    return null;
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.code === 'insecure_url') return 'insecure';
      if (/credentials/i.test(error.detail ?? '')) return 'credentials';
    }
    return 'invalid';
  }
}

export const urlMessageKey = (problem: UrlProblem): string => `providers.url.${problem}`;

/** Whole seconds within the range the repository accepts, or null. */
export function parseTimeout(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= MIN_TIMEOUT_S && value <= MAX_TIMEOUT_S ? value : null;
}

/** One distinct message per outcome of "Test connection". */
export const testResultKey = (code: 'ok' | ProviderErrorCode | 'key_storage'): string => `providers.test.result.${code}`;
