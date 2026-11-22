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
import type { FetchLike } from '@/core/ai/types';
import { createMemorySecretStore } from '@/platform/memorySecretStore';
import type { SecretStore } from '@/platform/secretStore';
import { offlineFetch } from './offline';
import { createAiServices } from '../startup/aiServices';
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

/**
 * The harness repositories with the screen-test catalog, an in-memory secret store, and a fake fetch
 * (offline unless the test passes one; never a real provider). Call `close()` after the test.
 */
export function createTestServices(
  h: Harness,
  options: { fetch?: FetchLike } = {},
): AppServices & { close(): void; secrets: SecretStore } {
  const client = nodeCatalogClient(catalogFile());
  const catalog = createCatalog({ db: createSqliteCatalogDb(client), memory: h.repos.matchMemory });
  const secrets = createMemorySecretStore();
  const ai = createAiServices({ repos: h.repos, secrets, fetch: options.fetch ?? offlineFetch, retryDelayMs: 0 });
  return { repos: h.repos, catalog, ...ai, secrets, close: () => client.close() };
}
