import type { AdapterId, OutputMode } from '../src/core/ai';

/** Everything a run needs. Built from flags and environment variables only; see config.ts. */
export interface BenchConfig {
  adapter: AdapterId;
  baseUrl: string;
  model: string;
  /** Read from the environment variable named `keyEnvName`; never written anywhere. */
  apiKey: string | null;
  keyEnvName: string;
  dataDir: string;
  catalogPath: string;
  cacheDir: string;
  outDir: string;
  subset: 'all' | 'smoke';
  delayMs: number;
  timeoutS: number;
  outputMode?: OutputMode;
  maxImageBytes: number;
  /** Score from the cache only; never call the provider. */
  offline: boolean;
}

export interface Nutrients4 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A detected item paired with a ground-truth item. */
export interface ItemPair {
  trueGrams: number;
  predictedGrams: number;
  /** The catalog matcher chose an acceptable catalog food for it. */
  matched: boolean;
}

/**
 * ok: valid scan with items. no_food: the model said there is no food. invalid_output: still
 * invalid after the repair. failed: provider or infrastructure failure; excluded from every rate.
 */
export type OutcomeStatus = 'ok' | 'no_food' | 'invalid_output' | 'failed';

/** What the pure metric functions consume: one meal, already scored, no I/O attached. */
export interface MealOutcome {
  id: string;
  /** Ground truth: is there food in the photo. */
  isFood: boolean;
  status: OutcomeStatus;
  repaired: boolean;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  detectedCount: number;
  truthCount: number;
  pairs: ItemPair[];
  trueNutrients: Nutrients4 | null;
  predictedNutrients: Nutrients4 | null;
}

export interface Metrics {
  counts: { total: number; food: number; nonFood: number; scored: number; failed: number };
  itemPrecision: number | null;
  itemRecall: number | null;
  portionMape: number | null;
  portionBias: number | null;
  matchingRate: number | null;
  energyMape: number | null;
  proteinMape: number | null;
  carbsMape: number | null;
  fatMape: number | null;
  within10: number | null;
  within20: number | null;
  validFirstAttempt: number | null;
  validAfterRepair: number | null;
  latencyMedianMs: number | null;
  latencyP95Ms: number | null;
  inputTokensPerScan: number | null;
  outputTokensPerScan: number | null;
  noFoodRateFoodPhotos: number | null;
  noFoodRateNonFoodPhotos: number | null;
}

export interface MealReport extends MealOutcome {
  category: string;
  errorCode?: string;
  detectedNames: string[];
}

export interface BenchReport {
  model: string;
  adapter: AdapterId;
  promptVersion: number;
  date: string;
  datasetSize: { total: number; food: number; nonFood: number };
  subset: 'all' | 'smoke';
  metrics: Metrics;
  meals: MealReport[];
}
