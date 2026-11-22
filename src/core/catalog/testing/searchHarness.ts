import type { Catalog, CatalogDb, FoodState } from '..';
import type { Accept, SearchCase } from './searchQueries';

export interface IndexedFood {
  id: string;
  en: string;
  state: FoodState;
  branded: boolean;
}

/** English description, state and branded flag of every food, by catalog id. */
export async function indexFoods(db: CatalogDb): Promise<Map<string, IndexedFood>> {
  const rows = await db.all(
    `SELECT f.id AS id, f.state AS state, f.is_branded AS branded, n.name AS en
       FROM food f JOIN food_name n ON n.food_id = f.id AND n.locale = 'en' AND n.is_alias = 0`,
  );
  return new Map(rows.map((r) => [String(r.id), { id: String(r.id), en: String(r.en), state: r.state as FoodState, branded: Number(r.branded) === 1 }]));
}

export function accepts(a: Accept, food: IndexedFood): boolean {
  if (!a.en.test(food.en)) return false;
  if (a.not?.test(food.en)) return false;
  if (a.state && !a.state.includes(food.state)) return false;
  if (a.generic && food.branded) return false;
  return true;
}

export interface CaseResult {
  case: SearchCase;
  /** English descriptions of the first three results. */
  top: string[];
  rank: number | null;
}

export interface Accuracy {
  total: number;
  top1: number;
  top3: number;
  results: CaseResult[];
}

export async function measure(catalog: Catalog, index: Map<string, IndexedFood>, cases: readonly SearchCase[]): Promise<Accuracy> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    const hits = await catalog.search(c.q, c.locale, 3);
    const foods = hits.map((h) => index.get(h.ref.id)).filter((f): f is IndexedFood => f !== undefined);
    const idx = foods.findIndex((f) => accepts(c.accept, f));
    results.push({ case: c, top: foods.map((f) => f.en), rank: idx < 0 ? null : idx + 1 });
  }
  return {
    total: results.length,
    top1: results.filter((r) => r.rank === 1).length,
    top3: results.filter((r) => r.rank !== null).length,
    results,
  };
}

/** Cases that no food of the catalog satisfies: the case itself is wrong, not the ranking. */
export function unsatisfiable(index: Map<string, IndexedFood>, cases: readonly SearchCase[]): SearchCase[] {
  const foods = [...index.values()];
  return cases.filter((c) => !foods.some((f) => accepts(c.accept, f)));
}
