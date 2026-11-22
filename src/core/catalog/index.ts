export { createCatalog, CatalogError } from './catalog';
export type { CatalogOptions } from './catalog';
export { DEFAULT_MATCH_THRESHOLD, createNameScorer, cueFree, wordForms } from './ranking';
export { nameIndexTokens, normalizeName, searchWords } from './text';
export { isRecipeRef, RECIPE_ID_BASE } from './recipes';
export type { RecipeDetail, RecipeIngredientView } from './recipes';
export type { CatalogDb, MatchMemory, SqlRow, SqlValue } from './ports';
export type {
  Catalog,
  FallbackPer100g,
  FoodDetail,
  FoodNameEntry,
  FoodPortion,
  FoodRef,
  FoodState,
  FoodSummary,
  Locale,
  MatchInput,
  MatchResult,
  Preparation,
  ScoredFood,
} from './types';
