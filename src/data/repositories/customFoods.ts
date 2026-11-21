import { asc, eq, sql } from 'drizzle-orm';
import type { NutrientAmounts } from '../../core/nutrition';
import { DataError } from '../errors';
import { customFood } from '../schema';
import { TEXT_LIMITS, invalid, isHeadline, nutrientEntries, requireFinite, requireMaxLength, type RepositoryContext } from './shared';

type CustomFoodRow = typeof customFood.$inferSelect;

export interface CustomFood extends Omit<CustomFoodRow, 'otherNutrientsJson'> {
  /** Optional per-100 g values by nutrient code (never the four headline ones). */
  otherNutrients: NutrientAmounts | null;
  /** All per-100 g values in the shape `core/nutrition` reads (`FoodNutrition`). */
  per100g: NutrientAmounts;
}

export interface CustomFoodInput {
  name: string;
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  otherNutrients?: NutrientAmounts | null;
  defaultPortionG?: number | null;
}

export interface CustomFoodRepository {
  create(input: CustomFoodInput): Promise<CustomFood>;
  get(id: string): Promise<CustomFood | null>;
  /** Changes the given fields only. Meals already logged keep their own snapshot. */
  update(id: string, patch: Partial<CustomFoodInput>): Promise<CustomFood>;
  delete(id: string): Promise<void>;
  /** By name, optionally filtered by a substring (case-insensitive). */
  list(options?: { query?: string; limit?: number }): Promise<CustomFood[]>;
}

export function toCustomFood(row: CustomFoodRow): CustomFood {
  const other = row.otherNutrientsJson ? (JSON.parse(row.otherNutrientsJson) as NutrientAmounts) : null;
  return {
    id: row.id,
    name: row.name,
    kcal100g: row.kcal100g,
    protein100g: row.protein100g,
    carbs100g: row.carbs100g,
    fat100g: row.fat100g,
    defaultPortionG: row.defaultPortionG,
    otherNutrients: other,
    per100g: {
      kcal: row.kcal100g,
      protein: row.protein100g,
      carbs: row.carbs100g,
      fat: row.fat100g,
      ...other,
    },
  };
}

function validate(input: Partial<CustomFoodInput>): void {
  if (input.name !== undefined && input.name.trim() === '') throw invalid('name must not be blank');
  requireMaxLength(input.name, TEXT_LIMITS.name, 'name');
  for (const key of ['kcal100g', 'protein100g', 'carbs100g', 'fat100g'] as const) {
    const value = input[key];
    if (value !== undefined) requireFinite(value, key, { min: 0 });
  }
  if (input.defaultPortionG != null) requireFinite(input.defaultPortionG, 'defaultPortionG', { min: 0 });
  if (input.otherNutrients) {
    for (const [code] of nutrientEntries(input.otherNutrients, 'otherNutrients')) {
      if (isHeadline(code)) throw invalid(`otherNutrients must not repeat the headline nutrient "${code}"`);
    }
  }
}

/** Escapes `%`, `_` and the escape character for a LIKE pattern. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createCustomFoodRepository({ db, newId }: RepositoryContext): CustomFoodRepository {
  const read = (id: string): CustomFood | null => {
    const row = db.select().from(customFood).where(eq(customFood.id, id)).get();
    return row ? toCustomFood(row) : null;
  };
  const json = (v: NutrientAmounts | null | undefined) => (v && Object.keys(v).length > 0 ? JSON.stringify(v) : null);

  return {
    async create(input) {
      validate(input);
      const id = newId();
      db.insert(customFood)
        .values({
          id,
          name: input.name.trim(),
          kcal100g: input.kcal100g,
          protein100g: input.protein100g,
          carbs100g: input.carbs100g,
          fat100g: input.fat100g,
          otherNutrientsJson: json(input.otherNutrients),
          defaultPortionG: input.defaultPortionG ?? null,
        })
        .run();
      return read(id)!;
    },

    async get(id) {
      return read(id);
    },

    async update(id, patch) {
      validate(patch);
      const set: Partial<typeof customFood.$inferInsert> = {};
      if (patch.name !== undefined) set.name = patch.name.trim();
      if (patch.kcal100g !== undefined) set.kcal100g = patch.kcal100g;
      if (patch.protein100g !== undefined) set.protein100g = patch.protein100g;
      if (patch.carbs100g !== undefined) set.carbs100g = patch.carbs100g;
      if (patch.fat100g !== undefined) set.fat100g = patch.fat100g;
      if (patch.otherNutrients !== undefined) set.otherNutrientsJson = json(patch.otherNutrients);
      if (patch.defaultPortionG !== undefined) set.defaultPortionG = patch.defaultPortionG;

      return db.transaction((tx) => {
        const exists = tx.select({ id: customFood.id }).from(customFood).where(eq(customFood.id, id)).get();
        if (!exists) throw new DataError('not_found', `custom food not found: ${id}`);
        if (Object.keys(set).length > 0) tx.update(customFood).set(set).where(eq(customFood.id, id)).run();
        return toCustomFood(tx.select().from(customFood).where(eq(customFood.id, id)).get()!);
      });
    },

    async delete(id) {
      const removed = db.delete(customFood).where(eq(customFood.id, id)).returning({ id: customFood.id }).all();
      if (removed.length === 0) throw new DataError('not_found', `custom food not found: ${id}`);
    },

    async list({ query, limit = 200 } = {}) {
      const q = query?.trim();
      return db
        .select()
        .from(customFood)
        .where(q ? sql`${customFood.name} LIKE ${likePattern(q)} ESCAPE '\\'` : undefined)
        .orderBy(asc(sql`lower(${customFood.name})`), asc(customFood.id))
        .limit(limit)
        .all()
        .map(toCustomFood);
    },
  };
}
