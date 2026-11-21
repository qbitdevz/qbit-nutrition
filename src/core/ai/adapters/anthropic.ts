// Anthropic Messages: docs/09 section 2.3.
// Verified against the Claude API reference: POST /v1/messages, GET /v1/models (cursor
// pagination), headers `x-api-key` and `anthropic-version`, base64 image blocks,
// `output_config.format` for native JSON schema output, forced `tool_choice`,
// `stop_reason: "refusal"`, `usage.input_tokens` / `usage.output_tokens`.
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
  usageOf,
  type Json,
} from './shared';

const MODES: OutputMode[] = ['schema', 'tool', 'prompt'];

/** Protocol revision, not a model or provider default. Still accepted by the API. */
export const ANTHROPIC_VERSION = '2023-06-01';
/** Anthropic requires `max_tokens`; a scan reply is well under this. */
const MAX_TOKENS = 4096;
const LIST_PAGE_SIZE = 1000;
const LIST_MAX_PAGES = 10;

function headers(apiKey: string | null): Record<string, string> {
  return jsonHeaders({ 'anthropic-version': ANTHROPIC_VERSION, ...(apiKey ? { 'x-api-key': apiKey } : {}) });
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  supportedModes: MODES,

  async generate(request) {
    const { profile, apiKey, mode } = request;
    if (!MODES.includes(mode)) throw unsupportedMode('anthropic', mode);
    const format = request.format ?? SCAN_FORMAT;
    const schema = format.schema('anthropic');

    const messages: Json[] = [
      {
        role: 'user',
        content: [
          ...(request.imageJpegBase64 === undefined ? [] : [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: request.imageJpegBase64 } }]),
          { type: 'text', text: request.userText },
        ],
      },
    ];
    if (request.repair) {
      messages.push({ role: 'assistant', content: request.repair.previousOutput });
      messages.push({ role: 'user', content: request.repair.message });
    }

    const body: Json = {
      model: profile.model,
      max_tokens: MAX_TOKENS,
      system: mode === 'prompt' ? request.system + jsonOnlyInstruction(schema) : request.system,
      messages,
    };
    if (mode === 'schema') {
      body.output_config = { format: { type: 'json_schema', schema } };
    } else if (mode === 'tool') {
      body.tools = [{ name: format.toolName, description: format.toolDescription, input_schema: schema }];
      body.tool_choice = { type: 'tool', name: format.toolName };
    }

    const { status, bodyText } = await request.http.request({
      profile,
      apiKey,
      method: 'POST',
      url: joinUrl(profile.baseUrl, '/v1/messages'),
      headers: headers(apiKey),
      body,
      signal: request.signal,
    });
    const json = parseObject(bodyText, apiKey);

    if (json.stop_reason === 'refusal') {
      throw new ProviderError('content_refused', { status, detail: 'The model declined to answer.', secrets: [apiKey] });
    }
    if (!Array.isArray(json.content)) throw malformed('no content array.', bodyText, apiKey);

    let text = '';
    const toolUse = json.content.find((b: Json) => b?.type === 'tool_use' && b.name === format.toolName);
    if (mode === 'tool' && toolUse && toolUse.input !== undefined) {
      text = JSON.stringify(toolUse.input);
    } else {
      text = json.content
        .filter((b: Json) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: Json) => b.text)
        .join('');
    }
    return { text, usage: usageOf(json.usage?.input_tokens, json.usage?.output_tokens) };
  },

  async listModels({ profile, apiKey, signal, http }) {
    const ids: string[] = [];
    let afterId: string | undefined;
    for (let page = 0; page < LIST_MAX_PAGES; page++) {
      const query = `?limit=${LIST_PAGE_SIZE}${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}`;
      const listing = await getOrNull(http, {
        profile,
        apiKey,
        method: 'GET',
        url: joinUrl(profile.baseUrl, `/v1/models${query}`),
        headers: headers(apiKey),
        signal,
      });
      if (!listing) return null;
      const json = parseObject(listing.bodyText, apiKey);
      if (!Array.isArray(json.data)) throw malformed('no data array.', listing.bodyText, apiKey);
      for (const m of json.data) if (typeof m?.id === 'string') ids.push(m.id);
      if (json.has_more !== true || typeof json.last_id !== 'string') break;
      afterId = json.last_id;
    }
    return ids;
  },
};
