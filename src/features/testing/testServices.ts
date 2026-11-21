/// <reference types="node" />
/**
 * Test-only: services for the screen tests. Repositories come from the Node database harness; the
 * catalog is the fixture catalog plus Spanish names for the chicken entries (the shared fixture has
 * none), built once per Jest worker with the real catalog builder. Never import this from app code.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCatalog } from '@/core/catalog';
import { createSqliteCatalogDb } from '@/data/catalog/sqliteCatalogDb';
import { nodeCatalogClient, type Harness } from '@/data/testing/harness';
import { buildCatalog } from '../../../scripts/catalog/builder';
import { FIXTURE_FOODS, FIXTURE_TRANSLATIONS } from '../../../scripts/catalog/testing/fixture';
import type { AppServices } from '../startup/types';

let file: string | undefined;

function catalogFile(): string {
  if (!file) {
    const dir = mkdtempSync(path.join(tmpdir(), 'qn-screens-'));
    file = path.join(dir, 'catalog.db');
    buildCatalog({
      foods: FIXTURE_FOODS,
      translations: [
        ...FIXTURE_TRANSLATIONS,
        { en: 'Chicken, breast, meat only, cooked, grilled', es: 'Pollo, pechuga, a la plancha', aliases: ['pechuga de pollo'] },
        { en: 'Chicken, breast, meat only, raw', es: 'Pollo, pechuga, crudo' },
      ],
      outPath: file,
      meta: { dataVersion: 'screens@1', buildDate: '2026-01-01T00:00:00.000Z', sourceFiles: ['fixture'] },
    });
  }
  return file;
}

/** The harness repositories with the screen-test catalog. Call `close()` on the returned handle after the test. */
export function createTestServices(h: Harness): AppServices & { close(): void } {
  const client = nodeCatalogClient(catalogFile());
  const catalog = createCatalog({ db: createSqliteCatalogDb(client), memory: h.repos.matchMemory });
  return { repos: h.repos, catalog, close: () => client.close() };
}
