import { eq } from 'drizzle-orm';
import type { FoodRef, MatchMemory } from '../../core/catalog';
import { matchMemory } from '../schema';
import { invalid, type RepositoryContext } from './shared';

export interface MatchMemoryEntry {
  /** Detected name normalized with core's `normalizeName`. */
  name: string;
  ref: FoodRef;
  timesConfirmed: number;
  updatedAt: string;
}

/** `match_memory` in app.db, implementing core's `MatchMemory` port. */
export interface MatchMemoryRepository extends MatchMemory {
  getEntry(normalizedName: string): Promise<MatchMemoryEntry | null>;
}

export function createMatchMemoryRepository({
  db,
  now,
}: Pick<RepositoryContext, 'db' | 'now'>): MatchMemoryRepository {
  const toEntry = (row: typeof matchMemory.$inferSelect): MatchMemoryEntry => ({
    name: row.detectedNameNormalized,
    ref: { source: row.foodSource, id: row.foodRef },
    timesConfirmed: row.timesConfirmed,
    updatedAt: row.updatedAt,
  });

  return {
    async get(normalizedName) {
      const row = db.select().from(matchMemory).where(eq(matchMemory.detectedNameNormalized, normalizedName)).get();
      return row ? toEntry(row).ref : null;
    },

    async getEntry(normalizedName) {
      const row = db.select().from(matchMemory).where(eq(matchMemory.detectedNameNormalized, normalizedName)).get();
      return row ? toEntry(row) : null;
    },

    async remember(normalizedName, ref) {
      if (normalizedName.trim() === '') throw invalid('a remembered name must not be blank');
      const at = now().toISOString();
      db.transaction((tx) => {
        const existing = tx.select().from(matchMemory).where(eq(matchMemory.detectedNameNormalized, normalizedName)).get();
        if (!existing) {
          tx.insert(matchMemory)
            .values({ detectedNameNormalized: normalizedName, foodSource: ref.source, foodRef: ref.id, timesConfirmed: 1, updatedAt: at })
            .run();
          return;
        }
        const same = existing.foodSource === ref.source && existing.foodRef === ref.id;
        tx.update(matchMemory)
          .set({ foodSource: ref.source, foodRef: ref.id, timesConfirmed: same ? existing.timesConfirmed + 1 : 1, updatedAt: at })
          .where(eq(matchMemory.detectedNameNormalized, normalizedName))
          .run();
      });
    },
  };
}
