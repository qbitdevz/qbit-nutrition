export { createCatalog, CatalogError } from './catalog';
export type { CatalogOptions } from './catalog';
export { DEFAULT_MATCH_THRESHOLD } from './ranking';
export { normalizeName } from './text';
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
