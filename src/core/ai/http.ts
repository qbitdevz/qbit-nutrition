// Shared transport rules: docs/09 section 2.5 and docs/07 section 9.
// HTTPS rule, timeout, cancellation, one retry on 5xx or network error and
// none on 4xx, and the mapping of HTTP failures to the error taxonomy.
import { CancelledError, ProviderError, redact } from './errors';
import { assertSecureBaseUrl, originOf } from './url';
import type { AiDeps, HttpClient, HttpResponse } from './types';

const DEFAULT_RETRY_DELAY_MS = 1000;

type Headers = HttpResponse['headers'];

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function seconds(value: string): number | undefined {
  const n = Number(value);
  if (value.trim() !== '' && Number.isFinite(n) && n >= 0) return Math.ceil(n);
  return undefined;
}

/** Seconds until the limit resets, from `Retry-After` (seconds or HTTP date) or a Gemini `RetryInfo` detail. */
function retryAfterSeconds(headers: Headers, body: unknown, now: number): number | undefined {
  const header = headers.get('retry-after');
  if (header) {
    const s = seconds(header);
    if (s !== undefined) return s;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - now) / 1000));
  }
  const details = asRecord(asRecord(body)?.error)?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const delay = asRecord(d)?.retryDelay;
      if (typeof delay === 'string') {
        const m = /^(\d+(?:\.\d+)?)s$/.exec(delay);
        if (m) return Math.ceil(Number(m[1]));
      }
    }
  }
  return undefined;
}

/** Pulls message, type, and code out of the error shapes of all three protocols. */
export function describeErrorBody(bodyText: string): { message: string; kind: string; body: unknown } {
  const body = parseJson(bodyText);
  const err = asRecord(asRecord(body)?.error) ?? asRecord(body);
  const message = typeof err?.message === 'string' ? err.message : typeof body === 'string' ? body : bodyText;
  const parts: string[] = [];
  for (const key of ['type', 'code', 'status']) {
    if (typeof err?.[key] === 'string') parts.push(err[key] as string);
  }
  const details = err?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const reason = asRecord(d)?.reason;
      if (typeof reason === 'string') parts.push(reason);
    }
  }
  return { message, kind: parts.join(' ').toLowerCase(), body };
}

export function mapHttpFailure(
  status: number,
  headers: Headers,
  bodyText: string,
  context: { apiKey: string | null; now: number },
): ProviderError {
  const { message, kind, body } = describeErrorBody(bodyText);
  const text = `${kind} ${message}`.toLowerCase();
  const options = {
    status,
    // Redact first, then cut: a key straddling the cut must not leak a prefix.
    detail: `HTTP ${status}: ${redact(message, [context.apiKey]).slice(0, 500)}`,
    secrets: [context.apiKey],
  };

  if (status === 401 || status === 403) return new ProviderError('auth_invalid', options);
  // Gemini reports a bad key as 400 INVALID_ARGUMENT with reason API_KEY_INVALID.
  if (/api_key_invalid|api key not valid|invalid api key/.test(text)) return new ProviderError('auth_invalid', options);
  if (status === 429 || status === 402 || /insufficient_quota|resource_exhausted|rate_limit/.test(kind)) {
    return new ProviderError('quota_exceeded', {
      ...options,
      retryAfterS: retryAfterSeconds(headers, body, context.now),
    });
  }
  if (status >= 500) return new ProviderError('provider_unavailable', options);
  if (
    /(image|vision|multimodal|multi-modal).*(not supported|unsupported|only supported|not support|does not accept)/.test(text) ||
    /(not supported|unsupported|does not support|not support).*(image|vision|multimodal|multi-modal)/.test(text) ||
    /not (a )?(vision|multimodal)/.test(text)
  ) {
    return new ProviderError('no_vision', options);
  }
  if (
    status === 404 ||
    /model_not_found|unknown model|invalid model|model.*(not found|does not exist|not exist)/.test(text)
  ) {
    return new ProviderError('model_not_found', options);
  }
  if (/content_policy|safety|refus|blocked/.test(text)) return new ProviderError('content_refused', options);
  return new ProviderError('unknown', options);
}

const redirected = () =>
  new ProviderError('insecure_url', {
    detail:
      'The provider redirected the request. Redirects are refused so the key and photo stay with the configured host.',
  });

/** `fetch` with `redirect: 'error'` rejects; engines word it differently and often put it in `cause`. */
function isRedirectRejection(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 3; depth++) {
    const message = current instanceof Error ? current.message : String(current);
    if (/redirect/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Defense for platforms whose fetch ignores `redirect: 'error'`: if the response
 * says it came from another origin, refuse it and never return its body.
 *
 * This second check CANNOT stop the key from having been sent: by the time a
 * response exists, the request (key and photo included) has already reached the
 * redirect target. The platform layer must supply a fetch that does not follow
 * redirects; this only keeps such a response from being used.
 */
function assertNotRedirected(response: HttpResponse, requestedUrl: string): void {
  const finalUrl = response.url;
  if (finalUrl) {
    const requested = originOf(requestedUrl);
    if (requested === null || originOf(finalUrl) !== requested) throw redirected();
  } else if (response.redirected === true) {
    throw redirected();
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  promise.catch(() => {}); // a late failure after an abort must not surface as unhandled
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('aborted'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function createHttpClient(deps: AiDeps): HttpClient {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const retryDelayMs = deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  async function attempt(options: Parameters<HttpClient['request']>[0]) {
    const timer = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      timer.abort();
    }, options.profile.timeoutS * 1000);
    const onCancel = () => timer.abort();
    options.signal.addEventListener('abort', onCancel, { once: true });
    try {
      const response = await raceAbort(
        deps.fetch(options.url, {
          method: options.method,
          headers: options.headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          redirect: 'error',
          signal: timer.signal,
        }),
        timer.signal,
      );
      assertNotRedirected(response, options.url); // before the body is read
      const bodyText = await raceAbort(response.text(), timer.signal);
      return { kind: 'response' as const, status: response.status, headers: response.headers, bodyText };
    } catch (error) {
      if (error instanceof ProviderError) throw error; // e.g. a redirect: never retried
      if (options.signal.aborted) throw new CancelledError();
      if (isRedirectRejection(error)) throw redirected();
      if (timedOut) throw new ProviderError('timeout', { detail: `No answer within ${options.profile.timeoutS} s.` });
      return {
        kind: 'network' as const,
        detail: redact(error instanceof Error ? error.message : String(error), [options.apiKey]),
      };
    } finally {
      clearTimeout(timeoutId);
      options.signal.removeEventListener('abort', onCancel);
    }
  }

  return {
    async request(options) {
      assertSecureBaseUrl(options.url);
      for (let tries = 0; ; tries++) {
        if (options.signal.aborted) throw new CancelledError();
        const outcome = await attempt(options);
        const retryable = outcome.kind === 'network' || outcome.status >= 500;
        if (retryable && tries === 0) {
          await sleep(retryDelayMs);
          continue;
        }
        if (outcome.kind === 'network') {
          throw new ProviderError('no_network', { detail: outcome.detail });
        }
        if (outcome.status >= 200 && outcome.status < 300) {
          return { status: outcome.status, headers: outcome.headers, bodyText: outcome.bodyText };
        }
        throw mapHttpFailure(outcome.status, outcome.headers, outcome.bodyText, {
          apiKey: options.apiKey,
          now: now(),
        });
      }
    },
  };
}
