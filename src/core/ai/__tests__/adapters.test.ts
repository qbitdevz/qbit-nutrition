import {
  SAMPLE_JPEG_BASE64,
  anthropicError,
  anthropicRefusal,
  anthropicText,
  anthropicToolUse,
  fakeFetch,
  geminiBlockedPrompt,
  geminiError,
  geminiSafetyFinish,
  geminiText,
  hangingResponder,
  noSleep,
  openaiError,
  openaiRefusal,
  openaiText,
  openaiToolCall,
  profiles,
  res,
  validScanResult,
} from '../__fixtures__/fixtures';
import { analyzeMeal, listModels } from '../pipeline';
import type { OutputMode, ProviderProfile } from '../types';
import { ProviderError } from '../errors';

const JSON_TEXT = JSON.stringify(validScanResult);

type Fake = ReturnType<typeof fakeFetch>;

function run(
  profile: ProviderProfile,
  fake: Fake,
  extra: { apiKey?: string | null; hint?: string; signal?: AbortSignal } = {},
) {
  return analyzeMeal(
    {
      profile,
      apiKey: extra.apiKey === undefined ? 'test-key' : extra.apiKey,
      imageJpegBase64: SAMPLE_JPEG_BASE64,
      hint: extra.hint,
      locale: 'en',
      signal: extra.signal ?? new AbortController().signal,
    },
    { fetch: fake.fetch, sleep: noSleep },
  );
}

async function errorOf(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError);
    return e as ProviderError;
  }
  throw new Error('expected a ProviderError');
}

interface Case {
  name: string;
  profile: ProviderProfile;
  modes: OutputMode[];
  success: (mode: OutputMode) => unknown;
  unauthorized: () => ReturnType<typeof res>;
  rateLimited: () => ReturnType<typeof res>;
  unavailable: () => ReturnType<typeof res>;
  malformed: ReturnType<typeof res>[];
  refusal: ReturnType<typeof res>;
  modelMissing: () => ReturnType<typeof res>;
  expectedUsage: { inputTokens: number; outputTokens: number };
}

const withMode = (p: ProviderProfile, mode: OutputMode): ProviderProfile => ({ ...p, outputMode: mode });

const cases: Case[] = [
  {
    name: 'openai_compatible',
    profile: profiles.openai,
    modes: ['schema', 'tool', 'prompt'],
    success: (mode) => (mode === 'tool' ? openaiToolCall(JSON_TEXT) : openaiText(JSON_TEXT)),
    unauthorized: () => res(401, openaiError('Incorrect API key provided', 'invalid_request_error', 'invalid_api_key')),
    rateLimited: () =>
      res(429, openaiError('Rate limit reached', 'requests', 'rate_limit_exceeded'), { 'Retry-After': '30' }),
    unavailable: () => res(503, openaiError('The server is overloaded', 'server_error')),
    malformed: [res(200, 'not json at all'), res(200, {}), res(200, { choices: [] })],
    refusal: res(200, openaiRefusal),
    modelMissing: () =>
      res(404, openaiError('The model `test-model` does not exist', 'invalid_request_error', 'model_not_found')),
    expectedUsage: { inputTokens: 812, outputTokens: 240 },
  },
  {
    name: 'anthropic',
    profile: profiles.anthropic,
    modes: ['schema', 'tool', 'prompt'],
    success: (mode) => (mode === 'tool' ? anthropicToolUse(validScanResult) : anthropicText(JSON_TEXT)),
    unauthorized: () => res(401, anthropicError('authentication_error', 'invalid x-api-key')),
    rateLimited: () => res(429, anthropicError('rate_limit_error', 'Number of requests exceeded'), { 'retry-after': '30' }),
    unavailable: () => res(529, anthropicError('overloaded_error', 'Overloaded')),
    malformed: [res(200, '<html>bad gateway</html>'), res(200, {}), res(200, { content: 'nope' })],
    refusal: res(200, anthropicRefusal),
    modelMissing: () => res(404, anthropicError('not_found_error', 'model: test-model')),
    expectedUsage: { inputTokens: 0, outputTokens: 0 }, // overridden per mode below
  },
  {
    name: 'gemini',
    profile: profiles.gemini,
    modes: ['schema', 'prompt'],
    success: () => geminiText(JSON_TEXT),
    unauthorized: () =>
      res(400, geminiError(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', [
        { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' },
      ])),
    rateLimited: () =>
      res(429, geminiError(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded', [
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' },
      ])),
    unavailable: () => res(503, geminiError(503, 'UNAVAILABLE', 'The model is overloaded')),
    malformed: [res(200, 'oops'), res(200, {}), res(200, { candidates: [{ content: { parts: 'x' } }] })],
    refusal: res(200, geminiBlockedPrompt),
    modelMissing: () => res(404, geminiError(404, 'NOT_FOUND', 'models/test-model is not found for API version v1beta')),
    expectedUsage: { inputTokens: 1100, outputTokens: 300 },
  },
];

