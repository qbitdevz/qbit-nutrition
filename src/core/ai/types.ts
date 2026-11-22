import type { ProviderError } from './errors';
import type { Locale } from './prompt';
import type { SchemaDialect, ScanResult } from './schema';

export type { Locale };

export type OutputMode = 'schema' | 'tool' | 'prompt';
export type AdapterId = 'openai_compatible' | 'anthropic' | 'gemini';

// docs/09 section 1.1
export interface ProviderProfile {
  id: string;
  adapter: AdapterId;
  baseUrl: string;
  model: string;
  outputMode?: OutputMode;
  timeoutS: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** The slice of a fetch Response that `core/ai` uses. The global fetch satisfies it. */
export interface HttpResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  /** Set by the platform when the response came after a redirect. */
  redirected?: boolean;
  /** Final URL of the response, when the platform reports it. */
  url?: string;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    /** Always `'error'`: the key and photo must never follow a redirect. */
    redirect: 'error';
    signal?: AbortSignal;
  },
) => Promise<HttpResponse>;

/** Everything `core/ai` needs from the platform, injected. */
export interface AiDeps {
  fetch: FetchLike;
  /** Pause before the single retry; replaceable in tests. Default: a timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds clock; default `Date.now`. */
  now?: () => number;
  /** Delay before the retry on 5xx or network error. Default 1000. */
  retryDelayMs?: number;
}

export interface AnalyzeInput {
  profile: ProviderProfile;
  apiKey: string | null; // null for keyless local servers
  imageJpegBase64: string;
  hint?: string;
  locale: Locale;
  signal: AbortSignal;
}

export type ItemWarning = 'fallback_implausible' | 'item_weight_extreme' | 'item_weight_tiny';
export type MealWarning = 'meal_weight_extreme';

export interface ItemCheck {
  /** False when `fallback_per_100g` was discarded and the item needs a manual match. */
  fallbackUsable: boolean;
  warnings: ItemWarning[];
}

export interface ScanChecks {
  items: ItemCheck[];
  mealWarnings: MealWarning[];
}

export interface AnalyzeOutput {
  result: ScanResult; // validated; see document 07
  /** The tokens of the whole request; set only when every call (the scan and its repair retry) reported its usage. */
  usage?: Usage;
  /** The tokens of the calls that reported, when another call of the same request did not: NOT the total. */
  usagePartial?: Usage;
  latencyMs: number;
  repaired: boolean;
  outputModeUsed: OutputMode;
  promptVersion: number;
  checks: ScanChecks;
}

export type TestConnectionResult = { ok: true; outputMode: OutputMode } | { ok: false; error: ProviderError };

/** What an adapter needs to ask for one kind of structured answer: the names providers show, and the schema in their dialect. */
export interface OutputFormat {
  /** Name of the JSON schema (OpenAI `response_format`). */
  schemaName: string;
  /** Name and description of the forced tool in tool mode. */
  toolName: string;
  toolDescription: string;
  schema(dialect: SchemaDialect): object;
}

/** What an adapter sends for one model call. */
export interface GenerateRequest {
  profile: ProviderProfile;
  apiKey: string | null;
  mode: OutputMode;
  system: string;
  userText: string;
  /** Absent for a text-only request (food suggestions send no photo). */
  imageJpegBase64?: string;
  /** The answer format; the meal-scan format when absent. */
  format?: OutputFormat;
  /** Set on the repair retry: the previous reply and what was wrong with it. */
  repair?: { previousOutput: string; message: string };
  signal: AbortSignal;
  http: HttpClient;
}

export interface GenerateResponse {
  /** The model's JSON as text (tool arguments are serialized). */
  text: string;
  usage?: Usage;
}

export interface HttpClient {
  request(options: {
    profile: ProviderProfile;
    apiKey: string | null;
    method: 'GET' | 'POST';
    url: string;
    headers: Record<string, string>;
    body?: unknown;
    signal: AbortSignal;
  }): Promise<{ status: number; headers: HttpResponse['headers']; bodyText: string }>;
}

export interface ProviderAdapter {
  id: AdapterId;
  /** In probing order, strongest first. */
  supportedModes: OutputMode[];
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  /** `null` when the provider has no listing. */
  listModels(options: {
    profile: ProviderProfile;
    apiKey: string | null;
    signal: AbortSignal;
    http: HttpClient;
  }): Promise<string[] | null>;
}
