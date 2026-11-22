import type { FoodNutrition, NutrientAmounts } from '../nutrition/types';
import type { RecipeDetail } from './recipes';

export type Locale = 'en' | 'es';

export type FoodRef =
  | { source: 'catalog'; id: string }
  | { source: 'custom'; id: string }
  | { source: 'barcode'; id: string };

export type FoodState = 'raw' | 'cooked' | 'processed' | 'unknown';

export interface FoodSummary {
  ref: FoodRef;
  /** Name in the requested locale, or the English name when there is no translation. */
  name: string;
  category: string | null;
  state: FoodState;
  /** Branded or restaurant entries; generic entries are preferred when matching. */
  isBranded: boolean;
  kcal100g: number | null;
  protein100g: number | null;
  carbs100g: number | null;
  fat100g: number | null;
}

export interface FoodNameEntry {
  locale: string;
  name: string;
  isAlias: boolean;
}

export interface FoodPortion {
  locale: string;
  label: string;
  grams: number;
}

export interface FoodDetail extends FoodNutrition {
  ref: FoodRef;
  /** Primary English name. */
  name: string;
  names: FoodNameEntry[];
  category: string | null;
  state: FoodState;
  isBranded: boolean;
  per100g: NutrientAmounts;
  portions: FoodPortion[];
}

export type Preparation =
  | 'raw'
  | 'boiled'
  | 'steamed'
  | 'grilled'
  | 'baked'
  | 'fried'
  | 'sauteed'
  | 'stewed'
  | 'processed'
  | 'unknown';

export interface FallbackPer100g {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * The fields of a detected item (`DetectedItem` in core/ai/schema.ts) that matching reads.
 * Declared structurally so core/catalog does not depend on core/ai; a `DetectedItem` is
 * assignable to it.
 */
export interface MatchInput {
  name: string;
  canonical_name_en: string;
  search_terms_en: readonly string[];
  preparation: Preparation;
  fallback_per_100g?: FallbackPer100g;
}

export interface ScoredFood {
  food: FoodSummary;
  score: number;
}

export type MatchResult =
  /** The user confirmed this mapping before; applied without scoring. */
  | { kind: 'memory'; ref: FoodRef; food: FoodSummary | null; score: 1; needsReview: false; alternatives: ScoredFood[] }
  /** Best catalog candidate passed the threshold. */
  | { kind: 'catalog'; ref: FoodRef; food: FoodSummary; score: number; needsReview: false; alternatives: ScoredFood[] }
  /** Nothing passed the threshold: use the AI's own per-100 g values, marked as an estimate. */
  | {
      kind: 'ai_estimate';
      ref: null;
      food: null;
      score: number;
      needsReview: true;
      fallback_per_100g: FallbackPer100g | null;
      alternatives: ScoredFood[];
    };

export interface Catalog {
  search(query: string, locale: Locale, limit: number): Promise<FoodSummary[]>;
  match(items: readonly MatchInput[], locale: Locale): Promise<MatchResult[]>;
  getFood(ref: FoodRef): Promise<FoodDetail>;
  /** How a recipe-calculated food was made (`isRecipeRef`), in the language asked for; null for any other food. */
  getRecipe(ref: FoodRef, locale: Locale): Promise<RecipeDetail | null>;
  rememberCorrection(detectedName: string, ref: FoodRef): Promise<void>;
}
