import { originOf } from '@/core/ai/url';
import type { FetchLike } from '@/core/ai/types';

/**
 * S10 — a fetch that never lets the key and the photo follow a redirect (docs/06 section 6).
 *
 * What was found in the installed sources (React Native 0.88.1, Expo SDK 58):
 *
 * - React Native's global `fetch` is the `whatwg-fetch` polyfill over XMLHttpRequest. It ignores the
 *   `redirect` option, and on Android the native networking module builds its OkHttp client without
 *   changing OkHttp's default of following redirects. So `redirect: 'error'` does NOTHING there: a
 *   301/307/308 to another host is followed, and `x-api-key` or `x-goog-api-key` are sent along
 *   (OkHttp only strips `Authorization` on a cross-host redirect). The global fetch must not be used.
 * - `expo/fetch` (expo/src/winter/fetch) does honor it. Android: for any mode other than `follow` it
 *   builds the client with `followRedirects(false)` and `followSslRedirects(false)`, so the redirect
 *   response is received from the original host only and the target is never contacted; the
 *   response is then failed with "Redirect is not allowed when redirect mode is 'error'". iOS: the
 *   URLSession delegate answers the redirect with nil, which cancels it, and fails the same way.
 *
 * So on a device the first line of defense is `expo/fetch` with `redirect: 'error'` (see
 * `deviceFetch.ts`), which prevents the key from being sent anywhere else.
 *
 * This wrapper is the second line, for an engine that ignores the option: it always asks for
 * `redirect: 'error'`, and then, before the body is read or returned, refuses a response that says it
 * was redirected, whose final URL has a different origin or cannot be judged, or whose status is a
 * redirect that was not followed. In that case, on an engine that really followed the redirect, THE KEY
 * AND THE PHOTO MAY ALREADY HAVE BEEN SENT to the other host: by the time a response exists, the
 * request has been made. This check only stops that response from being used. It is not a substitute
 * for an engine that refuses the redirect.
 */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** Raised when a response shows a redirect. The message says "redirect" so `core/ai` maps it to `insecure_url`; it names neither the key nor the target. */
export class RedirectRefusedError extends Error {
  constructor() {
    super('The provider redirected the request; redirects are refused.');
    this.name = 'RedirectRefusedError';
  }
}

export function createRedirectSafeFetch(base: FetchLike): FetchLike {
  return async (url, init) => {
    const response = await base(url, { ...init, redirect: 'error' });

    if (response.redirected === true || REDIRECT_STATUSES.has(response.status)) throw new RedirectRefusedError();
    if (response.url) {
      const requested = originOf(url);
      if (requested === null || originOf(response.url) !== requested) throw new RedirectRefusedError();
    }
    return response;
  };
}
