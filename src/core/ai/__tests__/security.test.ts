import {
  SAMPLE_JPEG_BASE64,
  anthropicText,
  fakeFetch,
  hangingResponder,
  noSleep,
  openaiError,
  openaiText,
  profiles,
  res,
  validScanResult,
} from '../__fixtures__/fixtures';
import { ProviderError } from '../errors';
import { analyzeMeal, listModels } from '../pipeline';
import type { ProviderProfile } from '../types';
import { assertSecureBaseUrl } from '../url';

const JSON_TEXT = JSON.stringify(validScanResult);
const openai: ProviderProfile = { ...profiles.openai, outputMode: 'schema' };
const KEY = 'test-key-abcdef123456';

type Fake = ReturnType<typeof fakeFetch>;
const run = (profile: ProviderProfile, fake: Fake, signal = new AbortController().signal, sleep = noSleep) =>
  analyzeMeal(
    { profile, apiKey: KEY, imageJpegBase64: SAMPLE_JPEG_BASE64, locale: 'en', signal },
    { fetch: fake.fetch, sleep },
  );

async function failure(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

const urlCode = (url: string): string | null => {
  try {
    assertSecureBaseUrl(url);
    return null;
  } catch (e) {
    return (e as ProviderError).code;
  }
};

const BACKSLASH = String.fromCharCode(92);

describe('redirects never carry the key', () => {
  it.each([
    ['openai', openai],
    ['anthropic', { ...profiles.anthropic, outputMode: 'schema' as const }],
    ['gemini', { ...profiles.gemini, outputMode: 'schema' as const }],
  ])('%s: always sends redirect: "error"', async (_n, profile) => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    await run(profile, fake).catch(() => undefined); // the body may not suit the adapter; the request is what matters
    expect(fake.calls[0].redirect).toBe('error');
  });

  it('sends redirect: "error" when listing models too', async () => {
    const fake = fakeFetch(res(200, { data: [] }));
    await listModels(openai, KEY, { fetch: fake.fetch, sleep: noSleep });
    expect(fake.calls[0].redirect).toBe('error');
  });

  it.each([
    new TypeError('redirect mode is set to error: https://other.example.test/'),
    Object.assign(new TypeError('fetch failed'), { cause: new Error('redirect mode is set to error') }),
  ])('maps a rejected redirect to insecure_url, once, without retry (%#)', async (rejection) => {
    const fake = fakeFetch(rejection);
    const err = await failure(run(openai, fake));
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('insecure_url');
    expect(err.detail).toMatch(/redirect/i);
    expect(fake.calls).toHaveLength(1);
  });

  it('still retries an ordinary network error', async () => {
    const fake = fakeFetch(new TypeError('Network request failed'));
    expect((await failure(run(openai, fake))).code).toBe('no_network');
    expect(fake.calls).toHaveLength(2);
  });

  it('rejects a response whose final origin differs, and never reads its body', async () => {
    const response = res(200, openaiText(JSON_TEXT), {}, { redirected: true, url: 'https://other.example.test/v1/chat/completions' });
    const text = jest.fn(response.text);
    const fake = fakeFetch({ ...response, text });
    const err = await failure(run(openai, fake));
    expect(err.code).toBe('insecure_url');
    expect(err.detail).toMatch(/redirect/i);
    expect(text).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(1);
  });

  it('rejects an HTTPS-to-HTTP downgrade reported by response.url', async () => {
    const response = res(200, openaiText(JSON_TEXT), {}, { url: 'http://llm.example.test/v1/chat/completions' });
    const err = await failure(run(openai, fakeFetch(response)));
    expect(err.code).toBe('insecure_url');
  });

  it('rejects redirected: true when the final URL is not reported', async () => {
    const err = await failure(run(openai, fakeFetch(res(200, openaiText(JSON_TEXT), {}, { redirected: true }))));
    expect(err.code).toBe('insecure_url');
  });

  it('accepts a response whose url has the same origin (default port spelled out)', async () => {
    const same = res(200, openaiText(JSON_TEXT), {}, { redirected: false, url: 'https://LLM.example.test:443/v1/chat/completions' });
    expect((await run(openai, fakeFetch(same))).result.is_food).toBe(true);
    const empty = res(200, openaiText(JSON_TEXT), {}, { url: '' });
    expect((await run(openai, fakeFetch(empty))).result.is_food).toBe(true);
  });
});

