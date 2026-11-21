/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from '../scripts/catalog/nodeSqlitePort';
import {
  CancelledError,
  NoFoodDetectedError,
  PROMPT_VERSION,
  ProviderError,
  analyzeMeal,
  assertSecureBaseUrl,
  checkScanResult,
} from '../src/core/ai';
import type { AiDeps, DetectedItem, ProviderProfile, ScanResult } from '../src/core/ai';
import { createCatalog } from '../src/core/catalog';
import type { Catalog, FoodRef, MatchResult } from '../src/core/catalog';
import { computeItemNutrients, sumNutrients } from '../src/core/nutrition';
import type { NutrientAmounts } from '../src/core/nutrition';
import { ResponseCache, scrub, sha256 } from './cache';
import type { CacheKeyParts, CachedOutcome } from './cache';
import { DatasetError, loadDataset, selectSubset } from './dataset';
import type { Meal } from './dataset';
import { aggregate } from './metrics/aggregate';
import { pairItems } from './metrics/pairing';
import { writeReport } from './report';
import type { BenchConfig, BenchReport, MealOutcome, MealReport, Nutrients4 } from './types';

export interface HarnessDeps {
  fetch: AiDeps['fetch'];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const four = (a: NutrientAmounts): Nutrients4 => ({
  kcal: a.kcal ?? 0,
  protein: a.protein ?? 0,
  carbs: a.carbs ?? 0,
  fat: a.fat ?? 0,
});

interface TruthFood {
  ref: FoodRef;
  per100g: NutrientAmounts;
}

/** Resolves `catalog_source_id` values to catalog foods; a missing one is a data set error naming the file. */
async function resolveTruth(meals: readonly Meal[], db: NodeSqliteCatalogDb, catalog: Catalog): Promise<Map<string, TruthFood>> {
  const found = new Map<string, TruthFood>();
  for (const meal of meals) {
    if (!meal.data.is_food) continue;
    const ids = [
      ...meal.data.items.flatMap((i) => [i.catalog_source_id, ...i.also_acceptable]),
      ...meal.data.hidden_ingredients.map((h) => h.catalog_source_id),
    ];
    for (const sourceId of ids) {
      if (found.has(sourceId)) continue;
      const rows = await db.all('SELECT id FROM food WHERE source_id = ? ORDER BY id LIMIT 1', [sourceId]);
      if (rows.length === 0) {
        throw new DatasetError(`${meal.mealPath}: catalog_source_id "${sourceId}" is not in the catalog database.`);
      }
      const ref: FoodRef = { source: 'catalog', id: String(rows[0].id) };
      const detail = await catalog.getFood(ref);
      found.set(sourceId, { ref, per100g: detail.per100g });
    }
  }
  return found;
}

function trueNutrients(meal: Meal, truth: Map<string, TruthFood>): Nutrients4 | null {
  if (!meal.data.is_food) return null;
  const parts = [
    ...meal.data.items.map((i) => computeItemNutrients(truth.get(i.catalog_source_id) as TruthFood, i.grams)),
    ...meal.data.hidden_ingredients.map((h) => computeItemNutrients(truth.get(h.catalog_source_id) as TruthFood, h.grams)),
  ];
  return four(sumNutrients(parts));
}

interface Scored {
  detectedCount: number;
  truthCount: number;
  pairs: MealOutcome['pairs'];
  predicted: Nutrients4 | null;
  detectedNames: string[];
}

async function scoreScan(
  meal: Meal,
  result: ScanResult,
  catalog: Catalog,
  truth: Map<string, TruthFood>,
  foodCache: Map<string, NutrientAmounts | null>,
): Promise<Scored> {
  const items: DetectedItem[] = result.items;
  const detectedNames = items.map((i) => i.name);
  if (!meal.data.is_food) {
    return { detectedCount: items.length, truthCount: 0, pairs: [], predicted: null, detectedNames };
  }
  const locale = meal.data.locale;
  const matches: MatchResult[] = await catalog.match(items, locale);
  const checks = checkScanResult(result);

  const per100g = async (ref: FoodRef): Promise<NutrientAmounts | null> => {
    const key = `${ref.source}:${ref.id}`;
    if (!foodCache.has(key)) {
      try {
        foodCache.set(key, (await catalog.getFood(ref)).per100g);
      } catch {
        foodCache.set(key, null);
      }
    }
    return foodCache.get(key) ?? null;
  };

  const amounts: NutrientAmounts[] = [];
  for (let i = 0; i < items.length; i++) {
    const match = matches[i];
    if (match.ref) {
      const p = await per100g(match.ref);
      if (p) amounts.push(computeItemNutrients({ per100g: p }, items[i].grams));
    } else if (match.kind === 'ai_estimate' && match.fallback_per_100g && checks.items[i].fallbackUsable) {
      const f = match.fallback_per_100g;
      amounts.push(computeItemNutrients({ per100g: { kcal: f.kcal, protein: f.protein_g, carbs: f.carbs_g, fat: f.fat_g } }, items[i].grams));
    }
  }

  const truthItems = meal.data.items;
  const paired = pairItems(
    items.map((i) => ({ names: [i.name, i.canonical_name_en, ...i.search_terms_en] })),
    truthItems.map((t) => ({ names: [t.name, ...t.aliases] })),
  );
  const pairs = paired.map(([d, t]) => {
    const wanted = new Set([truthItems[t].catalog_source_id, ...truthItems[t].also_acceptable].map((s) => (truth.get(s) as TruthFood).ref.id));
    const ref = matches[d].ref;
    return {
      trueGrams: truthItems[t].grams,
      predictedGrams: items[d].grams,
      matched: ref !== null && ref.source === 'catalog' && wanted.has(ref.id),
    };
  });

  return { detectedCount: items.length, truthCount: truthItems.length, pairs, predicted: four(sumNutrients(amounts)), detectedNames };
}

/**
 * Runs the benchmark: validates the data set, calls (or replays from the cache) the real
 * `analyzeMeal` per meal, matches against `catalog.db`, computes nutrients with core, scores,
 * and writes the results file and the summary.
 */
export async function runBenchmark(config: BenchConfig, deps: HarnessDeps): Promise<BenchReport> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const secret = config.apiKey;
  assertSecureBaseUrl(config.baseUrl);

