import { and, asc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { computeItemNutrients, type NutrientAmounts } from '../../core/nutrition';
import type { AppDatabase, AppTransaction } from '../database';
import { requireDayInBounds } from '../dayBounds';
import { DataError } from '../errors';
import { deriveMealTime } from '../localDate';
import { meal, mealItem, mealItemNutrient, REF_FOOD_SOURCES } from '../schema';
import type { FoodResolver } from './foodResolver';
import { upsertUsage } from './foodUsage';
import { requireItemWithinLimits } from './limits';
import {
  PHOTO_PATH_PATTERN,
  TEXT_LIMITS,
  invalid,
  isHeadline,
  nutrientEntries,
  requireFinite,
  requireLocalDate,
  requireMaxLength,
  type RepositoryContext,
} from './shared';

type MealRow = typeof meal.$inferSelect;
type ItemRow = typeof mealItem.$inferSelect;

export type Meal = MealRow;

export interface MealItem extends ItemRow {
  /** The nutrients beyond kcal, protein, carbs and fat (`meal_item_nutrient`) for `grams`. */
  nutrients: NutrientAmounts;
}

export interface MealWithItems extends Meal {
  items: MealItem[];
}

export interface DayLog {
  localDate: string;
  meals: MealWithItems[];
  /** Sum of the item snapshots. kcal, protein, carbs and fat are always present (0 on an empty day). */
  totals: NutrientAmounts;
}

export interface SaveMealItemInput {
  displayName: string;
  grams: number;
  foodSource: ItemRow['foodSource'];
  /** Id in the source (catalog food id, custom food id, barcode); null for `ai_estimate`. */
  foodRef: string | null;
  origin: ItemRow['origin'];
  confidenceFood?: string | null;
  confidencePortion?: string | null;
  /**
   * The snapshot for `grams`: kcal, protein, carbs and fat go to `meal_item`, anything else to
   * `meal_item_nutrient`. Features compute it with `computeItemNutrients` from `core/nutrition`.
   */
  nutrients: NutrientAmounts;
}

export interface SaveMealInput {
  /** When it was eaten. */
  eatenAt: Date;
  /** IANA zone the user is in while logging; default is the device's. Decides `localDate`. */
  timeZone?: string;
  slot: MealRow['slot'];
  name?: string | null;
  source: MealRow['source'];
  scanId?: string | null;
  photoPath?: string | null;
  note?: string | null;
  items: SaveMealItemInput[];
}

export interface DayTotals {
  localDate: string;
  totals: NutrientAmounts;
}

export interface MealRepository {
  /**
   * Saves the meal, its items, their nutrient snapshots and the usage counters of the foods used,
   * in one transaction: either everything is stored or nothing is.
   */
  save(input: SaveMealInput): Promise<MealWithItems>;
  getMeal(id: string): Promise<MealWithItems | null>;
  /** The id of every saved meal, oldest first. */
  listIds(): Promise<string[]>;
  /** The meals of a local date (oldest first) with their items, and the day totals. */
  getDay(localDate: string): Promise<DayLog>;
  /** The distinct photo paths that meals refer to, to tell which kept photos are in use. */
  photoPaths(): Promise<string[]>;
  /** Totals of one local date (zeros for headline nutrients when empty). */
  dayTotals(localDate: string): Promise<NutrientAmounts>;
  /** Totals per local date between `from` and `to` inclusive; days without meals are omitted. */
  totalsByDay(from: string, to: string): Promise<DayTotals[]>;
  updateMeal(
    id: string,
    patch: { slot?: MealRow['slot']; name?: string | null; note?: string | null },
  ): Promise<MealWithItems>;
  /**
   * Sets the grams of an item and recalculates its snapshot from the source food
   * (`core/nutrition`), or by proportion when the item has no source food (AI estimate) or the
   * food no longer exists. An item detected by the AI becomes `ai_edited`.
   */
  updateItemGrams(itemId: string, grams: number): Promise<MealItem>;
  /** Removes the item and returns the id of the meal it belonged to. */
  deleteItem(itemId: string): Promise<string>;
  /** Deletes the meal; its items and snapshots go with it (foreign key cascade). */
  deleteMeal(mealId: string): Promise<void>;
  /**
   * Undo of `deleteItem`: puts the item back as it was, with the same id, position, values, origin, confidences and nutrient
   * snapshot (pass the item as it was read). It is not a new use of the food: usage counters and favorites are not touched.
   * Fails with `not_found` when the meal is gone, and with `invalid_input` when the item (or its position) is taken or its
   * values are outside the limits; nothing is written then.
   */
  restoreItem(item: MealItem): Promise<MealItem>;
  /**
   * Undo of `deleteMeal`: puts the meal and all its items back as they were (pass the meal as it was read), with the same ids.
   * Like `restoreItem`, it counts no new use of the foods. A `photoPath` that is still set must point to a file that exists.
   */
  restoreMeal(saved: MealWithItems): Promise<MealWithItems>;
}

const ZERO_HEADLINE: NutrientAmounts = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

const itemColumns = (item: ItemRow) => ({
  id: item.id,
  mealId: item.mealId,
  position: item.position,
  displayName: item.displayName,
  grams: item.grams,
  foodSource: item.foodSource,
  foodRef: item.foodRef,
  origin: item.origin,
  confidenceFood: item.confidenceFood,
  confidencePortion: item.confidencePortion,
  kcal: item.kcal,
  proteinG: item.proteinG,
  carbsG: item.carbsG,
  fatG: item.fatG,
});

/** The same checks `save` makes on an item, for an item that already has its snapshot columns. */
function requireRestorableItem(item: MealItem, label: string): void {
  if (!Number.isInteger(item.position) || item.position < 0) throw invalid(`${label}.position must be a whole number of 0 or more`);
  requireFinite(item.grams, `${label}.grams`, { min: 0 });
  if (item.displayName.trim() === '') throw invalid(`${label}.displayName must not be blank`);
  requireMaxLength(item.displayName, TEXT_LIMITS.name, `${label}.displayName`);
  const amounts: NutrientAmounts = { ...item.nutrients, kcal: item.kcal, protein: item.proteinG, carbs: item.carbsG, fat: item.fatG };
  nutrientEntries(amounts, `${label}.nutrients`);
  requireItemWithinLimits(item.grams, amounts, label);
}

/** Replaces the snapshot columns and nutrient rows of an item. */
function writeSnapshot(tx: AppTransaction, itemId: string, amounts: NutrientAmounts): void {
  const rows = nutrientEntries(amounts, 'nutrients')
    .filter(([code]) => !isHeadline(code))
    .map(([nutrientCode, amount]) => ({ mealItemId: itemId, nutrientCode, amount }));
  tx.delete(mealItemNutrient).where(eq(mealItemNutrient.mealItemId, itemId)).run();
  if (rows.length > 0) tx.insert(mealItemNutrient).values(rows).run();
}

const headline = (a: NutrientAmounts) => ({
  kcal: a.kcal ?? 0,
  proteinG: a.protein ?? 0,
  carbsG: a.carbs ?? 0,
  fatG: a.fat ?? 0,
});

/** Meals matching `where`, oldest first, with their items and nutrient snapshots. Shared with the backup repository. */
export function loadMeals(db: Pick<AppDatabase, 'select'>, where: SQL): MealWithItems[] {
  const meals = db
    .select()
    .from(meal)
    .where(where)
    .orderBy(asc(meal.eatenAt), asc(meal.createdAt), asc(meal.id))
    .all();
  if (meals.length === 0) return [];

  const items = db
    .select({ item: mealItem })
    .from(mealItem)
    .innerJoin(meal, eq(mealItem.mealId, meal.id))
    .where(where)
    .orderBy(asc(mealItem.mealId), asc(mealItem.position))
    .all();
  const nutrientRows = db
    .select({ itemId: mealItemNutrient.mealItemId, code: mealItemNutrient.nutrientCode, amount: mealItemNutrient.amount })
    .from(mealItemNutrient)
    .innerJoin(mealItem, eq(mealItemNutrient.mealItemId, mealItem.id))
    .innerJoin(meal, eq(mealItem.mealId, meal.id))
    .where(where)
    .all();

  const nutrientsByItem = new Map<string, NutrientAmounts>();
  for (const r of nutrientRows) {
    const amounts = nutrientsByItem.get(r.itemId) ?? {};
    amounts[r.code as keyof NutrientAmounts] = r.amount;
    nutrientsByItem.set(r.itemId, amounts);
  }
  const itemsByMeal = new Map<string, MealItem[]>();
  for (const { item } of items) {
    const list = itemsByMeal.get(item.mealId) ?? [];
    list.push({ ...item, nutrients: nutrientsByItem.get(item.id) ?? {} });
    itemsByMeal.set(item.mealId, list);
  }
  return meals.map((m) => ({ ...m, items: itemsByMeal.get(m.id) ?? [] }));
}

function queryTotals(db: Pick<AppDatabase, 'select'>, from: string, to: string): DayTotals[] {
  const inRange = and(gte(meal.localDate, from), lte(meal.localDate, to));
  const heads = db
    .select({
      localDate: meal.localDate,
      kcal: sql<number>`sum(${mealItem.kcal})`,
      protein: sql<number>`sum(${mealItem.proteinG})`,
      carbs: sql<number>`sum(${mealItem.carbsG})`,
      fat: sql<number>`sum(${mealItem.fatG})`,
    })
    .from(mealItem)
    .innerJoin(meal, eq(mealItem.mealId, meal.id))
    .where(inRange)
    .groupBy(meal.localDate)
    .orderBy(asc(meal.localDate))
    .all();
  const others = db
    .select({
      localDate: meal.localDate,
      code: mealItemNutrient.nutrientCode,
      amount: sql<number>`sum(${mealItemNutrient.amount})`,
    })
    .from(mealItemNutrient)
    .innerJoin(mealItem, eq(mealItemNutrient.mealItemId, mealItem.id))
    .innerJoin(meal, eq(mealItem.mealId, meal.id))
    .where(inRange)
    .groupBy(meal.localDate, mealItemNutrient.nutrientCode)
    .all();

  const byDate = new Map<string, NutrientAmounts>();
  for (const h of heads) {
    byDate.set(h.localDate, { kcal: Number(h.kcal), protein: Number(h.protein), carbs: Number(h.carbs), fat: Number(h.fat) });
  }
  for (const o of others) {
    const totals = byDate.get(o.localDate);
    if (totals) totals[o.code as keyof NutrientAmounts] = Number(o.amount);
  }
  return [...byDate].map(([localDate, totals]) => ({ localDate, totals }));
}

export function createMealRepository(
  { db, now, dayClock, newId }: RepositoryContext,
  resolveFood: FoodResolver,
): MealRepository {
  const loadMeal = (id: string): MealWithItems | null => loadMeals(db, eq(meal.id, id))[0] ?? null;

  const loadItemIn = (reader: Pick<AppDatabase, 'select'>, id: string): MealItem | null => {
    const row = reader.select().from(mealItem).where(eq(mealItem.id, id)).get();
    if (!row) return null;
    const nutrients: NutrientAmounts = {};
    for (const n of reader.select().from(mealItemNutrient).where(eq(mealItemNutrient.mealItemId, id)).all()) {
      nutrients[n.nutrientCode as keyof NutrientAmounts] = n.amount;
    }
    return { ...row, nutrients };
  };
  const loadItem = (id: string): MealItem | null => loadItemIn(db, id);

  return {
    async save(input) {
      if (input.items.length === 0) throw invalid('a meal needs at least one item');
      const { eatenAt, localDate } = deriveMealTime(input.eatenAt, input.timeZone);
      requireDayInBounds(localDate, 'localDate', dayClock());
      requireDayInBounds(eatenAt.slice(0, 10), 'eatenAt', dayClock());
      requireMaxLength(input.name, TEXT_LIMITS.mealName, 'name');
      requireMaxLength(input.note, TEXT_LIMITS.note, 'note');
      if (input.photoPath != null && !PHOTO_PATH_PATTERN.test(input.photoPath)) throw invalid(`photoPath must be photos/<name>.jpg, got "${input.photoPath}"`);
      input.items.forEach((item, i) => {
        requireFinite(item.grams, `items[${i}].grams`, { min: 0 });
        if (item.displayName.trim() === '') throw invalid(`items[${i}].displayName must not be blank`);
        requireMaxLength(item.displayName, TEXT_LIMITS.name, `items[${i}].displayName`);
        nutrientEntries(item.nutrients, `items[${i}].nutrients`);
        requireItemWithinLimits(item.grams, item.nutrients, `items[${i}]`);
      });

      const at = now().toISOString();
      const mealId = newId();
      db.transaction((tx) => {
        tx.insert(meal)
          .values({
            id: mealId,
            localDate,
            eatenAt,
            slot: input.slot,
            name: input.name ?? null,
            source: input.source,
            scanId: input.scanId ?? null,
            photoPath: input.photoPath ?? null,
            note: input.note ?? null,
            createdAt: at,
            updatedAt: at,
          })
          .run();
        input.items.forEach((item, position) => {
          const itemId = newId();
          tx.insert(mealItem)
            .values({
              id: itemId,
              mealId,
              position,
              displayName: item.displayName,
              grams: item.grams,
              foodSource: item.foodSource,
              foodRef: item.foodRef,
              origin: item.origin,
              confidenceFood: item.confidenceFood ?? null,
              confidencePortion: item.confidencePortion ?? null,
              ...headline(item.nutrients),
            })
            .run();
          writeSnapshot(tx, itemId, item.nutrients);
          if (item.foodRef !== null && (REF_FOOD_SOURCES as readonly string[]).includes(item.foodSource)) {
            upsertUsage(tx, { source: item.foodSource as 'catalog' | 'custom' | 'barcode', id: item.foodRef }, at, item.grams);
          }
        });
      });
      return loadMeal(mealId)!;
    },

    async photoPaths() {
      return db
        .selectDistinct({ path: meal.photoPath })
        .from(meal)
        .where(sql`${meal.photoPath} IS NOT NULL`)
        .all()
        .map((r) => r.path!);
    },

    async getMeal(id) {
      return loadMeal(id);
    },

    async listIds() {
      return db
        .select({ id: meal.id })
        .from(meal)
        .orderBy(asc(meal.eatenAt), asc(meal.createdAt), asc(meal.id))
        .all()
        .map((r) => r.id);
    },

    async getDay(localDate) {
      requireLocalDate(localDate, 'localDate');
      return {
        localDate,
        meals: loadMeals(db, eq(meal.localDate, localDate)),
        totals: queryTotals(db, localDate, localDate)[0]?.totals ?? { ...ZERO_HEADLINE },
      };
    },

    async dayTotals(localDate) {
      requireLocalDate(localDate, 'localDate');
      return queryTotals(db, localDate, localDate)[0]?.totals ?? { ...ZERO_HEADLINE };
    },

    async totalsByDay(from, to) {
      requireLocalDate(from, 'from');
      requireLocalDate(to, 'to');
      return queryTotals(db, from, to);
    },

    async updateMeal(id, patch) {
      db.transaction((tx) => {
        if (!tx.select({ id: meal.id }).from(meal).where(eq(meal.id, id)).get()) {
          throw new DataError('not_found', `meal not found: ${id}`);
        }
        const set: Partial<typeof meal.$inferInsert> = { updatedAt: now().toISOString() };
        if (patch.slot !== undefined) set.slot = patch.slot;
        if (patch.name !== undefined) set.name = patch.name;
        if (patch.note !== undefined) set.note = patch.note;
        tx.update(meal).set(set).where(eq(meal.id, id)).run();
      });
      return loadMeal(id)!;
    },

    async updateItemGrams(itemId, grams) {
      requireFinite(grams, 'grams', { min: 0 });
      const current = loadItem(itemId);
      if (!current) throw new DataError('not_found', `meal item not found: ${itemId}`);

      // Resolve the source food before the (synchronous) transaction.
      let amounts: NutrientAmounts | null = null;
      if (current.foodSource !== 'ai_estimate' && current.foodRef !== null) {
        const food = await resolveFood({ source: current.foodSource, id: current.foodRef });
        if (food) amounts = computeItemNutrients(food, grams);
      }
      if (!amounts) {
        // No source food: scale the stored snapshot by the change in grams.
        if (current.grams === 0 && grams !== 0) {
          throw invalid('an item stored with 0 g and without a source food cannot be rescaled');
        }
        const factor = current.grams === 0 ? 0 : grams / current.grams;
        amounts = {
          kcal: current.kcal * factor,
          protein: current.proteinG * factor,
          carbs: current.carbsG * factor,
          fat: current.fatG * factor,
        };
        for (const [code, value] of Object.entries(current.nutrients)) {
          amounts[code as keyof NutrientAmounts] = value * factor;
        }
      }
      const snapshot = amounts;
      requireItemWithinLimits(grams, snapshot, 'item');

      db.transaction((tx) => {
        const row = tx.select().from(mealItem).where(eq(mealItem.id, itemId)).get();
        if (!row) throw new DataError('not_found', `meal item not found: ${itemId}`);
        tx.update(mealItem)
          .set({
            grams,
            origin: row.origin === 'ai' && grams !== row.grams ? 'ai_edited' : row.origin,
            ...headline(snapshot),
          })
          .where(eq(mealItem.id, itemId))
          .run();
        writeSnapshot(tx, itemId, snapshot);
        tx.update(meal).set({ updatedAt: now().toISOString() }).where(eq(meal.id, row.mealId)).run();
      });
      return loadItem(itemId)!;
    },

    async deleteItem(itemId) {
      return db.transaction((tx) => {
        const removed = tx
          .delete(mealItem)
          .where(eq(mealItem.id, itemId))
          .returning({ mealId: mealItem.mealId })
          .all();
        if (removed.length === 0) throw new DataError('not_found', `meal item not found: ${itemId}`);
        tx.update(meal).set({ updatedAt: now().toISOString() }).where(eq(meal.id, removed[0]!.mealId)).run();
        return removed[0]!.mealId;
      });
    },

    async restoreItem(item) {
      requireRestorableItem(item, 'item');
      return db.transaction((tx) => {
        if (!tx.select({ id: meal.id }).from(meal).where(eq(meal.id, item.mealId)).get()) {
          throw new DataError('not_found', `meal not found: ${item.mealId}`);
        }
        if (tx.select({ id: mealItem.id }).from(mealItem).where(eq(mealItem.id, item.id)).get()) {
          throw invalid(`item ${item.id} is already in the meal`);
        }
        if (tx.select({ id: mealItem.id }).from(mealItem).where(and(eq(mealItem.mealId, item.mealId), eq(mealItem.position, item.position))).get()) {
          throw invalid(`position ${item.position} of the meal is taken by another item`);
        }
        tx.insert(mealItem).values(itemColumns(item)).run();
        writeSnapshot(tx, item.id, { ...item.nutrients, kcal: item.kcal, protein: item.proteinG, carbs: item.carbsG, fat: item.fatG });
        tx.update(meal).set({ updatedAt: now().toISOString() }).where(eq(meal.id, item.mealId)).run();
        return loadItemIn(tx, item.id)!;
      });
    },

    async restoreMeal(saved) {
      if (saved.items.length === 0) throw invalid('a meal needs at least one item');
      requireMaxLength(saved.name, TEXT_LIMITS.mealName, 'name');
      requireMaxLength(saved.note, TEXT_LIMITS.note, 'note');
      requireLocalDate(saved.localDate, 'localDate');
      // Restoring a row that existed (Undo) is not an entry: its stored date is what it was, even when that is out of range, or the meal and its photo would be lost.
      if (saved.photoPath != null && !PHOTO_PATH_PATTERN.test(saved.photoPath)) throw invalid(`photoPath must be photos/<name>.jpg, got "${saved.photoPath}"`);
      saved.items.forEach((item, i) => {
        if (item.mealId !== saved.id) throw invalid(`items[${i}] belongs to another meal`);
        requireRestorableItem(item, `items[${i}]`);
      });
      db.transaction((tx) => {
        if (tx.select({ id: meal.id }).from(meal).where(eq(meal.id, saved.id)).get()) throw invalid(`meal ${saved.id} already exists`);
        const { items, ...row } = saved;
        tx.insert(meal).values(row).run();
        for (const item of items) {
          tx.insert(mealItem).values(itemColumns(item)).run();
          writeSnapshot(tx, item.id, { ...item.nutrients, kcal: item.kcal, protein: item.proteinG, carbs: item.carbsG, fat: item.fatG });
        }
      });
      return loadMeal(saved.id)!;
    },

    async deleteMeal(mealId) {
      const removed = db.delete(meal).where(eq(meal.id, mealId)).returning({ id: meal.id }).all();
      if (removed.length === 0) throw new DataError('not_found', `meal not found: ${mealId}`);
    },
  };
}

