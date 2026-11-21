import { analyzeMeal, ProviderError } from '@/core/ai';
import type { FetchLike, HttpResponse } from '@/core/ai/types';
import { createRedirectSafeFetch, RedirectRefusedError } from '../safeFetch';

const URL_ = 'https://api.example.com/v1/chat/completions';
const SECRET = 'sk-test-secret-123456';
const init = (over: Partial<Parameters<FetchLike>[1]> = {}): Parameters<FetchLike>[1] => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${SECRET}` },
  body: '{}',
  redirect: 'error',
  ...over,
});

const response = (over: Partial<HttpResponse> = {}): HttpResponse => ({
  status: 200,
  headers: { get: () => null },
  text: jest.fn(async () => '{"ok":true}'),
  ...over,
});

describe('createRedirectSafeFetch', () => {
  it('always asks the platform for redirect: error, whatever the caller passes', async () => {
    const base = jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () => response());
    const safe = createRedirectSafeFetch(base);
    await safe(URL_, { ...init(), redirect: 'follow' } as unknown as Parameters<FetchLike>[1]);
    expect(base.mock.calls[0]![1].redirect).toBe('error');
  });

  it('passes an ordinary response through untouched', async () => {
    const res = response({ url: URL_, redirected: false });
    const safe = createRedirectSafeFetch(async () => res);
    await expect(safe(URL_, init())).resolves.toBe(res);
    expect(res.text).not.toHaveBeenCalled();
  });

  it('accepts a final URL that differs only by case and default port', async () => {
    const safe = createRedirectSafeFetch(async () => response({ url: 'HTTPS://API.example.com:443/v1/chat/completions' }));
    await expect(safe(URL_, init())).resolves.toBeDefined();
  });

  it('refuses a response that says it was redirected, without reading its body', async () => {
    const res = response({ redirected: true });
    const safe = createRedirectSafeFetch(async () => res);
    await expect(safe(URL_, init())).rejects.toBeInstanceOf(RedirectRefusedError);
    expect(res.text).not.toHaveBeenCalled();
  });

  it('refuses a changed final origin (host, scheme, or port) without reading the body', async () => {
    for (const finalUrl of [
      'https://evil.example.net/v1/chat/completions',
      'http://api.example.com/v1/chat/completions',
      'https://api.example.com:8443/v1/chat/completions',
    ]) {
      const res = response({ url: finalUrl });
      const safe = createRedirectSafeFetch(async () => res);
      await expect(safe(URL_, init())).rejects.toBeInstanceOf(RedirectRefusedError);
      expect(res.text).not.toHaveBeenCalled();
    }
  });

  it('refuses a final URL it cannot judge', async () => {
    const safe = createRedirectSafeFetch(async () => response({ url: 'not a url' }));
    await expect(safe(URL_, init())).rejects.toBeInstanceOf(RedirectRefusedError);
  });

  it.each([301, 302, 303, 307, 308])('refuses a surfaced %i status: a redirect that was not followed is still a redirect', async (status) => {
    const res = response({ status, headers: { get: (n: string) => (n.toLowerCase() === 'location' ? 'https://evil.example.net/' : null) } });
    const safe = createRedirectSafeFetch(async () => res);
    await expect(safe(URL_, init())).rejects.toBeInstanceOf(RedirectRefusedError);
    expect(res.text).not.toHaveBeenCalled();
  });

  it('does not treat 304, 4xx or 5xx as a redirect', async () => {
    for (const status of [304, 401, 429, 500]) {
      const safe = createRedirectSafeFetch(async () => response({ status }));
      await expect(safe(URL_, init())).resolves.toMatchObject({ status });
    }
  });

  it('lets a platform rejection through unchanged (the engine already refused the redirect)', async () => {
    const failure = new TypeError("Redirect is not allowed when redirect mode is 'error'");
    const safe = createRedirectSafeFetch(async () => {
      throw failure;
    });
    await expect(safe(URL_, init())).rejects.toBe(failure);
  });

  it('the refusal never echoes the credential or the redirect target', async () => {
    const safe = createRedirectSafeFetch(async () => response({ url: `https://evil.example.net/?k=${SECRET}` }));
    const error = await safe(URL_, init()).catch((e: unknown) => e as Error);
    expect(String(error)).not.toContain(SECRET);
    expect(String(error)).not.toContain('evil.example.net');
  });

  it('is seen by core/ai as an insecure_url failure, and the body is never used', async () => {
    const res = response({ redirected: true, text: jest.fn(async () => '{"choices":[]}') });
    const safe = createRedirectSafeFetch(async () => res);
    const outcome = await analyzeMeal(
      {
        profile: { id: 'p', adapter: 'openai_compatible', baseUrl: 'https://api.example.com/v1', model: 'm', timeoutS: 5 },
        apiKey: SECRET,
        imageJpegBase64: 'AAAA',
        locale: 'en',
        signal: new AbortController().signal,
      },
      { fetch: safe, retryDelayMs: 0, sleep: async () => undefined },
    ).catch((e: unknown) => e);
    expect(outcome).toBeInstanceOf(ProviderError);
    expect((outcome as ProviderError).code).toBe('insecure_url');
    expect(res.text).not.toHaveBeenCalled();
  });
});
