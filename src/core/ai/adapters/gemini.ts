// Google Gemini: docs/09 section 2.4.
// Verified against ai.google.dev/api: POST /v1beta/models/{model}:generateContent,
// GET /v1beta/models (pageSize, pageToken), header `x-goog-api-key`, `inlineData`,
// `systemInstruction`, `generationConfig.responseMimeType` + `responseJsonSchema`,
// `usageMetadata`, `promptFeedback.blockReason`, `finishReason`.
import { ProviderError } from '../errors';
import { jsonOnlyInstruction } from '../prompt';
import type { OutputMode, ProviderAdapter } from '../types';
import { joinUrl } from '../url';
import {
  SCAN_FORMAT,
  getOrNull,
  jsonHeaders,
  malformed,
  parseObject,
  unsupportedMode,
  asTokens,
  type Json,
} from './shared';

// Native tool calling is not used: the schema mode already constrains the output.
const MODES: OutputMode[] = ['schema', 'prompt'];

const LIST_PAGE_SIZE = 1000;
const LIST_MAX_PAGES = 10;

const REFUSAL_FINISH = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
  'RECITATION',
]);

function headers(apiKey: string | null): Record<string, string> {
  return jsonHeaders(apiKey ? { 'x-goog-api-key': apiKey } : {});
}

const bareModelName = (name: string) => name.replace(/^models\//, '');

export const geminiAdapter: ProviderAdapter = {
  id: 'gemini',
  supportedModes: MODES,

  async generate(request) {
    const { profile, apiKey, mode } = request;
    if (!MODES.includes(mode)) throw unsupportedMode('gemini', mode);
    const format = request.format ?? SCAN_FORMAT;
    const schema = format.schema('gemini');

    const contents: Json[] = [
      {
        role: 'user',
        parts: [...(request.imageJpegBase64 === undefined ? [] : [{ inlineData: { mimeType: 'image/jpeg', data: request.imageJpegBase64 } }]), { text: request.userText }],
      },
    ];
    if (request.repair) {
      contents.push({ role: 'model', parts: [{ text: request.repair.previousOutput }] });
      contents.push({ role: 'user', parts: [{ text: request.repair.message }] });
    }

    const body: Json = {
      systemInstruction: {
        parts: [{ text: mode === 'prompt' ? request.system + jsonOnlyInstruction(schema) : request.system }],
      },
      contents,
    };
    if (mode === 'schema') {
      body.generationConfig = { responseMimeType: 'application/json', responseJsonSchema: schema };
    }

    const { status, bodyText } = await request.http.request({
      profile,
      apiKey,
      method: 'POST',
      url: joinUrl(profile.baseUrl, `/v1beta/models/${encodeURIComponent(bareModelName(profile.model))}:generateContent`),
      headers: headers(apiKey),
      body,
      signal: request.signal,
    });
    const json = parseObject(bodyText, apiKey);

    const blockReason = json.promptFeedback?.blockReason;
    if (typeof blockReason === 'string' && blockReason !== '' && blockReason !== 'BLOCK_REASON_UNSPECIFIED') {
      throw new ProviderError('content_refused', { status, detail: `Prompt blocked: ${blockReason}`, secrets: [apiKey] });
    }
    const candidate = Array.isArray(json.candidates) ? json.candidates[0] : undefined;
    if (!candidate || typeof candidate !== 'object') throw malformed('no candidates.', bodyText, apiKey);
    if (REFUSAL_FINISH.has(candidate.finishReason)) {
      throw new ProviderError('content_refused', {
        status,
        detail: `Response blocked: ${candidate.finishReason}`,
        secrets: [apiKey],
      });
    }
    const parts = candidate.content?.parts;
    if (parts !== undefined && !Array.isArray(parts)) throw malformed('content.parts is not an array.', bodyText, apiKey);
    const text = (parts ?? [])
      .filter((p: Json) => typeof p?.text === 'string' && p.thought !== true)
      .map((p: Json) => p.text)
      .join('');

    const meta = json.usageMetadata;
    const input = asTokens(meta?.promptTokenCount);
    const output = asTokens(meta?.candidatesTokenCount);
    // Thinking tokens are billed as output.
    const usage =
      input === undefined || output === undefined
        ? undefined
        : { inputTokens: input, outputTokens: output + (asTokens(meta?.thoughtsTokenCount) ?? 0) };
    return { text, usage };
  },

  async listModels({ profile, apiKey, signal, http }) {
    const names: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < LIST_MAX_PAGES; page++) {
      const query = `?pageSize=${LIST_PAGE_SIZE}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const listing = await getOrNull(http, {
        profile,
        apiKey,
        method: 'GET',
        url: joinUrl(profile.baseUrl, `/v1beta/models${query}`),
        headers: headers(apiKey),
        signal,
      });
      if (!listing) return null;
      const json = parseObject(listing.bodyText, apiKey);
      if (!Array.isArray(json.models)) throw malformed('no models array.', listing.bodyText, apiKey);
      for (const m of json.models) {
        if (typeof m?.name !== 'string') continue;
        const methods = m.supportedGenerationMethods;
        if (Array.isArray(methods) && !methods.includes('generateContent')) continue;
        names.push(bareModelName(m.name));
      }
      if (typeof json.nextPageToken !== 'string' || json.nextPageToken === '') break;
      pageToken = json.nextPageToken;
    }
    return names;
  },
};
