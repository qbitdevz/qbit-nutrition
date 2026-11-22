// Food suggestions (FR-51, S6; docs/09 section 1.1, docs/07 sections 7 and 8): one text-only request through the same
// adapters and the same structured-output modes as a scan, then validation with one repair retry, then the device-side
// checks. Model output is untrusted: it is validated, bounded, capped and cleaned before anyone sees it.
//
// What is sent: the remaining calories and macronutrients, the goal type and the locale. Nothing else is a parameter,
// so nothing else can be sent: no photo, no meals, no history, no profile field, no identifier.
import { getAdapter } from './adapters';
import { SCAN_FORMAT } from './adapters/shared';
import { isFallbackPlausible } from './checks';
import { ProviderError } from './errors';
import { createHttpClient } from './http';
import { extractJson } from './jsonText';
import type { Locale } from './prompt';
import { MAX_SUGGESTIONS, Suggestion, SuggestionList, suggestionsJsonSchema } from './suggestSchema';
import { SUGGEST_PROMPT_VERSION, buildSuggestRepairMessage, buildSuggestSystemPrompt } from './suggestPrompt';
import { breaksWordingRules, foldText, plainText } from './suggestRules';
import { createUsageTally } from './usage';
import type { AiDeps, OutputFormat, OutputMode, ProviderProfile, Usage } from './types';
import { assertSecureBaseUrl } from './url';

export { MAX_SUGGESTIONS, SuggestionList, suggestionsJsonSchema } from './suggestSchema';
export { SUGGEST_PROMPT_VERSION, buildSuggestSystemPrompt } from './suggestPrompt';

/**
 * Below this many kcal left, the app does not call the provider and says so (S6: "when nothing or almost nothing remains").
 * Product choice, not from a guideline: about the smallest snack worth suggesting.
 */
export const MIN_REMAINING_KCAL_FOR_SUGGESTIONS = 100;

/** Goal types the request can carry (`goal.type` of docs/08). */
export type SuggestGoal = 'lose_fat' | 'maintain' | 'gain_muscle';

export interface SuggestInput {
  profile: ProviderProfile;
  apiKey: string | null; // null for keyless local servers
  /** What is left of today. A macro with no target is `null`. */
  remaining: { kcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null };
  goal: SuggestGoal;
  locale: Locale;
  signal: AbortSignal;
}

export interface FoodSuggestion {
  /** In the user's language, as plain text. */
  name: string;
  grams: number;
  /** The model's estimates for `grams`. Shown as estimates; the values that are saved come from the food database. */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  reason: string;
}

export interface SuggestOutput {
  suggestions: FoodSuggestion[];
  /** Answers the checks removed (too many calories for what is left, numbers that do not add up, wording rules). */
  dropped: number;
  /** The tokens of the whole request; set only when every call reported its usage. */
  usage?: Usage;
  /** The tokens of the calls that reported, when another call of the same request did not: NOT the total. */
  usagePartial?: Usage;
  latencyMs: number;
  repaired: boolean;
  outputModeUsed: OutputMode;
  promptVersion: number;
}

/** Nothing (or almost nothing) is left for the day: no request was made. Not a provider failure. */
export class NothingToSuggestError extends Error {
  constructor() {
    super('nothing_to_suggest');
    this.name = 'NothingToSuggestError';
    Object.setPrototypeOf(this, NothingToSuggestError.prototype);
  }
}

const MAX_SENT = 10_000;
const sentNumber = (value: number | null): number | null => (value === null || !Number.isFinite(value) ? null : Math.min(MAX_SENT, Math.max(0, Math.round(value))));

/** The one user message: numbers, the goal type and the locale. The exact bytes are part of the privacy promise (see the tests). */
export function buildSuggestUserText({ remaining, goal, locale }: Pick<SuggestInput, 'remaining' | 'goal' | 'locale'>): string {
  return JSON.stringify({
    remaining: { kcal: sentNumber(remaining.kcal), protein_g: sentNumber(remaining.proteinG), carbs_g: sentNumber(remaining.carbsG), fat_g: sentNumber(remaining.fatG) },
    goal,
    locale,
  });
}

export const SUGGEST_FORMAT: OutputFormat = {
  schemaName: 'food_suggestions',
  toolName: 'record_food_suggestions',
  toolDescription: 'Record the foods suggested for what is left of the day, with approximate amounts and values.',
  schema: suggestionsJsonSchema,
};
void SCAN_FORMAT; // the default format of the adapters; named here only to show that suggestions are an alternative to it

