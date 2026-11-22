/// <reference types="node" />
/**
 * Test-only: a migrated in-memory `app.db` with every repository, a controllable clock, and the
 * fixture catalog behind the core `CatalogDb` port. Never import this from app code.
 */
import { DatabaseSync } from 'node:sqlite';
import { buildFixtureCatalog } from '../../../scripts/catalog/testing/fixture';
import { createCatalog, type Catalog, type SqlRow } from '../../core/catalog';
import { createSqliteCatalogDb, type CatalogSqlClient } from '../catalog/sqliteCatalogDb';
import { initializeDatabase } from '../database';
import { createMatchMemoryRepository } from '../repositories/matchMemory';
import { createRepositories, type Repositories } from '../repositories';
import { openNodeDatabase, type NodeAppDatabase } from './nodeDatabase';

/** `CatalogSqlClient` over a read-only `node:sqlite` handle (what expo-sqlite is in the app). */
export function nodeCatalogClient(file: string): CatalogSqlClient & { close(): void } {
  const handle = new DatabaseSync(file, { readOnly: true });
  return {
    async getAllAsync(sql, params) {
      return handle
        .prepare(sql)
        .all(...params)
        .map((row) => ({ ...row }) as SqlRow);
    },
    close: () => handle.close(),
  };
}

let fixtureFile: string | undefined;
/** The fixture catalog is built once per Jest worker. */
export function fixtureCatalogFile(): string {
  fixtureFile ??= buildFixtureCatalog().dbPath;
  return fixtureFile;
}

export interface Harness extends NodeAppDatabase {
  repos: Repositories;
  catalog: Catalog;
  /** Moves the clock the repositories read. */
  setNow(iso: string): void;
  /** Moves the device clock that dates are bounded against (default: the real clock, which is what the screens under test read). */
  setDayClock(iso: string): void;
}

export async function createHarness(options: { file?: string } = {}): Promise<Harness> {
  const node = openNodeDatabase(options.file);
  await initializeDatabase(node.db);

  let now = new Date('2026-06-15T12:00:00.000Z');
  const clock = () => new Date(now);
  let dayNow: Date | null = null;
  const dayClock = () => (dayNow ? new Date(dayNow) : new Date());

  const catalogClient = nodeCatalogClient(fixtureCatalogFile());
  const memory = createMatchMemoryRepository({ db: node.db, now: clock });
  const catalog = createCatalog({ db: createSqliteCatalogDb(catalogClient), memory });
  const repos = createRepositories({ db: node.db, catalog, now: clock, dayClock });

  return {
    ...node,
    close() {
      catalogClient.close();
      node.close();
    },
    repos,
    catalog,
    setNow(iso) {
      now = new Date(iso);
    },
    setDayClock(iso) {
      dayNow = new Date(iso);
    },
  };
}