describe.each(cases)('$name adapter', (c) => {
  it.each(c.modes)('succeeds in %s mode and reports usage and the mode used', async (mode) => {
    const fake = fakeFetch(res(200, c.success(mode)));
    const out = await run(withMode(c.profile, mode), fake);
    expect(out.result).toEqual(validScanResult);
    expect(out.outputModeUsed).toBe(mode);
    expect(out.repaired).toBe(false);
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
    if (c.name !== 'anthropic') expect(out.usage).toEqual(c.expectedUsage);
    else expect(out.usage).toEqual(mode === 'tool' ? { inputTokens: 1400, outputTokens: 290 } : { inputTokens: 1500, outputTokens: 310 });
    expect(fake.calls).toHaveLength(1);
  });

  it('sends one POST with the image, the prompt, and no key in the URL', async () => {
    const fake = fakeFetch(res(200, c.success('schema')));
    await run(withMode(c.profile, 'schema'), fake, { hint: 'brown rice' });
    const call = fake.calls[0];
    expect(call.method).toBe('POST');
    expect(call.url).not.toContain('test-key');
    expect(call.url).not.toContain('?');
    expect(call.headers['content-type'] ?? call.headers['Content-Type']).toBe('application/json');
    expect(call.rawBody).toContain(SAMPLE_JPEG_BASE64);
    expect(call.rawBody).toContain('User hint: brown rice');
    expect(call.rawBody).not.toContain('test-key');
  });

  it('maps 401/403 to auth_invalid without retrying', async () => {
    const fake = fakeFetch(c.unauthorized());
    const err = await errorOf(run(withMode(c.profile, 'schema'), fake));
    expect(err.code).toBe('auth_invalid');
    expect(fake.calls).toHaveLength(1);
  });

  it('maps 429 to quota_exceeded with retryAfterS, without retrying', async () => {
    const fake = fakeFetch(c.rateLimited());
    const err = await errorOf(run(withMode(c.profile, 'schema'), fake));
    expect(err.code).toBe('quota_exceeded');
    expect(err.retryAfterS).toBe(30);
    expect(fake.calls).toHaveLength(1);
  });

  it('retries a 5xx once and recovers', async () => {
    const fake = fakeFetch(c.unavailable(), res(200, c.success('schema')));
    const out = await run(withMode(c.profile, 'schema'), fake);
    expect(out.result.is_food).toBe(true);
    expect(fake.calls).toHaveLength(2);
  });

  it('gives up after one retry on 5xx with provider_unavailable', async () => {
    const fake = fakeFetch(c.unavailable());
    const err = await errorOf(run(withMode(c.profile, 'schema'), fake));
    expect(err.code).toBe('provider_unavailable');
    expect(fake.calls).toHaveLength(2);
  });

  it('retries a network error once, then reports no_network', async () => {
    const fake = fakeFetch(new TypeError('Network request failed'));
    const err = await errorOf(run(withMode(c.profile, 'schema'), fake));
    expect(err.code).toBe('no_network');
    expect(fake.calls).toHaveLength(2);
  });

  it.each([0, 1, 2])('treats a malformed success body (#%i) as unknown, not a crash', async (i) => {
    const fake = fakeFetch(c.malformed[i]);
    const err = await errorOf(run(withMode(c.profile, 'schema'), fake));
    expect(err.code).toBe('unknown');
    expect(fake.calls).toHaveLength(1);
  });

  it('maps a refusal to content_refused', async () => {
    const fake = fakeFetch(c.refusal);
    const err = await errorOf(run(withMode(c.profile, 'schema'), fake));
    expect(err.code).toBe('content_refused');
  });

  it('maps an unknown model to model_not_found', async () => {
    const fake = fakeFetch(c.modelMissing());
    const err = await errorOf(run(withMode(c.profile, 'schema'), fake));
    expect(err.code).toBe('model_not_found');
  });

  it('times out with the profile timeout', async () => {
    const fake = fakeFetch(hangingResponder);
    const err = await errorOf(run({ ...withMode(c.profile, 'schema'), timeoutS: 0.02 }, fake));
    expect(err.code).toBe('timeout');
    expect(fake.calls).toHaveLength(1);
  });

  it('keeps the API key out of error details', async () => {
    const fake = fakeFetch(res(400, `bad request for key test-key-123456`));
    const err = await errorOf(run(withMode(c.profile, 'schema'), fake, { apiKey: 'test-key-123456' }));
    expect(JSON.stringify([err.detail, err.rawResponse])).not.toContain('test-key-123456');
  });
});

