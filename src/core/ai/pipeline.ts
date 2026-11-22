// The AI pipeline, steps 3 and 4 of docs/07 section 2: vision call, then
// validation with one repair retry, then the device-side checks.
import { getAdapter } from './adapters';
import { checkScanResult } from './checks';
import { NoFoodDetectedError, ProviderError } from './errors';
import { createHttpClient } from './http';
import { PROMPT_VERSION, USER_INSTRUCTION, buildRepairMessage, buildSystemPrompt } from './prompt';
import { extractJson } from './jsonText';
import { ScanResult } from './schema';
import { suggestFoods } from './suggest';
import type { SuggestInput } from './suggest';
import type {
  AiDeps,
  AnalyzeInput,
  AnalyzeOutput,
  ProviderProfile,
  TestConnectionResult,
  Usage,
} from './types';
import { assertSecureBaseUrl } from './url';

const MAX_ECHOED_OUTPUT = 8000;
const MAX_ISSUES = 10;

type Parsed = { ok: true; value: ScanResult } | { ok: false; message: string };

function parseScanResult(text: string): Parsed {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch {
    return { ok: false, message: 'The reply was not valid JSON. Reply with a single JSON object.' };
  }
  const parsed = ScanResult.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, MAX_ISSUES)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  return { ok: false, message: issues };
}

function addUsage(total: Usage | undefined, next: Usage | undefined): Usage | undefined {
  if (!next) return total;
  if (!total) return { ...next };
  return { inputTokens: total.inputTokens + next.inputTokens, outputTokens: total.outputTokens + next.outputTokens };
}

export async function analyzeMeal(
  input: AnalyzeInput,
  deps: AiDeps,
  options: { maxRepairs?: 0 | 1 } = {},
): Promise<AnalyzeOutput> {
  const { profile, apiKey } = input;
  assertSecureBaseUrl(profile.baseUrl);
  const adapter = getAdapter(profile.adapter);
  const mode = profile.outputMode ?? adapter.supportedModes[0];
  if (!adapter.supportedModes.includes(mode)) {
    throw new ProviderError('unknown', { detail: `The ${profile.adapter} adapter does not support output mode "${mode}".` });
  }

  const now = deps.now ?? Date.now;
  const started = now();
  const http = createHttpClient(deps);
  const system = buildSystemPrompt({ locale: input.locale, hint: input.hint });
  const maxRepairs = options.maxRepairs ?? 1;

  let usage: Usage | undefined;
  let repair: { previousOutput: string; message: string } | undefined;
  let lastText = '';

  for (let attempt = 0; ; attempt++) {
    const response = await adapter.generate({
      profile,
      apiKey,
      mode,
      system,
      userText: USER_INSTRUCTION,
      imageJpegBase64: input.imageJpegBase64,
      repair,
      signal: input.signal,
      http,
    });
    usage = addUsage(usage, response.usage);
    lastText = response.text;

    const parsed = parseScanResult(response.text);
    if (parsed.ok) {
      const result = parsed.value;
      if (!result.is_food || result.items.length === 0) throw new NoFoodDetectedError();
      return {
        result,
        usage,
        latencyMs: now() - started,
        repaired: attempt > 0,
        outputModeUsed: mode,
        promptVersion: PROMPT_VERSION,
        checks: checkScanResult(result),
      };
    }

    if (attempt >= maxRepairs) {
      throw new ProviderError('invalid_output', {
        detail: parsed.message,
        rawResponse: lastText,
        secrets: [apiKey],
      });
    }
    repair = {
      previousOutput: (lastText.trim() === '' ? '(empty reply)' : lastText).slice(0, MAX_ECHOED_OUTPUT),
      message: buildRepairMessage(parsed.message),
    };
  }
}

/** Output modes in which another mode might still work after this failure. */
const NEXT_MODE_CODES = new Set(['invalid_output', 'unknown']);

/**
 * "Test connection" (FR-62): probes the adapter's output modes in order with
 * the sample image and reports the first that yields valid output. The caller
 * stores the mode on the profile so later scans skip the probing.
 */
export async function testConnection(
  profile: ProviderProfile,
  apiKey: string | null,
  deps: AiDeps,
  options: { sampleImageJpegBase64: string; signal?: AbortSignal },
): Promise<TestConnectionResult> {
  const signal = options.signal ?? new AbortController().signal;
  let adapter;
  try {
    assertSecureBaseUrl(profile.baseUrl);
    adapter = getAdapter(profile.adapter);
  } catch (error) {
    if (error instanceof ProviderError) return { ok: false, error };
    throw error;
  }

  let last: ProviderError | undefined;
  for (const mode of adapter.supportedModes) {
    try {
      await analyzeMeal(
        {
          profile: { ...profile, outputMode: mode },
          apiKey,
          imageJpegBase64: options.sampleImageJpegBase64,
          locale: 'en',
          signal,
        },
        deps,
        { maxRepairs: 0 },
      );
      return { ok: true, outputMode: mode };
    } catch (error) {
      // A valid answer that says "no food" still proves the mode works.
      if (error instanceof NoFoodDetectedError) return { ok: true, outputMode: mode };
      if (!(error instanceof ProviderError)) throw error; // cancellation
      if (!NEXT_MODE_CODES.has(error.code)) return { ok: false, error };
      last = error;
    }
  }
  return { ok: false, error: last ?? new ProviderError('unknown', { detail: 'No output mode to test.' }) };
}

export async function listModels(
  profile: ProviderProfile,
  apiKey: string | null,
  deps: AiDeps,
  signal: AbortSignal = new AbortController().signal,
): Promise<string[] | null> {
  assertSecureBaseUrl(profile.baseUrl);
  return getAdapter(profile.adapter).listModels({ profile, apiKey, signal, http: createHttpClient(deps) });
}

/** The `VisionAdapter` contract of docs/09 section 1.1, bound to injected platform APIs. */
export function createVisionGateway(deps: AiDeps) {
  return {
    analyzeMeal: (input: AnalyzeInput) => analyzeMeal(input, deps),
    suggestFoods: (input: SuggestInput) => suggestFoods(input, deps),
    listModels: (profile: ProviderProfile, apiKey: string | null, signal?: AbortSignal) =>
      listModels(profile, apiKey, deps, signal),
    testConnection: (
      profile: ProviderProfile,
      apiKey: string | null,
      options: { sampleImageJpegBase64: string; signal?: AbortSignal },
    ) => testConnection(profile, apiKey, deps, options),
  };
}
