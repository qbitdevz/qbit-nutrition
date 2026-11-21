import { ProviderError, redact } from '../errors';
import { assertSecureBaseUrl, isPrivateHost } from '../url';

const insecure = (url: string) => {
  try {
    assertSecureBaseUrl(url);
    return null;
  } catch (e) {
    return (e as ProviderError).code;
  }
};

describe('HTTPS rule', () => {
  it('allows https anywhere', () => {
    expect(insecure('https://api.example.test/v1')).toBeNull();
  });

  it.each([
    'http://localhost:11434/v1',
    'http://app.localhost/v1',
    'http://127.0.0.1:1234/v1',
    'http://127.5.5.5/v1',
    'http://[::1]:8080/v1',
    'http://10.0.0.5:8080',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://192.168.1.20:11434',
    'http://169.254.10.10',
    'http://100.100.1.1',
    'http://[fd12:3456::1]/v1',
    'http://[fe80::1]/v1',
    'http://[::ffff:192.168.0.4]/v1',
    'http://nas.local:11434/v1',
  ])('allows plain http to %s', (url) => {
    expect(insecure(url)).toBeNull();
  });

  it.each([
    'http://api.example.test/v1',
    'http://8.8.8.8/v1',
    'http://172.32.0.1',
    'http://172.15.0.1',
    'http://192.169.0.1',
    'http://100.128.0.1',
    'http://127.0.0.1.example.test/v1',
    'http://localhost.example.test/v1',
    'http://[2001:db8::1]/v1',
    'HTTP://Example.TEST/v1',
  ])('rejects plain http to %s', (url) => {
    expect(insecure(url)).toBe('insecure_url');
  });

  it('rejects credentials in the URL and other schemes without leaking them', () => {
    expect(insecure('https://user:secret@example.test')).toBe('unknown');
    expect(insecure('ftp://example.test')).toBe('unknown');
    expect(insecure('not a url')).toBe('unknown');
    try {
      assertSecureBaseUrl('https://user:secret@example.test');
    } catch (e) {
      expect(String((e as ProviderError).detail)).not.toContain('secret');
    }
  });

  it('classifies hosts', () => {
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('example.test')).toBe(false);
  });
});

describe('ProviderError', () => {
  it('carries a code, retryAfterS, and a redacted detail', () => {
    const e = new ProviderError('quota_exceeded', { retryAfterS: 30, detail: 'key sk-abcdef1234567890 failed' });
    expect(e.code).toBe('quota_exceeded');
    expect(e.retryAfterS).toBe(30);
    expect(e.detail).not.toContain('sk-abcdef1234567890');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ProviderError');
  });

  it('redacts supplied secrets, bearer tokens, and image data', () => {
    const out = redact(`Bearer abc.def key=my-secret-key data ${'A'.repeat(400)}`, ['my-secret-key']);
    expect(out).not.toContain('my-secret-key');
    expect(out).not.toContain('abc.def');
    expect(out).not.toContain('AAAAAAAAAA');
  });

  it('truncates long details', () => {
    expect(redact('x '.repeat(5000)).length).toBeLessThan(2100);
  });
});
