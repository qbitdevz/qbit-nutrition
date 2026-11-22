export type CatalogSource = 'usda_foundation' | 'usda_sr_legacy' | 'usda_fndds';

/** One food as read from a USDA bulk file, reduced to what the catalog needs. */
export interface SourceFood {
  source: CatalogSource;
  /** FoodData Central id (`fdcId`). */
  fdcId: number;
  /** English description, as USDA writes it ("Rice, white, long-grain, regular, cooked"). */
  description: string;
  category: string | null;
  /** All USDA nutrients of the food; the builder keeps only the tracked ones. */
  nutrients: { id: number; unit: string; amount: number }[];
  portions: { label: string; grams: number }[];
}

/** One row of the Spanish translation table (scripts/catalog/data/translations.es.json). */
export interface TranslationEntry {
  /** Exact USDA English description (case-insensitive) of the food this translates. */
  en: string;
  /** Spanish primary name. */
  es: string;
  /** Other Spanish names people use ("banano", "guineo"). */
  aliases?: string[];
}

export interface CatalogMeta {
  dataVersion: string;
  buildDate: string;
  sourceFiles: string[];
}

export interface BuildCounts {
  nutrient: number;
  food: number;
  food_nutrient: number;
  food_name: number;
  food_portion: number;
  food_fts: number;
  catalog_meta: number;
  /** Foods left out because another source publishes the same food (see `dedupeFoods`). */
  duplicatesDropped: number;
  /** Spanish names by origin: handwritten, composed from the glossary, and how many were given a qualifier to tell them apart. */
  namesHandwritten: number;
  namesComposed: number;
  namesDisambiguated: number;
  /** English words the glossary lacks, with the number of foods each blocks. A shippable catalog has none. */
  missingWords: Record<string, number>;
  /** Translation entries that matched no USDA description. */
  unmatchedTranslations: string[];
}
