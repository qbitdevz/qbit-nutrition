/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import type { CatalogDb, MatchMemory, SqlRow, SqlValue } from '../../src/core/catalog/ports';
import type { FoodRef } from '../../src/core/catalog/types';

/** Node implementation of the `CatalogDb` port over a read-only `catalog.db`. */
export class NodeSqliteCatalogDb implements CatalogDb {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file, { readOnly: true });
  }

  async all(sql: string, params: readonly SqlValue[] = []): Promise<SqlRow[]> {
    const rows = this.db.prepare(sql).all(...params);
    // node:sqlite returns null-prototype row objects; hand out plain ones.
    return rows.map((r) => ({ ...r }) as SqlRow);
  }

  close(): void {
    this.db.close();
  }
}

/** In-memory `MatchMemory` for tests and the benchmark; the app uses `match_memory` in app.db. */
export class InMemoryMatchMemory implements MatchMemory {
  private readonly map = new Map<string, FoodRef>();

  async get(normalizedName: string): Promise<FoodRef | null> {
    return this.map.get(normalizedName) ?? null;
  }

  async remember(normalizedName: string, ref: FoodRef): Promise<void> {
    this.map.set(normalizedName, ref);
  }
}