describe('base URL syntax', () => {
  it.each([
    `http://evil.com${BACKSLASH}.local/`,
    `http://8.8.8.8${BACKSLASH}.localhost/`,
    `http://evil.com${BACKSLASH}x.localhost:80`,
    `https://llm.example.test${BACKSLASH}@evil.test/`,
    'https://llm.example.test/v1 ',
    ' https://llm.example.test/v1',
    'https://llm.example.test/a b',
    'http://localhost/\t',
    'http://localhost/\n',
    'http://localhost/\r\n',
    'http://localhost/\u0000',
    'http://localhost/\u007f',
    'https://llm.example.test/\u0001',
  ])('rejects backslash, whitespace, and control characters in %j', (url) => {
    expect(urlCode(url)).toBe('unknown');
  });

  it.each(['http://evil.com@localhost', 'http://localhost@evil.com', 'https://user:pw@llm.example.test'])(
    'rejects credentials in %s',
    (url) => {
      expect(urlCode(url)).toBe('unknown');
    },
  );

  it.each([
    'http://010.1.1.1/',
    'http://172.016.0.1/',
    'http://100.064.0.1/',
    'http://192.168.001.1/',
    'http://127.0.0.01/',
    'https://010.1.1.1/',
    'https://8.8.8.08/',
  ])('rejects an IPv4 host with a leading-zero octet: %s', (url) => {
    expect(urlCode(url)).toBe('unknown');
  });

  it.each(['http://.local/', 'http://nas..local/', 'http://.localhost/', 'https://.example.test/', 'https://a..example.test/'])(
    'rejects an empty host label: %s',
    (url) => {
      expect(urlCode(url)).toBe('unknown');
    },
  );

  it.each(['http://localhost:99999/', 'http://localhost:65536/', 'https://llm.example.test:70000/v1'])(
    'rejects an out-of-range port: %s',
    (url) => {
      expect(urlCode(url)).toBe('unknown');
    },
  );

  it.each([
    'http://[fc00zzz::1]/',
    'http://[::1::2]/',
    'http://[1:2:3]/',
    'http://[fe80::1%25eth0]/',
    'http://[12345::1]/',
    'http://[::g]/',
    'https://[fc00zzz::1]/',
  ])('rejects malformed IPv6: %s', (url) => {
    expect(urlCode(url)).toBe('unknown');
  });

  it.each([
    'http://localhost',
    'http://LOCALHOST:11434/v1',
    'http://localhost./v1',
    'http://localhost:65535/',
    'http://127.0.0.1/',
    'http://10.255.255.255/',
    'http://172.16.0.1/',
    'http://172.31.0.1/',
    'http://192.168.0.1/',
    'http://100.64.0.0/',
    'http://100.127.255.255/',
    'http://[::1]/',
    'http://[0:0:0:0:0:0:0:1]:11434/',
    'http://[fc00::1]/',
    'http://[fdff:ffff::1]/',
    'http://[fe80::1]/',
    'http://[febf::1]/',
    'http://nas.local/',
    'http://a.b.local:8080/v1',
    'https://llm.example.test/v1',
  ])('still allows %s', (url) => {
    expect(urlCode(url)).toBeNull();
  });

  it.each(['http://100.63.255.255/', 'http://100.128.0.0/', 'http://[fec0::1]/', 'http://[fb00::1]/', 'http://[::]/'])(
    'still rejects plain HTTP to the public-side neighbour %s',
    (url) => {
      expect(urlCode(url)).toBe('insecure_url');
    },
  );

  it('is enforced by the public functions before any request', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    const bad = [
      `http://evil.com${BACKSLASH}.local/`,
      'http://010.1.1.1/',
      'http://.local/',
      'http://localhost:99999/',
      'http://[fc00zzz::1]/',
    ];
    for (const baseUrl of bad) {
      const err = await failure(run({ ...openai, baseUrl }, fake));
      expect(err.code).toBe('unknown');
    }
    expect(fake.calls).toHaveLength(0);
  });
});