describe('OpenAI-compatible request shape', () => {
  const p = profiles.openai;

  it('schema mode: chat completions with image_url, system prompt, and a strict json_schema response_format', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    await run(withMode(p, 'schema'), fake);
    const call = fake.calls[0];
    expect(call.url).toBe('https://llm.example.test/v1/chat/completions');
    expect(call.headers.Authorization).toBe('Bearer test-key');
    const b = call.body!;
    expect(b.model).toBe('test-model');
    expect(b.messages[0].role).toBe('system');
    expect(b.messages[0].content).toContain('You analyze a photo of a meal');
    const user = b.messages[1];
    expect(user.role).toBe('user');
    const image = user.content.find((x: any) => x.type === 'image_url');
    expect(image.image_url.url).toBe(`data:image/jpeg;base64,${SAMPLE_JPEG_BASE64}`);
    expect(b.response_format.type).toBe('json_schema');
    expect(b.response_format.json_schema.strict).toBe(true);
    expect(b.response_format.json_schema.name).toBe('scan_result');
    expect(b.response_format.json_schema.schema.properties.items.maxItems).toBe(20);
    expect(b.tools).toBeUndefined();
    expect(b).not.toHaveProperty('temperature');
  });

  it('tool mode: one function tool, forced', async () => {
    const fake = fakeFetch(res(200, openaiToolCall(JSON_TEXT)));
    await run(withMode(p, 'tool'), fake);
    const b = fake.calls[0].body!;
    expect(b.tools).toHaveLength(1);
    expect(b.tools[0].type).toBe('function');
    expect(b.tools[0].function.parameters.properties.dish_name).toBeDefined();
    expect(b.tool_choice).toEqual({ type: 'function', function: { name: b.tools[0].function.name } });
    expect(b.response_format).toBeUndefined();
  });

  it('prompt mode: no structured-output fields; the schema travels in the prompt; fenced JSON is accepted', async () => {
    const fake = fakeFetch(res(200, openaiText('Here you go:\n```json\n' + JSON_TEXT + '\n```')));
    const out = await run(withMode(p, 'prompt'), fake);
    const b = fake.calls[0].body!;
    expect(b.response_format).toBeUndefined();
    expect(b.tools).toBeUndefined();
    expect(b.messages[0].content).toContain('JSON Schema');
    expect(b.messages[0].content).toContain('"canonical_name_en"');
    expect(out.result.items).toHaveLength(2);
  });

  it('omits Authorization for keyless local servers and allows http on a private host', async () => {
    const fake = fakeFetch(res(200, openaiText(JSON_TEXT)));
    await run({ ...withMode(p, 'prompt'), baseUrl: 'http://192.168.1.20:11434/v1/' }, fake, { apiKey: null });
    expect(fake.calls[0].url).toBe('http://192.168.1.20:11434/v1/chat/completions');
    expect(fake.calls[0].headers).not.toHaveProperty('Authorization');
  });

  it('maps an image-input rejection to no_vision', async () => {
    const fake = fakeFetch(
      res(400, openaiError('Invalid content type. image_url is only supported by certain models.', 'invalid_request_error')),
    );
    expect((await errorOf(run(withMode(p, 'schema'), fake))).code).toBe('no_vision');
  });

  it('maps a content_filter finish to content_refused', async () => {
    const body = openaiText('');
    (body.choices[0] as any).finish_reason = 'content_filter';
    expect((await errorOf(run(withMode(p, 'schema'), fakeFetch(res(200, body))))).code).toBe('content_refused');
  });

  it('maps an error carried in a 200 body (some gateways do this)', async () => {
    const fake = fakeFetch(res(200, { error: { message: 'No auth credentials found', code: 401 } }));
    expect((await errorOf(run(withMode(p, 'schema'), fake))).code).toBe('auth_invalid');
  });

  it('maps 402 / insufficient_quota to quota_exceeded', async () => {
    const fake = fakeFetch(res(429, openaiError('You exceeded your current quota', 'insufficient_quota', 'insufficient_quota')));
    const err = await errorOf(run(withMode(p, 'schema'), fake));
    expect(err.code).toBe('quota_exceeded');
    expect(err.retryAfterS).toBeUndefined();
  });

  it('reads retry-after given as an HTTP date', async () => {
    const date = new Date(Date.now() + 90_000).toUTCString();
    const fake = fakeFetch(res(429, openaiError('slow down', 'requests'), { 'retry-after': date }));
    const err = await errorOf(run(withMode(p, 'schema'), fake));
    expect(err.retryAfterS).toBeGreaterThan(80);
    expect(err.retryAfterS).toBeLessThanOrEqual(90);
  });

  it('succeeds without usage when the server omits it', async () => {
    const out = await run(withMode(p, 'schema'), fakeFetch(res(200, openaiText(JSON_TEXT, false))));
    expect(out.usage).toBeUndefined();
  });
});

