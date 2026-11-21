import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { FoodRef } from '../../core/catalog';
import type { AppTransaction } from '../database';
import { foodUsage } from '../schema';
import { requireFinite, type RepositoryContext } from './shared';

type UsageRow = typeof foodUsage.$inferSelect;

export interface FoodUsageEntry extends Omit<UsageRow, 'isFavorite'> {
  isFavorite: boolean;
}

export interface FoodUsageRepository {
  /** Counts one use of a food (recents). Keeps the favorite flag. */
  recordUse(ref: FoodRef, grams?: number | null): Promise<void>;
  setFavorite(ref: FoodRef, isFavorite: boolean): Promise<void>;
  /** Most recently used first; foods only marked as favorite and never used are not included. */
  recents(limit: number): Promise<FoodUsageEntry[]>;
  /** Most recently used first. */
  favorites(): Promise<FoodUsageEntry[]>;
}

const toEntry = (row: UsageRow): FoodUsageEntry => ({ ...row, isFavorite: row.isFavorite === 1 });

/** Shared with `MealRepository.save`, which records usage inside its own transaction. */
export function upsertUsage(
  tx: Pick<AppTransaction, 'insert'>,
  ref: FoodRef,
  at: string,
  grams: number | null,
): void {
  tx.insert(foodUsage)
    .values({ foodSource: ref.source, foodRef: ref.id, lastUsedAt: at, useCount: 1, isFavorite: 0, lastGrams: grams })
    .onConflictDoUpdate({
      target: [foodUsage.foodSource, foodUsage.foodRef],
      set: { lastUsedAt: at, useCount: sql`${foodUsage.useCount} + 1`, lastGrams: grams },
    })
    .run();
}

export function createFoodUsageRepository({ db, now }: RepositoryContext): FoodUsageRepository {
  return {
    async recordUse(ref, grams = null) {
      if (grams != null) requireFinite(grams, 'grams', { min: 0 });
      upsertUsage(db, ref, now().toISOString(), grams);
    },

    async setFavorite(ref, isFavorite) {
      const flag = isFavorite ? 1 : 0;
      db.insert(foodUsage)
        .values({
          foodSource: ref.source,
          foodRef: ref.id,
          lastUsedAt: now().toISOString(),
          useCount: 0,
          isFavorite: flag,
          lastGrams: null,
        })
        .onConflictDoUpdate({ target: [foodUsage.foodSource, foodUsage.foodRef], set: { isFavorite: flag } })
        .run();
    },

    async recents(limit) {
      return db
        .select()
        .from(foodUsage)
        .where(gt(foodUsage.useCount, 0))
        .orderBy(desc(foodUsage.lastUsedAt))
        .limit(Math.max(0, limit))
        .all()
        .map(toEntry);
    },

    async favorites() {
      return db
        .select()
        .from(foodUsage)
        .where(and(eq(foodUsage.isFavorite, 1)))
        .orderBy(desc(foodUsage.lastUsedAt))
        .all()
        .map(toEntry);
    },
  };
}
