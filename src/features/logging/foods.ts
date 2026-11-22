import type { FoodDetail, FoodNameEntry, FoodRef } from '@/core/catalog';
import type { NutrientAmounts } from '@/core/nutrition';
import i18n from '@/i18n';
import type { Locale } from '@/i18n/locale';
import type { AppServices } from '../startup/types';

/** A food in a list: the per-100 g headline values are shown under the name. */
export interface FoodRow {
  ref: FoodRef;
  name: string;
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  /** Created by the person (FR-32), shown with a "Custom" tag. */
  custom: boolean;
  /** A packaged product from a barcode lookup (S5), shown with a "Barcode" tag. */
  barcode?: boolean;
}

/** What the portion sheet needs: nutrients per 100 g and the household measures. */
export interface FoodView {
  ref: FoodRef;
  name: string;
  per100g: NutrientAmounts;
  /** Household measures in the app language, or English when the catalog has none in it. */
  portions: { label: string; grams: number }[];
  /** A portion to start from when the person has none of their own: a custom food's usual portion. */
  defaultGrams: number | null;
}

export const SEARCH_LIMIT = 40;
const CUSTOM_LIMIT = 10;

/** The name in the app language, or the English one when there is no translation (S8). */
export function pickName(names: readonly FoodNameEntry[], locale: Locale, fallback: string): string {
  const best =
    names.find((n) => n.locale === locale && !n.isAlias) ??
    names.find((n) => n.locale === 'en' && !n.isAlias) ??
    names.find((n) => n.locale === locale) ??
    names[0];
  return best?.name ?? fallback;
}

const headline = (per100g: NutrientAmounts) => ({
  kcal100g: per100g.kcal ?? 0,
  protein100g: per100g.protein ?? 0,
  carbs100g: per100g.carbs ?? 0,
  fat100g: per100g.fat ?? 0,
});

function viewFromCatalog(detail: FoodDetail, locale: Locale): FoodView {
  const inLocale = detail.portions.filter((p) => p.locale === locale);
  const portions = inLocale.length > 0 ? inLocale : detail.portions.filter((p) => p.locale === 'en');
  return {
    ref: detail.ref,
    name: pickName(detail.names, locale, detail.name),
    per100g: detail.per100g,
    portions: portions.map((p) => ({ label: p.label, grams: p.grams })),
    defaultGrams: null,
  };
}

/** Reads one food (catalog, custom or a barcode product) with everything needed to compute a portion. Null when it no longer exists. */
export async function loadFoodView(services: AppServices, ref: FoodRef, locale: Locale): Promise<FoodView | null> {
  if (ref.source === 'barcode') {
    const product = await services.repos.barcodeProducts.get(ref.id);
    // A product still missing values has nothing to compute a portion from: it is completed before it can be added.
    if (!product || product.missing.some((field) => field !== 'name') || product.name === '') return null;
    const serving = product.servingG;
    return {
      ref,
      name: product.name,
      per100g: product.per100g,
      portions: serving !== null ? [{ label: i18n.getFixedT(locale)('barcode.result.servingLabel'), grams: serving }] : [],
      defaultGrams: serving,
    };
  }
  if (ref.source === 'custom') {
    const food = await services.repos.customFoods.get(ref.id);
    return food ? { ref, name: food.name, per100g: food.per100g, portions: [], defaultGrams: food.defaultPortionG } : null;
  }
  try {
    return viewFromCatalog(await services.catalog.getFood(ref), locale);
  } catch {
    // A catalog build that no longer has this food: a recent or favorite pointing at it is skipped.
    return null;
  }
}

export const rowFromView = (view: FoodView): FoodRow => ({
  ref: view.ref,
  name: view.name,
  ...headline(view.per100g),
  custom: view.ref.source === 'custom',
  barcode: view.ref.source === 'barcode',
});

/**
 * Local, instant search (FR-30): the catalog in the app language with English as fallback, plus the
 * person's custom foods. Custom foods come first: they are what the person made for themselves.
 */
export async function searchFoods(services: AppServices, query: string, locale: Locale): Promise<FoodRow[]> {
  const [catalog, custom] = await Promise.all([
    services.catalog.search(query, locale, SEARCH_LIMIT),
    services.repos.customFoods.list({ query, limit: CUSTOM_LIMIT }),
  ]);
  return [
    ...custom.map<FoodRow>((food) => ({
      ref: { source: 'custom', id: food.id },
      name: food.name,
      kcal100g: food.kcal100g,
      protein100g: food.protein100g,
      carbs100g: food.carbs100g,
      fat100g: food.fat100g,
      custom: true,
    })),
    ...catalog.map<FoodRow>((food) => ({
      ref: food.ref,
      name: food.name,
      kcal100g: food.kcal100g ?? 0,
      protein100g: food.protein100g ?? 0,
      carbs100g: food.carbs100g ?? 0,
      fat100g: food.fat100g ?? 0,
      custom: false,
    })),
  ];
}

export const refKey = (ref: FoodRef): string => `${ref.source}:${ref.id}`;

export interface UsageLists {
  favorites: FoodRow[];
  recents: FoodRow[];
  /** `lastGrams` of every food the person has used, by `refKey`. */
  lastGrams: Map<string, number>;
}

const RECENTS = 12;

/** Favorites and recent foods with their names, for the empty search state and for ranking results. */
export async function loadUsage(services: AppServices, locale: Locale): Promise<UsageLists> {
  const [favorites, recents] = await Promise.all([services.repos.foodUsage.favorites(), services.repos.foodUsage.recents(RECENTS)]);
  const lastGrams = new Map<string, number>();
  const resolve = async (entries: typeof favorites): Promise<FoodRow[]> => {
    const rows = await Promise.all(
      entries.map(async (entry) => {
        const ref = { source: entry.foodSource, id: entry.foodRef } as FoodRef;
        if (entry.lastGrams != null) lastGrams.set(refKey(ref), entry.lastGrams);
        const view = await loadFoodView(services, ref, locale);
        return view ? rowFromView(view) : null;
      }),
    );
    return rows.filter((row): row is FoodRow => row !== null);
  };
  const [favoriteRows, recentRows] = await Promise.all([resolve(favorites), resolve(recents)]);
  const favoriteKeys = new Set(favoriteRows.map((row) => refKey(row.ref)));
  return { favorites: favoriteRows, recents: recentRows.filter((row) => !favoriteKeys.has(refKey(row.ref))), lastGrams };
}