const MAX_ECHOED_OUTPUT = 8000;
const MAX_ISSUES = 10;
const MAX_NAME_CHARS = 60;
const MAX_REASON_CHARS = 160;

type Parsed = { ok: true; value: SuggestionList } | { ok: false; message: string };

function parseSuggestions(text: string): Parsed {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch {
    return { ok: false, message: 'The reply was not valid JSON. Reply with a single JSON object.' };
  }
  // Cap the list: more than the screen shows is cut, not an error (the first ones are the model's best).
  if (json && typeof json === 'object' && Array.isArray((json as { suggestions?: unknown }).suggestions)) {
    const object = json as { suggestions: unknown[] };
    if (object.suggestions.length > MAX_SUGGESTIONS) json = { ...object, suggestions: object.suggestions.slice(0, MAX_SUGGESTIONS) };
  }
  const parsed = SuggestionList.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, MAX_ISSUES)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  return { ok: false, message: issues };
}

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Device-side checks on a validated list: clean text, rounded numbers, fits what is left, coherent, wording rules, no duplicates. */
function refine(items: Suggestion[], remainingKcal: number): { suggestions: FoodSuggestion[]; dropped: number } {
  const kept: FoodSuggestion[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of items) {
    const name = plainText(item.name, MAX_NAME_CHARS);
    const reason = plainText(item.reason, MAX_REASON_CHARS);
    const suggestion: FoodSuggestion = {
      name,
      grams: Math.round(item.grams),
      kcal: Math.round(item.kcal),
      proteinG: round(item.protein_g, 1),
      carbsG: round(item.carbs_g, 1),
      fatG: round(item.fat_g, 1),
      reason,
    };
    const key = foldText(name).replace(/\s+/g, ' ');
    const usable =
      name !== '' &&
      reason !== '' &&
      suggestion.grams >= 1 &&
      !breaksWordingRules(name, reason) &&
      suggestion.kcal <= remainingKcal &&
      isFallbackPlausible({ kcal: suggestion.kcal, protein_g: suggestion.proteinG, carbs_g: suggestion.carbsG, fat_g: suggestion.fatG }) &&
      !seen.has(key);
    if (!usable) {
      // A repeated name is a duplicate, not a failed check: it is not counted as dropped.
      if (!seen.has(key) || name === '') dropped += 1;
      continue;
    }
    seen.add(key);
    kept.push(suggestion);
  }
  return { suggestions: kept, dropped };
}

export async function suggestFoods(input: SuggestInput, deps: AiDeps, options: { maxRepairs?: 0 | 1 } = {}): Promise<SuggestOutput> {
  // Nothing or almost nothing left: no request at all (and nothing about the day leaves the phone).
  if (!(input.remaining.kcal >= MIN_REMAINING_KCAL_FOR_SUGGESTIONS)) throw new NothingToSuggestError();

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
  // Only these three things are used; the object a caller passed is never forwarded.
  const system = buildSuggestSystemPrompt({ locale: input.locale });
  const userText = buildSuggestUserText({ remaining: input.remaining, goal: input.goal, locale: input.locale });
  const maxRepairs = options.maxRepairs ?? 1;

  const usage = createUsageTally();
  let repair: { previousOutput: string; message: string } | undefined;
  for (let attempt = 0; ; attempt++) {
    const response = await adapter.generate({
      profile,
      apiKey,
      mode,
      system,
      userText,
      format: SUGGEST_FORMAT,
      repair,
      signal: input.signal,
      http,
    });
    usage.add(response.usage);

    const parsed = parseSuggestions(response.text);
    if (parsed.ok) {
      const { suggestions, dropped } = refine(parsed.value.suggestions, Math.round(input.remaining.kcal));
      return { suggestions, dropped, usage: usage.complete, usagePartial: usage.partial, latencyMs: now() - started, repaired: attempt > 0, outputModeUsed: mode, promptVersion: SUGGEST_PROMPT_VERSION };
    }

    if (attempt >= maxRepairs) {
      throw new ProviderError('invalid_output', { detail: parsed.message, rawResponse: response.text, secrets: [apiKey] });
    }
    repair = {
      previousOutput: (response.text.trim() === '' ? '(empty reply)' : response.text).slice(0, MAX_ECHOED_OUTPUT),
      message: buildSuggestRepairMessage(parsed.message),
    };
  }
}