describe('Anthropic request shape', () => {
  const p = profiles.anthropic;

  it('schema mode: /v1/messages with x-api-key, version header, base64 image block, output_config', async () => {
    const fake = fakeFetch(res(200, anthropicText(JSON_TEXT)));
    await run(withMode(p, 'schema'), fake);
    const call = fake.calls[0];
    expect(call.url).toBe('https://claude.example.test/v1/messages');
    expect(call.headers['x-api-key']).toBe('test-key');
    expect(call.headers['anthropic-version']).toBe('2023-06-01');
    expect(call.headers).not.toHaveProperty('Authorization');
    const b = call.body!;
    expect(b.model).toBe('test-model');
    expect(b.max_tokens).toBeGreaterThan(0);
    expect(b.system).toContain('You analyze a photo of a meal');
    const image = b.messages[0].content.find((x: any) => x.type === 'image');
    expect(image.source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: SAMPLE_JPEG_BASE64 });
    expect(b.output_config.format.type).toBe('json_schema');
    expect(b.output_config.format.schema.properties.items).not.toHaveProperty('maxItems');
    expect(b.tools).toBeUndefined();
    expect(b).not.toHaveProperty('temperature');
  });

  it('tool mode: a single tool whose input schema is the output schema, choice forced', async () => {
    const fake = fakeFetch(res(200, anthropicToolUse(validScanResult)));
    await run(withMode(p, 'tool'), fake);
    const b = fake.calls[0].body!;
    expect(b.tools).toHaveLength(1);
    expect(b.tools[0].input_schema.type).toBe('object');
    expect(b.tools[0].input_schema.properties.items).toBeDefined();
    expect(b.tool_choice).toEqual({ type: 'tool', name: b.tools[0].name });
    expect(b.output_config).toBeUndefined();
  });

  it('prompt mode: schema in the system prompt only', async () => {
    const fake = fakeFetch(res(200, anthropicText(JSON_TEXT)));
    await run(withMode(p, 'prompt'), fake);
    const b = fake.calls[0].body!;
    expect(b.system).toContain('JSON Schema');
    expect(b.tools).toBeUndefined();
    expect(b.output_config).toBeUndefined();
  });

  it('maps 402 billing errors to quota_exceeded and 413 to unknown', async () => {
    expect((await errorOf(run(withMode(p, 'schema'), fakeFetch(res(402, anthropicError('billing_error', 'credit balance too low')))))).code).toBe('quota_exceeded');
    expect((await errorOf(run(withMode(p, 'schema'), fakeFetch(res(413, anthropicError('request_too_large', 'too big')))))).code).toBe('unknown');
  });
});

