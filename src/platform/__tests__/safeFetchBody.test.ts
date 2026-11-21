import type { FetchLike, HttpResponse } from '@/core/ai/types';
import { createRedirectSafeFetch, RedirectRefusedError } from '../safeFetch';

const URL_ = 'https://api.example.com/v1/chat/completions';
const init: Parameters<FetchLike>[1] = { method: 'POST', headers: {}, body: '{}', redirect: 'error' };

type WithBody = HttpResponse & { body: { cancel: jest.Mock } };
const response = (over: Partial<HttpResponse>): WithBody => ({
  status: 200,
  headers: { get: () => null },
  text: jest.fn(async () => 'secret body'),
  body: { cancel: jest.fn(async () => undefined) },
  ...over,
});

describe('a refused response is cancelled, not read', () => {
  it.each([
    ['redirected flag', { redirected: true }],
    ['other origin', { url: 'https://evil.example.net/x' }],
    ['3xx status', { status: 307 }],
  ])('cancels the body on %s', async (_name, over) => {
    const res = response(over as Partial<HttpResponse>);
    await expect(createRedirectSafeFetch(async () => res)(URL_, init)).rejects.toBeInstanceOf(RedirectRefusedError);
    expect(res.body.cancel).toHaveBeenCalledTimes(1);
    expect(res.text).not.toHaveBeenCalled();
  });

  it('still refuses when cancelling the body fails or the response has no body', async () => {
    const failing = response({ redirected: true });
    failing.body.cancel.mockRejectedValue(new Error('already closed'));
    await expect(createRedirectSafeFetch(async () => failing)(URL_, init)).rejects.toBeInstanceOf(RedirectRefusedError);
    const bodiless = { ...response({ redirected: true }), body: undefined } as HttpResponse;
    await expect(createRedirectSafeFetch(async () => bodiless)(URL_, init)).rejects.toBeInstanceOf(RedirectRefusedError);
  });

  it('leaves the body of an accepted response alone', async () => {
    const res = response({ url: URL_ });
    await createRedirectSafeFetch(async () => res)(URL_, init);
    expect(res.body.cancel).not.toHaveBeenCalled();
  });
});
