// OpenAI-compatible chat completions: docs/09 section 2.2.
// Verified against the OpenAI API reference (openai-openapi): POST /chat/completions,
// GET /models, `response_format: { type: "json_schema", json_schema: { name, schema, strict } }`,
// function tools with a forced `tool_choice`, `message.refusal`, `usage.prompt_tokens` /
// `usage.completion_tokens`.
import { ProviderError } from '../errors';
import { mapHttpFailure } from '../http';
import { jsonOnlyInstruction } from '../prompt';
import { providerJsonSchema } from '../schema';
import type { OutputMode, ProviderAdapter } from '../types';
import { joinUrl } from '../url';
import {
  TOOL_DESCRIPTION,
  TOOL_NAME,
  getOrNull,
  jsonHeaders,
  malformed,
  parseObject,
  unsupportedMode,
  usageOf,
  type Json,
} from './shared';

const MODES: OutputMode[] = ['schema', 'tool', 'prompt'];

function authHeaders(apiKey: string | null): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

export const openaiCompatibleAdapter: ProviderAdapter = {
  id: 'openai_compatible',
  supportedModes: MODES,

  async generate(request) {
    const { profile, apiKey, mode } = request;
    if (!MODES.includes(mode)) throw unsupportedMode('openai_compatible', mode);
    const schema = providerJsonSchema('openai');

    const messages: Json[] = [
      { role: 'system', content: mode === 'prompt' ? request.system + jsonOnlyInstruction(schema) : request.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: request.userText },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${request.imageJpegBase64}` } },
        ],
      },
    ];
    if (request.repair) {
      messages.push({ role: 'assistant', content: request.repair.previousOutput });
      messages.push({ role: 'user', content: request.repair.message });
    }

    const body: Json = { model: profile.model, messages };
    if (mode === 'schema') {
      body.response_format = { type: 'json_schema', json_schema: { name: 'scan_result', strict: true, schema } };
    } else if (mode === 'tool') {
      body.tools = [
        { type: 'function', function: { name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: schema, strict: true } },
      ];
      body.tool_choice = { type: 'function', function: { name: TOOL_NAME } };
    }

    const { status, headers, bodyText } = await request.http.request({
      profile,
      apiKey,
      method: 'POST',
      url: joinUrl(profile.baseUrl, '/chat/completions'),
      headers: jsonHeaders(authHeaders(apiKey)),
      body,
      signal: request.signal,
    });
    const json = parseObject(bodyText, apiKey);

    // Some gateways answer 200 with an error object.
    if (json.error && !Array.isArray(json.choices)) {
      const code = Number(json.error?.code);
      throw mapHttpFailure(code >= 100 && code <= 599 ? code : 0, headers, bodyText, { apiKey, now: Date.now() });
    }

    const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
    const message = choice?.message;
    if (!message || typeof message !== 'object') {
      throw malformed('no choices[0].message.', bodyText, apiKey);
    }
    if ((typeof message.refusal === 'string' && message.refusal !== '') || choice.finish_reason === 'content_filter') {
      throw new ProviderError('content_refused', {
        status,
        detail: typeof message.refusal === 'string' ? message.refusal : 'The provider filtered the response.',
        secrets: [apiKey],
      });
    }

    let text = '';
    const call = Array.isArray(message.tool_calls) ? message.tool_calls[0] : undefined;
    if (mode === 'tool' && call?.function && typeof call.function.arguments === 'string') {
      text = call.function.arguments;
    } else {
      text = contentText(message.content);
    }
    return { text, usage: usageOf(json.usage?.prompt_tokens, json.usage?.completion_tokens) };
  },

  async listModels({ profile, apiKey, signal, http }) {
    const listing = await getOrNull(http, {
      profile,
      apiKey,
      method: 'GET',
      url: joinUrl(profile.baseUrl, '/models'),
      headers: jsonHeaders(authHeaders(apiKey)),
      signal,
    });
    if (!listing) return null;
    const json = parseObject(listing.bodyText, apiKey);
    if (!Array.isArray(json.data)) throw malformed('no data array.', listing.bodyText, apiKey);
    return json.data
      .map((m: Json) => m?.id)
      .filter((id: unknown): id is string => typeof id === 'string')
      .sort();
  },
};