describe('Gemini request shape', () => {
  const p = profiles.gemini;

  it('schema mode: generateContent with x-goog-api-key, inlineData, responseJsonSchema', async () => {
    const fake = fakeFetch(res(200, geminiText(JSON_TEXT)));
    await run(withMode(p, 'schema'), fake);
    const call = fake.calls[0];
    expect(call.url).toBe('https://gem.example.test/v1beta/models/test-model:generateContent');
    expect(call.headers['x-goog-api-key']).toBe('test-key');
    const b = call.body!;
    expect(b.systemInstruction.parts[0].text).toContain('You analyze a photo of a meal');
    const parts = b.contents[0].parts;
    expect(b.contents[0].role).toBe('user');
    expect(parts.find((x: any) => x.inlineData).inlineData).toEqual({ mimeType: 'image/jpeg', data: SAMPLE_JPEG_BASE64 });
    expect(b.generationConfig.responseMimeType).toBe('application/json');
    expect(b.generationConfig.responseJsonSchema.properties.items).toBeDefined();
    expect(b.generationConfig.responseJsonSchema.properties.items.items.properties.grams.exclusiveMinimum).toBeUndefined();
  });

  it('accepts a models/ prefix on the configured model and encodes it', async () => {
    const fake = fakeFetch(res(200, geminiText(JSON_TEXT)));
    await run({ ...withMode(p, 'schema'), model: 'models/test model' }, fake);
    expect(fake.calls[0].url).toBe('https://gem.example.test/v1beta/models/test%20model:generateContent');
  });

  it('prompt mode: JSON in the prompt, no response schema, skips thought parts', async () => {
    const body = {
      candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }, { text: JSON_TEXT }] }, finishReason: 'STOP' }],
    };
    const fake = fakeFetch(res(200, body));
    const out = await run(withMode(p, 'prompt'), fake);
    const b = fake.calls[0].body!;
    expect(b.generationConfig?.responseJsonSchema).toBeUndefined();
    expect(b.systemInstruction.parts[0].text).toContain('JSON Schema');
    expect(out.result.is_food).toBe(true);
  });

  it('does not support tool mode', async () => {
    const err = await errorOf(run(withMode(p, 'tool'), fakeFetch(res(200, geminiText(JSON_TEXT)))));
    expect(err.code).toBe('unknown');
  });

  it('maps a SAFETY finish to content_refused', async () => {
    expect((await errorOf(run(withMode(p, 'schema'), fakeFetch(res(200, geminiSafetyFinish))))).code).toBe('content_refused');
  });

  it('maps 403 to auth_invalid and reads retry-after from the header too', async () => {
    expect((await errorOf(run(withMode(p, 'schema'), fakeFetch(res(403, geminiError(403, 'PERMISSION_DENIED', 'denied')))))).code).toBe('auth_invalid');
    const err = await errorOf(run(withMode(p, 'schema'), fakeFetch(res(429, geminiError(429, 'RESOURCE_EXHAUSTED', 'q'), { 'retry-after': '12' }))));
    expect(err.retryAfterS).toBe(12);
  });

  it('gives retryAfterS undefined when the 429 reports none', async () => {
    const err = await errorOf(run(withMode(p, 'schema'), fakeFetch(res(429, geminiError(429, 'RESOURCE_EXHAUSTED', 'q')))));
    expect(err.retryAfterS).toBeUndefined();
  });
});