  const all = loadDataset(config.dataDir, { maxImageBytes: config.maxImageBytes });
  const meals = selectSubset(all, config.subset);

  const db = new NodeSqliteCatalogDb(config.catalogPath);
  try {
    const catalog = createCatalog({ db, memory: new InMemoryMatchMemory() });
    const truth = await resolveTruth(meals, db, catalog);

    const profile: ProviderProfile = {
      id: 'bench',
      adapter: config.adapter,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutS: config.timeoutS,
      ...(config.outputMode ? { outputMode: config.outputMode } : {}),
    };
    const cache = new ResponseCache(config.cacheDir, secret);
    const foodCache = new Map<string, NutrientAmounts | null>();
    const reports: MealReport[] = [];
    let calledProvider = false;

    for (const [index, meal] of meals.entries()) {
      const label = `[${index + 1}/${meals.length}] ${meal.id}`;
      const locale = meal.data.locale;
      const bytes = readFileSync(meal.photoPath);
      const key: CacheKeyParts = {
        imageHash: sha256(bytes),
        model: config.model,
        promptVersion: PROMPT_VERSION,
        variant: [config.adapter, config.outputMode ?? '', locale, meal.data.hint ?? ''].join('|'),
      };

      let outcome = cache.get(key);
      let errorCode: string | undefined;
      if (outcome) {
        log(`${label}: cached`);
      } else if (config.offline) {
        errorCode = 'not_cached';
        log(`${label}: not cached (offline)`);
      } else {
        if (calledProvider && config.delayMs > 0) await sleep(config.delayMs);
        calledProvider = true;
        const started = now();
        try {
          const out = await analyzeMeal(
            {
              profile,
              apiKey: config.apiKey,
              imageJpegBase64: bytes.toString('base64'),
              hint: meal.data.hint,
              locale,
              signal: new AbortController().signal,
            },
            { fetch: deps.fetch, sleep: deps.sleep, now: deps.now },
          );
          outcome = { status: 'ok', result: out.result, usage: out.usage, latencyMs: now() - started, repaired: out.repaired };
        } catch (error) {
          const latencyMs = now() - started;
          if (error instanceof NoFoodDetectedError) {
            outcome = { status: 'no_food', latencyMs };
          } else if (error instanceof ProviderError && error.code === 'invalid_output') {
            outcome = { status: 'invalid_output', latencyMs, rawResponse: error.rawResponse };
          } else if (error instanceof ProviderError) {
            errorCode = error.code;
          } else if (error instanceof CancelledError) {
            errorCode = 'cancelled';
          } else {
            errorCode = 'unexpected';
            log(`${label}: unexpected error: ${scrub(String((error as Error)?.message ?? error), secret)}`);
          }
        }
        if (outcome) cache.put(key, outcome);
        log(`${label}: ${outcome ? outcome.status : `failed (${errorCode})`}`);
      }

      reports.push(await toReport(meal, outcome, errorCode, catalog, truth, foodCache));
    }

    const report: BenchReport = {
      model: config.model,
      adapter: config.adapter,
      promptVersion: PROMPT_VERSION,
      date: new Date(now()).toISOString(),
      datasetSize: {
        total: meals.length,
        food: meals.filter((m) => m.data.is_food).length,
        nonFood: meals.filter((m) => !m.data.is_food).length,
      },
      subset: config.subset,
      metrics: aggregate(reports),
      meals: reports,
    };
    const written = writeReport(config.outDir, report, secret);
    log(`Results: ${written.resultsPath}`);
    log(`Summary: ${written.summaryPath}`);
    return report;
  } finally {
    db.close();
  }
}

async function toReport(
  meal: Meal,
  outcome: CachedOutcome | null,
  errorCode: string | undefined,
  catalog: Catalog,
  truth: Map<string, TruthFood>,
  foodCache: Map<string, NutrientAmounts | null>,
): Promise<MealReport> {
  const trueN = trueNutrients(meal, truth);
  const base = {
    id: meal.id,
    category: meal.category,
    isFood: meal.data.is_food,
    repaired: false,
    latencyMs: null as number | null,
    inputTokens: null as number | null,
    outputTokens: null as number | null,
    trueNutrients: trueN,
    truthCount: meal.data.is_food ? meal.data.items.length : 0,
    detectedCount: 0,
    pairs: [] as MealOutcome['pairs'],
    predictedNutrients: null as Nutrients4 | null,
    detectedNames: [] as string[],
  };
  if (!outcome) return { ...base, status: 'failed', ...(errorCode ? { errorCode } : {}) };
  if (outcome.status !== 'ok') return { ...base, status: outcome.status, latencyMs: outcome.latencyMs };

  const scored = await scoreScan(meal, outcome.result, catalog, truth, foodCache);
  return {
    ...base,
    status: 'ok',
    repaired: outcome.repaired,
    latencyMs: outcome.latencyMs,
    inputTokens: outcome.usage?.inputTokens ?? null,
    outputTokens: outcome.usage?.outputTokens ?? null,
    detectedCount: scored.detectedCount,
    truthCount: scored.truthCount,
    pairs: scored.pairs,
    predictedNutrients: scored.predicted,
    detectedNames: scored.detectedNames,
  };
}
