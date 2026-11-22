/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RECIPE_ID_BASE } from '../../src/core/catalog/recipes';
import { NUTRIENT_CODES, type NutrientCode } from '../../src/core/nutrition/types';
import { trackedAmounts } from './builder';
import { calculateRecipe, type CalcIngredient, type CalcResult } from './recipeCalc';
import { TRACKED_NUTRIENTS } from './trackedNutrients';
import type { CatalogSource, SourceFood } from './types';

/**
 * Recipes as data (scripts/catalog/data/recipes/*.json) and their resolution against the catalog sources
 * (odd/tasks/catalog-expansion.md T4, S7; method in docs/catalog-recipes.md).
 */

/** Kinds of dish; the sanity tests give each kind a plausible range taken from comparable foods of the catalog. */
export const DISH_TYPES = [
  'breaded_meat',
  'filled_pastry',
  'tart',
  'bread_pastry',
  'sandwich',
  'cheese_dish',
  'stew',
  'pasta_dish',
  'egg_potato_dish',
  'pizza_flatbread',
  'rice_bean_dish',
  'dessert',
  'sweet_biscuit',
  'hot_drink',
  'infusion',
  'cold_dish',
] as const;
export type DishType = (typeof DISH_TYPES)[number];

export type IngredientSource = Exclude<CatalogSource, 'qbit_recipe'>;

export interface Bilingual {
  en: string;
  es: string;
}

export interface RecipeIngredientDef {
  source: IngredientSource;
  sourceId: number;
  /** The catalog's English description of that food: the build stops when it does not match, so a wrong id cannot go unnoticed. */
  description: string;
  /** Grams as used, before cooking (edible portion). */
  grams: number;
  /** Key of a published cooking yield: "ndb|method" in `usda-cooking-yields-r2.json`. */
  yield?: string;
  /** Code of a published retention row in `usda-retention-r6.json`. */
  retention?: string;
  /** Moisture group (see `moistureGroups`). */
  group?: string;
  /** Fat taken up in frying: an assumption of the recipe (stated in `basis`), not a catalog measurement. */
  absorbed?: boolean;
}

export interface FoodReference {
  source: IngredientSource;
  sourceId: number;
  description: string;
}

export interface RecipeDef {
  /** Stable number: the food id is `RECIPE_ID_BASE + id`. Never reused, never renumbered. */
  id: number;
  /** Stable slug; stored as `source_id`. */
  key: string;
  nameEn: string;
  nameEs: string;
  aliasesEn?: string[];
  aliasesEs?: string[];
  dishType: DishType;
  state: 'raw' | 'cooked' | 'processed' | 'unknown';
  ingredients: RecipeIngredientDef[];
  /** Dough or pastry baked down to the moisture of a reference food of the catalog (its water, as published). */
  moistureGroups?: Record<string, FoodReference>;
  /** The recipe states the weight of the finished batch (stews). Replaces every yield. */
  finalGrams?: number;
  preparation: Bilingual;
  /** Where the proportions come from and the assumptions made (cut, breading, oil absorbed). */
  basis: Bilingual;
  /** Household measures with their grams. */
  portions: { en: string; es: string; grams: number }[];
}

export interface Citation {
  title: string;
  url: string;
  publisher?: string;
  date?: string;
  page?: string;
  note?: string;
}

export interface RetentionRow {
  code: string;
  foodGroup: string;
  description: string;
  /** Percent retained, by tracked nutrient (only those the table covers). */
  percent: Partial<Record<NutrientCode, number>>;
}

export interface YieldRow {
  foodGroup: string;
  ndb: string | null;
  description: string;
  method: string;
  yieldPercent: number;
  n?: number | null;
  sd?: number | null;
  min?: number | null;
  max?: number | null;
  moistureChangePercent?: number | null;
  fatChangePercent?: number | null;
  releaseYear?: string;
}

export interface FactorTables {
  retention: { source: Citation; rows: RetentionRow[] };
  yields: { source: Citation; rows: YieldRow[] };
}