describe('redaction', () => {
  // Spaced so the generic long-run rule cannot mask a leak: exactly n characters.
  const pad = (n: number) => 'x '.repeat(Math.ceil(n / 2)).slice(0, n);

  it('redacts a key that straddles the 500-character cut of a provider message', async () => {
    for (const offset of [490, 495, 497, 499]) {
      const body = JSON.stringify({ error: { message: pad(offset) + KEY + ' trailing' } });
      const err = await failure(run(openai, fakeFetch(res(400, body))));
      expect(err.detail).not.toContain(KEY.slice(0, 6));
    }
  });

  it('redacts a key that straddles the raw-body cut of a malformed 200', async () => {
    for (const offset of [1990, 1995, 1998]) {
      const err = await failure(run(openai, fakeFetch(res(200, pad(offset) + KEY + pad(50)))));
      expect(err.code).toBe('unknown');
      expect(err.rawResponse).not.toContain(KEY.slice(0, 6));
    }
  });

  it('redacts the URL-encoded form of the key', async () => {
    const key = 'sk/ab+cd=ef gh:12345';
    const encoded = encodeURIComponent(key);
    const body = JSON.stringify({ error: { message: `bad key ${encoded} and ${key}` } });
    const fake = fakeFetch(res(400, body));
    const err = await failure(
      analyzeMeal(
        { profile: openai, apiKey: key, imageJpegBase64: SAMPLE_JPEG_BASE64, locale: 'en', signal: new AbortController().signal },
        { fetch: fake.fetch, sleep: noSleep },
      ),
    );
    expect(err.detail).not.toContain(encoded);
    expect(err.detail).not.toContain(key);
    expect(err.detail).not.toContain('ab%2Bcd');
  });

  it('keeps the short-secret guard: a 3-character key is not stripped from ordinary text', () => {
    const e = new ProviderError('unknown', { detail: 'the model is down', secrets: ['the'] });
    expect(e.detail).toBe('the model is down');
  });

  it('redacts the key from raw model output on invalid_output', async () => {
    const fake = fakeFetch(res(200, openaiText(`not json ${KEY}`)));
    const err = await failure(run(openai, fake));
    expect(err.code).toBe('invalid_output');
    expect(err.rawResponse).not.toContain(KEY);
  });
});

describe('call counts', () => {
  it.each([400, 404, 409, 422])('HTTP %i makes exactly one call', async (status) => {
    const fake = fakeFetch(res(status, openaiError('nope', 'invalid_request_error')));
    const err = await failure(run(openai, fake));
    expect(err).toBeInstanceOf(ProviderError);
    expect(fake.calls).toHaveLength(1);
  });

  it('cancellation after the first failed attempt does not retry (network error)', async () => {
    const ctl = new AbortController();
    const fake = fakeFetch(new TypeError('Network request failed'));
    const err = await failure(run(openai, fake, ctl.signal, async () => ctl.abort()));
    expect(err.name).toBe('AbortError');
    expect(err).not.toBeInstanceOf(ProviderError);
    expect(fake.calls).toHaveLength(1);
  });

  it('cancellation after the first failed attempt does not retry (5xx)', async () => {
    const ctl = new AbortController();
    const fake = fakeFetch(res(503, 'down'));
    const err = await failure(run(openai, fake, ctl.signal, async () => ctl.abort()));
    expect(err.name).toBe('AbortError');
    expect(fake.calls).toHaveLength(1);
  });

  it('cancellation during the repair call stops without another call', async () => {
    const ctl = new AbortController();
    const fake = fakeFetch(res(200, openaiText('not json')), hangingResponder);
    const pending = failure(run(openai, fake, ctl.signal));
    await new Promise((r) => setTimeout(r, 20));
    ctl.abort();
    expect((await pending).name).toBe('AbortError');
    expect(fake.calls).toHaveLength(2);
  });

  it.each([
    ['openai', openai, openaiText('{"is_food":"maybe"}')],
    ['anthropic', { ...profiles.anthropic, outputMode: 'schema' as const }, anthropicText('{"is_food":"maybe"}')],
  ])('a response that stays schema-invalid never returns (%s) and makes at most 2 calls', async (_n, profile, body) => {
    const fake = fakeFetch(res(200, body));
    const err = await failure(run(profile, fake));
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('invalid_output');
    expect(fake.calls).toHaveLength(2);
  });

  it('keeps the bound when every reply is schema-invalid and the server flaps with 5xx', async () => {
    const fake = fakeFetch(res(503, 'down'), res(200, openaiText('nope')), res(503, 'down'), res(200, openaiText('nope')));
    const err = await failure(run(openai, fake));
    expect(err.code).toBe('invalid_output');
    expect(fake.calls.length).toBeLessThanOrEqual(4);
  });
});