describe('listModels', () => {
  const key = 'test-key';
  const deps = (fake: Fake) => ({ fetch: fake.fetch, sleep: noSleep });
  const signal = () => new AbortController().signal;

  it('openai: GET /models with bearer auth', async () => {
    const fake = fakeFetch(res(200, { object: 'list', data: [{ id: 'm-b' }, { id: 'm-a' }] }));
    expect(await listModels(profiles.openai, key, deps(fake), signal())).toEqual(['m-a', 'm-b']);
    expect(fake.calls[0].method).toBe('GET');
    expect(fake.calls[0].url).toBe('https://llm.example.test/v1/models');
    expect(fake.calls[0].headers.Authorization).toBe('Bearer test-key');
  });

  it('openai: null when the server has no listing (404/405)', async () => {
    expect(await listModels(profiles.openai, key, deps(fakeFetch(res(404, 'Not Found'))), signal())).toBeNull();
    expect(await listModels(profiles.openai, key, deps(fakeFetch(res(405, ''))), signal())).toBeNull();
  });

  it('openai: auth errors still surface', async () => {
    const err = await errorOf(listModels(profiles.openai, key, deps(fakeFetch(res(401, openaiError('bad', 'x')))), signal()));
    expect(err.code).toBe('auth_invalid');
  });

  it('anthropic: GET /v1/models, follows has_more with after_id', async () => {
    const fake = fakeFetch(
      res(200, { data: [{ id: 'c-1' }, { id: 'c-2' }], has_more: true, last_id: 'c-2' }),
      res(200, { data: [{ id: 'c-3' }], has_more: false, last_id: 'c-3' }),
    );
    expect(await listModels(profiles.anthropic, key, deps(fake), signal())).toEqual(['c-1', 'c-2', 'c-3']);
    expect(fake.calls[0].url).toBe('https://claude.example.test/v1/models?limit=1000');
    expect(fake.calls[1].url).toBe('https://claude.example.test/v1/models?limit=1000&after_id=c-2');
    expect(fake.calls[0].headers['x-api-key']).toBe('test-key');
    expect(fake.calls[0].headers['anthropic-version']).toBe('2023-06-01');
  });

  it('gemini: GET /v1beta/models, strips the models/ prefix, keeps generateContent models, paginates', async () => {
    const fake = fakeFetch(
      res(200, {
        models: [
          { name: 'models/g-1', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embed-1', supportedGenerationMethods: ['embedContent'] },
        ],
        nextPageToken: 'tok',
      }),
      res(200, { models: [{ name: 'models/g-2', supportedGenerationMethods: ['generateContent', 'countTokens'] }] }),
    );
    expect(await listModels(profiles.gemini, key, deps(fake), signal())).toEqual(['g-1', 'g-2']);
    expect(fake.calls[0].url).toBe('https://gem.example.test/v1beta/models?pageSize=1000');
    expect(fake.calls[1].url).toBe('https://gem.example.test/v1beta/models?pageSize=1000&pageToken=tok');
    expect(fake.calls[0].headers['x-goog-api-key']).toBe('test-key');
    expect(fake.calls[0].url).not.toContain('test-key');
  });

  it('rejects an insecure base URL before any request', async () => {
    const fake = fakeFetch(res(200, { data: [] }));
    const err = await errorOf(listModels({ ...profiles.openai, baseUrl: 'http://api.example.test/v1' }, key, deps(fake), signal()));
    expect(err.code).toBe('insecure_url');
    expect(fake.calls).toHaveLength(0);
  });
});
