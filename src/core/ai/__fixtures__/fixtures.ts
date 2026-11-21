// Recorded-style fixtures. Nothing here talks to a real provider (S10).
// Hosts use the reserved `.test` TLD and the model id is a placeholder, so no
// real provider, URL, or model is encoded anywhere.
import type { FetchLike, HttpResponse, ProviderProfile } from '../types';

export const SAMPLE_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQ'; // not a real picture; adapters never decode it

export const validScanResult = {
  is_food: true,
  dish_name: 'Chicken with rice',
  items: [
    {
      name: 'Pollo a la plancha',
      canonical_name_en: 'chicken breast, grilled',
      search_terms_en: ['grilled chicken', 'chicken fillet'],
      preparation: 'grilled',
      grams: 120,
      portion_basis: 'about the size of a palm',
      confidence_food: 'high',
      confidence_portion: 'medium',
      fallback_per_100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
    },
    {
      name: 'Arroz blanco',
      canonical_name_en: 'white rice, cooked',
      search_terms_en: ['rice'],
      preparation: 'boiled',
      grams: 180,
      portion_basis: 'about one cup',
      confidence_food: 'high',
      confidence_portion: 'medium',
      fallback_per_100g: { kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 },
    },
  ],
  hidden_ingredients_note: 'likely cooked with a little oil',
};

export const profiles = {
  openai: {
    id: 'p-openai',
    adapter: 'openai_compatible',
    baseUrl: 'https://llm.example.test/v1',
    model: 'test-model',
    timeoutS: 5,
  },
  anthropic: {
    id: 'p-anthropic',
    adapter: 'anthropic',
    baseUrl: 'https://claude.example.test',
    model: 'test-model',
    timeoutS: 5,
  },
  gemini: {
    id: 'p-gemini',
    adapter: 'gemini',
    baseUrl: 'https://gem.example.test',
    model: 'test-model',
    timeoutS: 5,
  },
} satisfies Record<string, ProviderProfile>;

export function res(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    text: async () => text,
  };
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, any> | undefined;
  rawBody: string | undefined;
}

export type Responder =
  | HttpResponse
  | Error
  | ((call: RecordedCall, signal: AbortSignal | undefined) => HttpResponse | Promise<HttpResponse>);

/** Returns responders in order; the last one repeats. */
export function fakeFetch(...responders: Responder[]): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call: RecordedCall = {
      url,
      method: init.method,
      headers: init.headers,
      rawBody: init.body,
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const responder = responders[Math.min(calls.length - 1, responders.length - 1)];
    if (responder instanceof Error) throw responder;
    if (typeof responder === 'function') return responder(call, init.signal);
    return responder;
  };
  return { fetch, calls };
}

/** A fetch that never answers on its own and rejects when aborted. */
export const hangingResponder: Responder = (_call, signal) =>
  new Promise<HttpResponse>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

export const noSleep = async () => {};

// ---- OpenAI-compatible bodies ----

export const openaiText = (text: string, usage: boolean | object = true) => ({
  id: 'chatcmpl-test',
  object: 'chat.completion',
  model: 'test-model',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text, refusal: null } }],
  ...(usage ? { usage: usage === true ? { prompt_tokens: 812, completion_tokens: 240, total_tokens: 1052 } : usage } : {}),
});

export const openaiToolCall = (args: string) => ({
  id: 'chatcmpl-test',
  choices: [
    {
      index: 0,
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'record_scan_result', arguments: args } }],
      },
    },
  ],
  usage: { prompt_tokens: 812, completion_tokens: 240 },
});

export const openaiRefusal = {
  id: 'chatcmpl-test',
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: null, refusal: "I'm sorry, I can't help with that." },
    },
  ],
};

export const openaiError = (message: string, type: string, code: string | null = null) => ({
  error: { message, type, param: null, code },
});

// ---- Anthropic bodies ----

export const anthropicText = (text: string, stopReason = 'end_turn') => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'test-model',
  content: [{ type: 'text', text }],
  stop_reason: stopReason,
  usage: { input_tokens: 1500, output_tokens: 310 },
});

export const anthropicToolUse = (input: unknown) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  content: [
    { type: 'text', text: 'Recording the result.' },
    { type: 'tool_use', id: 'toolu_1', name: 'record_scan_result', input },
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: 1400, output_tokens: 290 },
});

export const anthropicRefusal = {
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  content: [],
  stop_reason: 'refusal',
  stop_details: { type: 'refusal', category: null },
  usage: { input_tokens: 1400, output_tokens: 3 },
};

export const anthropicError = (type: string, message: string) => ({
  type: 'error',
  error: { type, message },
  request_id: 'req_test',
});

// ---- Gemini bodies ----

export const geminiText = (text: string) => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 250, thoughtsTokenCount: 50, totalTokenCount: 1400 },
});

export const geminiBlockedPrompt = {
  promptFeedback: { blockReason: 'SAFETY' },
  usageMetadata: { promptTokenCount: 1100, totalTokenCount: 1100 },
};

export const geminiSafetyFinish = {
  candidates: [{ finishReason: 'SAFETY', index: 0 }],
};

export const geminiError = (code: number, status: string, message: string, details: unknown[] = []) => ({
  error: { code, status, message, details },
});