/** One recipe, calculated and ready for the builder. */
export interface ResolvedRecipe {
  /** The dish as a catalog food (`source = 'qbit_recipe'`). */
  food: SourceFood;
  key: string;
  nameEs: string;
  aliasesEn: string[];
  aliasesEs: string[];
  version: string;
  preparation: Bilingual;
  basis: Bilingual;
  rawGrams: number;
  finalGrams: number;
  /** How the weight of the finished dish was set: ingredient yields, a reference food's moisture for some ingredients, or a declared weight. */
  weightRule: 'yields' | 'moisture' | 'declared';
  unknown: NutrientCode[];
  understatedBy: CalcResult['understatedBy'];
  ingredients: {
    source: IngredientSource;
    sourceId: number;
    grams: number;
    yieldPercent: number | null;
    yieldSource: string | null;
    retentionSource: string | null;
    absorbed: boolean;
  }[];
}

export const yieldKey = (row: Pick<YieldRow, 'ndb' | 'description' | 'method'>): string => `${row.ndb ?? row.description}|${row.method}`;

export function loadFactors(dir: string): FactorTables {
  const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as T;
  return {
    retention: read('usda-retention-r6.json'),
    yields: read('usda-cooking-yields-r2.json'),
  };
}

/** Reads every `*.json` array of recipes in `dir` (files starting with "_" are not recipes), and the set version from `_meta.json`. */
export function loadRecipes(dir: string): { version: string; recipes: RecipeDef[] } {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  const recipes = files.flatMap((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as RecipeDef[]);
  const meta = JSON.parse(readFileSync(path.join(dir, '_meta.json'), 'utf8')) as { version: string };
  return { version: meta.version, recipes };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function checkDef(def: RecipeDef): void {
  const where = `Recipe "${def.key}"`;
  if (!Number.isInteger(def.id) || def.id < 1) throw new Error(`${where}: the id must be a positive integer (got ${def.id})`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def.key)) throw new Error(`${where}: the key must be a lowercase slug`);
  if (def.nameEn.trim() === '') throw new Error(`${where} needs an English name`);
  if (def.nameEs.trim() === '') throw new Error(`${where} needs a Spanish name`);
  if (!DISH_TYPES.includes(def.dishType)) throw new Error(`${where}: unknown dish type "${def.dishType}"`);
  for (const [field, text] of [['preparation', def.preparation], ['basis', def.basis]] as const) {
    if (text.en.trim() === '' || text.es.trim() === '') throw new Error(`${where}: ${field} needs both languages`);
  }
  if (def.portions.length === 0) throw new Error(`${where} needs at least one household portion`);
  for (const p of def.portions) {
    if (p.en.trim() === '' || p.es.trim() === '' || !(p.grams > 0)) throw new Error(`${where}: a portion needs an English and a Spanish label and grams above 0`);
  }
  if (def.finalGrams !== undefined && def.ingredients.some((i) => i.yield !== undefined)) {
    throw new Error(`${where} declares a final weight and also uses a yield: use one weight rule`);
  }
  for (const i of def.ingredients) {
    if (i.group !== undefined && def.moistureGroups?.[i.group] === undefined) throw new Error(`${where}: ingredient ${i.source}:${i.sourceId} is in the group "${i.group}", which has no reference food`);
  }
}

/**
 * Calculates every recipe from the catalog sources (before de-duplication: a recipe may name a food that another source's twin
 * replaces) and the published factor tables. Stops with a clear message on a missing ingredient, a wrong description, an unknown
 * factor key, or an invalid recipe.
 */
export function resolveRecipes(defs: readonly RecipeDef[], sourceFoods: readonly SourceFood[], factors: FactorTables, version: string): ResolvedRecipe[] {
  const foods = new Map<string, SourceFood>(sourceFoods.map((f) => [`${f.source}:${f.fdcId}`, f]));
  const yields = new Map(factors.yields.rows.map((r) => [yieldKey(r), r]));
  const retention = new Map(factors.retention.rows.map((r) => [r.code, r]));
  const ids = new Set<number>();
  const keys = new Set<string>();

  const find = (where: string, ref: FoodReference): SourceFood => {
    const food = foods.get(`${ref.source}:${ref.sourceId}`);
    if (!food) throw new Error(`${where}: ingredient ${ref.source}:${ref.sourceId} ("${ref.description}") is not in the catalog data`);
    if (food.description !== ref.description) throw new Error(`${where}: ${ref.source}:${ref.sourceId} is "${food.description}", not "${ref.description}"`);
    return food;
  };
  const waterOf = (where: string, food: SourceFood): number => {
    const water = food.nutrients.find((n) => n.id === 1051 && n.unit.toLowerCase() === 'g');
    if (!water) throw new Error(`${where}: "${food.description}" has no water value, which a moisture group needs`);
    return water.amount;
  };

  return defs.map((def) => {
    const where = `Recipe "${def.key}"`;
    checkDef(def);
    if (ids.has(def.id)) throw new Error(`Recipe id ${def.id} is used twice`);
    ids.add(def.id);
    if (keys.has(def.key)) throw new Error(`Recipe key "${def.key}" is used twice`);
    keys.add(def.key);

    const used = def.ingredients.map((ing) => {
      const food = find(where, ing);
      let yieldRow: YieldRow | undefined;
      if (ing.yield !== undefined) {
        yieldRow = yields.get(ing.yield);
        if (!yieldRow) throw new Error(`${where}: yield "${ing.yield}" is not in the USDA cooking yield table`);
      }
      let retentionRow: RetentionRow | undefined;
      if (ing.retention !== undefined) {
        retentionRow = retention.get(ing.retention);
        if (!retentionRow) throw new Error(`${where}: retention "${ing.retention}" is not in the USDA retention table`);
      }
      return { ing, food, yieldRow, retentionRow };
    });

    const groups: Record<string, { moisture: number }> = {};
    for (const [name, ref] of Object.entries(def.moistureGroups ?? {})) groups[name] = { moisture: waterOf(`${where} (group "${name}")`, find(where, ref)) };

    const calcIngredients: CalcIngredient[] = used.map(({ ing, food, yieldRow, retentionRow }) => ({
      per100g: trackedAmounts(food),
      grams: ing.grams,
      ...(yieldRow ? { yieldFactor: yieldRow.yieldPercent / 100 } : {}),
      ...(retentionRow ? { retention: Object.fromEntries(Object.entries(retentionRow.percent).map(([code, pct]) => [code, (pct as number) / 100])) } : {}),
      ...(ing.group !== undefined ? { group: ing.group, water: waterOf(where, food) } : {}),
    }));
    const result = calculateRecipe({
      ingredients: calcIngredients,
      ...(Object.keys(groups).length > 0 ? { groups } : {}),
      ...(def.finalGrams !== undefined ? { finalGrams: def.finalGrams } : {}),
    });

    const nutrients: SourceFood['nutrients'] = [];
    for (const code of NUTRIENT_CODES) {
      const value = result.per100g[code];
      if (value === undefined) continue;
      const spec = TRACKED_NUTRIENTS[code];
      nutrients.push({ id: spec.usdaIds[0] as number, unit: spec.unit === 'ug' ? 'µg' : spec.unit, amount: round3(value) });
    }

    const food: SourceFood = {
      source: 'qbit_recipe',
      fdcId: RECIPE_ID_BASE + def.id,
      sourceId: def.key,
      description: def.nameEn,
      category: 'Regional dishes (recipe)',
      nutrients,
      portions: def.portions.map((p) => ({ label: p.en, grams: p.grams })),
      portionsEs: def.portions.map((p) => ({ label: p.es, grams: p.grams })),
      state: def.state,
    };
    return {
      food,
      key: def.key,
      nameEs: def.nameEs,
      aliasesEn: def.aliasesEn ?? [],
      aliasesEs: def.aliasesEs ?? [],
      version,
      preparation: def.preparation,
      basis: def.basis,
      rawGrams: result.rawGrams,
      finalGrams: result.finalGrams,
      weightRule: def.finalGrams !== undefined ? 'declared' : def.ingredients.some((i) => i.group !== undefined) ? 'moisture' : 'yields',
      unknown: result.unknown,
      understatedBy: result.understatedBy,
      ingredients: used.map(({ ing, yieldRow, retentionRow }) => ({
        source: ing.source,
        sourceId: ing.sourceId,
        grams: ing.grams,
        yieldPercent: yieldRow ? yieldRow.yieldPercent : null,
        yieldSource: yieldRow ? `${factors.yields.source.title}: ${yieldRow.ndb ?? yieldRow.description}, ${yieldRow.method}, ${yieldRow.yieldPercent} %` : null,
        retentionSource: retentionRow ? `${factors.retention.source.title}: ${retentionRow.code} ${retentionRow.description}` : null,
        absorbed: ing.absorbed === true,
      })),
    };
  });
}
