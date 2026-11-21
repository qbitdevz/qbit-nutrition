import { asc, sql } from 'drizzle-orm';
import type { AppTransaction } from '../database';
import {
  aiProvider,
  barcodeProduct,
  bodyMeasurement,
  customFood,
  foodUsage,
  goal,
  matchMemory,
  meal,
  mealItem,
  mealItemNutrient,
  profile,
  scan,
  setting,
} from '../schema';
import type { AiProvider } from './aiProviders';
import { toCustomFood, type CustomFood } from './customFoods';
import type { FoodUsageEntry } from './foodUsage';
import type { Goal } from './goals';
import type { MatchMemoryEntry } from './matchMemory';
import { loadMeals, type MealWithItems } from './meals';
import type { Measurement } from './measurements';
import type { Profile } from './profile';
import type { RepositoryContext } from './shared';

/**
 * Everything the user created, as the repositories return it (docs/08 section 9). It deliberately has no `scan`
 * rows (diagnostic data), no `barcode_product` rows (a cache of lookups) and no API keys (those are in secure
 * storage, and a provider profile has no key field).
 */
export interface BackupSnapshot {
  profile: Profile | null;
  goals: Goal[];
  measurements: Measurement[];
  /** With their items and nutrient snapshots. `scanId` is ignored when writing: scans are not part of a snapshot. */
  meals: MealWithItems[];
  customFoods: CustomFood[];
  foodUsage: FoodUsageEntry[];
  matchMemory: MatchMemoryEntry[];
  aiProviders: AiProvider[];
  settings: Record<string, string>;
}

export interface BackupRepository {
  /** All of it, read in one transaction so the pieces belong together. */
  read(): Promise<BackupSnapshot>;
  /**
   * Makes the database hold exactly `snapshot`: everything that was there is removed (scans and the barcode cache
   * too) and the snapshot is written, in ONE transaction. If anything fails the transaction rolls back and the
   * previous data is untouched.
   */
  replaceAll(snapshot: BackupSnapshot): Promise<void>;
  /** Removes every row of every table (migration bookkeeping stays), in one transaction. */
  deleteAll(): Promise<void>;
}

/** Rows per INSERT, so a statement stays far below SQLite's variable limit whatever the history size. */
const CHUNK = 40;

function insertChunks<T>(rows: readonly T[], write: (chunk: T[]) => void): void {
  for (let i = 0; i < rows.length; i += CHUNK) write(rows.slice(i, i + CHUNK));
}

/** Children before parents, so foreign keys never block a delete (the cascade would do it anyway). */
function wipe(tx: AppTransaction): void {
  tx.delete(mealItemNutrient).run();
  tx.delete(mealItem).run();
  tx.delete(meal).run();
  tx.delete(scan).run();
  tx.delete(aiProvider).run();
  tx.delete(foodUsage).run();
  tx.delete(matchMemory).run();
  tx.delete(customFood).run();
  tx.delete(barcodeProduct).run();
  tx.delete(bodyMeasurement).run();
  tx.delete(goal).run();
  tx.delete(profile).run();
  tx.delete(setting).run();
}

