import { hostOf } from '../settings/destination';
import { CancelledError, PROMPT_VERSION, type AnalyzeOutput, type MealWarning } from '@/core/ai';
import type { Catalog, FoodRef } from '@/core/catalog';
import type { NutrientAmounts } from '@/core/nutrition';
import type { ScanRepository } from '@/data';
import type { Photo, PreparedPhoto } from '@/platform/scanPlatform';
import type { Locale } from '@/i18n/locale';
import type { DraftItem } from '../logging/draft';
import { MAX_HINT_CHARS } from './constants';
import { classifyFailure, type ScanFailure } from './failures';
import type { ScanGateway } from './scanGateway';

/** A food as the review needs it: its name and per-100 g values. */
export interface ResolvedFood {
  name: string;
  per100g: NutrientAmounts;
}

/** Everything the use case needs, injected: the gateway, the repositories, the catalog and the platform's image processing. */
export interface AnalyzeDeps {
  gateway: Pick<ScanGateway, 'activeProvider' | 'analyze'>;
  scans: Pick<ScanRepository, 'record'>;
  catalog: Pick<Catalog, 'match'>;
  /** Reads a catalog or custom food; null when it no longer exists. */
  resolveFood: (ref: FoodRef, locale: Locale) => Promise<ResolvedFood | null>;
  prepare: (photo: Photo) => Promise<PreparedPhoto>;
}

export interface AnalyzeRequest {
  photo: Photo;
  /** Set on a retry: the photo is not processed again. */
  prepared?: PreparedPhoto | null;
  hint?: string;
  locale: Locale;
  signal: AbortSignal;
}

export type ScanOutcome =
  | {
      kind: 'ok';
      /** The `scan` row, which the saved meal points at; null only if the row could not be written. */
      scanId: string | null;
      dishName: string;
      items: Omit<DraftItem, 'key'>[];
      mealWarnings: MealWarning[];
      prepared: PreparedPhoto;
    }
  | { kind: 'failed'; failure: ScanFailure; prepared: PreparedPhoto | null }
  | { kind: 'cancelled'; prepared: PreparedPhoto | null };

/**
 * One scan, end to end (docs/07 section 2, steps 2 to 6): preprocess the photo, call the provider
 * through the gateway, record the attempt in `scan` whatever happens, then match each detected item to
 * the catalog and compute what the review shows. It never saves a meal: the review does, after the
 * person has checked the result. It never throws; every failure is a value the failure screens read.
 */
export async function analyzePhoto(deps: AnalyzeDeps, request: AnalyzeRequest): Promise<ScanOutcome> {
  const { signal, locale } = request;
  let prepared = request.prepared ?? null;
  const hint = request.hint?.trim().slice(0, MAX_HINT_CHARS) || undefined;

  const provider = await deps.gateway.activeProvider().catch(() => null);
  // Nothing to copy into a `scan` row and nothing sent: the failure screen sends the person to set one up.
  if (!provider) return { kind: 'failed', failure: { kind: 'no_provider', providerLabel: null }, prepared };

  const attempt = { providerId: provider.id, providerLabel: provider.label, model: provider.model, promptVersion: PROMPT_VERSION, hint: hint ?? null };
  const record = (extra: Omit<Parameters<typeof deps.scans.record>[0], keyof typeof attempt>) =>
    deps.scans.record({ ...attempt, ...extra }).then(
      (row) => row,
      () => null, // a failed bookkeeping write must not hide the scan itself
    );
  const cancelled = async (): Promise<ScanOutcome> => {
    await record({ status: 'error', errorCode: 'cancelled' });
    return { kind: 'cancelled', prepared };
  };
  const failed = async (error: unknown): Promise<ScanOutcome> => {
    if (signal.aborted || error instanceof CancelledError) return cancelled();
    const { failure, status, errorCode } = classifyFailure(error);
    await record({ status, errorCode });
    return { kind: 'failed', failure: { ...failure, providerLabel: provider.label, providerHost: hostOf(provider.baseUrl) }, prepared };
  };

  if (signal.aborted) return cancelled();

  if (!prepared) {
    try {
      prepared = await deps.prepare(request.photo);
    } catch {
      await record({ status: 'error', errorCode: 'image_failed' });
      return { kind: 'failed', failure: { kind: 'photo_unreadable', providerLabel: provider.label, providerHost: hostOf(provider.baseUrl) }, prepared: null };
    }
    if (signal.aborted) return cancelled();
  }

  let output: AnalyzeOutput;
  try {
    output = await deps.gateway.analyze({ imageJpegBase64: prepared.base64, hint, locale, signal });
  } catch (error) {
    return failed(error);
  }

  const row = await record({
    status: 'ok',
    resultJson: JSON.stringify(output.result),
    inputTokens: output.usage?.inputTokens ?? null,
    outputTokens: output.usage?.outputTokens ?? null,
    latencyMs: output.latencyMs,
    repaired: output.repaired,
  });

  try {
    const items = await toDraftItems(deps, output, locale);
    return { kind: 'ok', scanId: row?.id ?? null, dishName: output.result.dish_name.trim(), items, mealWarnings: output.checks.mealWarnings, prepared };
  } catch (error) {
    return failed(error);
  }
}

/** Steps 5 and 6: catalog match, then the values the review computes from. */
async function toDraftItems(deps: AnalyzeDeps, output: AnalyzeOutput, locale: Locale): Promise<Omit<DraftItem, 'key'>[]> {
  const detected = output.result.items;
  const matches = await deps.catalog.match(detected, locale);
  return Promise.all(
    detected.map(async (item, index): Promise<Omit<DraftItem, 'key'>> => {
      const match = matches[index];
      const check = output.checks.items[index]!;
      const meta = {
        detectedName: item.name,
        confidenceFood: item.confidence_food,
        confidencePortion: item.confidence_portion,
        // The stepper and the field work in whole grams between 1 and 5,000.
        aiGrams: Math.max(1, Math.round(item.grams)),
        warnings: check.warnings,
        swapped: false,
      };
      const grams = meta.aiGrams;

      if (match && match.kind !== 'ai_estimate') {
        const food = await deps.resolveFood(match.ref, locale);
        if (food) return { displayName: item.name, ref: match.ref, per100g: food.per100g, grams, scan: { ...meta, kind: 'matched', matchedName: food.name } };
      }
      // No acceptable match. The model's own numbers are used, marked as an estimate, only when core found them plausible (S7).
      if (check.fallbackUsable) {
        const f = item.fallback_per_100g;
        return {
          displayName: item.name,
          ref: null,
          per100g: { kcal: f.kcal, protein: f.protein_g, carbs: f.carbs_g, fat: f.fat_g },
          grams,
          scan: { ...meta, kind: 'estimate', matchedName: null },
        };
      }
      return { displayName: item.name, ref: null, per100g: null, grams, scan: { ...meta, kind: 'needs_match', matchedName: null } };
    }),
  );
}