export function createBackupRepository({ db }: RepositoryContext): BackupRepository {
  return {
    async read() {
      return db.transaction((tx) => ({
        profile: tx.select().from(profile).limit(1).get() ?? null,
        goals: tx
          .select()
          .from(goal)
          .orderBy(asc(goal.startDate))
          .all()
          .map((g) => ({ ...g, isCustom: g.isCustom === 1 })),
        measurements: tx.select().from(bodyMeasurement).orderBy(asc(bodyMeasurement.measuredOn), asc(bodyMeasurement.kind), asc(bodyMeasurement.source)).all(),
        meals: loadMeals(tx, sql`1 = 1`),
        customFoods: tx.select().from(customFood).orderBy(asc(customFood.id)).all().map(toCustomFood),
        foodUsage: tx
          .select()
          .from(foodUsage)
          .orderBy(asc(foodUsage.foodSource), asc(foodUsage.foodRef))
          .all()
          .map((u) => ({ ...u, isFavorite: u.isFavorite === 1 })),
        matchMemory: tx
          .select()
          .from(matchMemory)
          .orderBy(asc(matchMemory.detectedNameNormalized))
          .all()
          .map((m) => ({ name: m.detectedNameNormalized, ref: { source: m.foodSource, id: m.foodRef }, timesConfirmed: m.timesConfirmed, updatedAt: m.updatedAt })),
        aiProviders: tx
          .select()
          .from(aiProvider)
          .orderBy(asc(aiProvider.id))
          .all()
          .map((p) => ({ ...p, isActive: p.isActive === 1 })),
        settings: Object.fromEntries(tx.select().from(setting).orderBy(asc(setting.key)).all().map((r) => [r.key, r.value])),
      }));
    },

    async replaceAll(snapshot) {
      db.transaction((tx) => {
        wipe(tx);

        if (snapshot.profile) tx.insert(profile).values(snapshot.profile).run();
        insertChunks(snapshot.goals, (rows) => tx.insert(goal).values(rows.map((g) => ({ ...g, isCustom: g.isCustom ? 1 : 0 }))).run());
        insertChunks(snapshot.measurements, (rows) => tx.insert(bodyMeasurement).values(rows).run());
        insertChunks(snapshot.aiProviders, (rows) => tx.insert(aiProvider).values(rows.map((p) => ({ ...p, isActive: p.isActive ? 1 : 0 }))).run());
        insertChunks(snapshot.customFoods, (rows) =>
          tx
            .insert(customFood)
            .values(
              rows.map((f) => ({
                id: f.id,
                name: f.name,
                kcal100g: f.kcal100g,
                protein100g: f.protein100g,
                carbs100g: f.carbs100g,
                fat100g: f.fat100g,
                otherNutrientsJson: f.otherNutrients && Object.keys(f.otherNutrients).length > 0 ? JSON.stringify(f.otherNutrients) : null,
                defaultPortionG: f.defaultPortionG,
              })),
            )
            .run(),
        );

        insertChunks(snapshot.meals, (rows) =>
          tx
            .insert(meal)
            .values(
              rows.map((m) => ({
                id: m.id,
                localDate: m.localDate,
                eatenAt: m.eatenAt,
                slot: m.slot,
                name: m.name,
                source: m.source,
                scanId: null,
                photoPath: m.photoPath,
                note: m.note,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
              })),
            )
            .run(),
        );
        const items = snapshot.meals.flatMap((m) => m.items);
        insertChunks(items, (rows) =>
          tx
            .insert(mealItem)
            .values(
              rows.map((i) => ({
                id: i.id,
                mealId: i.mealId,
                position: i.position,
                displayName: i.displayName,
                grams: i.grams,
                foodSource: i.foodSource,
                foodRef: i.foodRef,
                origin: i.origin,
                confidenceFood: i.confidenceFood,
                confidencePortion: i.confidencePortion,
                kcal: i.kcal,
                proteinG: i.proteinG,
                carbsG: i.carbsG,
                fatG: i.fatG,
              })),
            )
            .run(),
        );
        const nutrients = items.flatMap((i) => Object.entries(i.nutrients).map(([nutrientCode, amount]) => ({ mealItemId: i.id, nutrientCode, amount: amount as number })));
        insertChunks(nutrients, (rows) => tx.insert(mealItemNutrient).values(rows).run());

        insertChunks(snapshot.foodUsage, (rows) => tx.insert(foodUsage).values(rows.map((u) => ({ ...u, isFavorite: u.isFavorite ? 1 : 0 }))).run());
        insertChunks(snapshot.matchMemory, (rows) =>
          tx
            .insert(matchMemory)
            .values(rows.map((m) => ({ detectedNameNormalized: m.name, foodSource: m.ref.source, foodRef: m.ref.id, timesConfirmed: m.timesConfirmed, updatedAt: m.updatedAt })))
            .run(),
        );
        // The settings go last: nothing above depends on them.
        insertChunks(Object.entries(snapshot.settings), (rows) => tx.insert(setting).values(rows.map(([key, value]) => ({ key, value }))).run());
      });
    },

    async deleteAll() {
      db.transaction((tx) => wipe(tx));
    },
  };
}
