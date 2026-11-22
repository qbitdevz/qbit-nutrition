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
import { resolveRecipes } from '../../../scripts/catalog/recipes';
import { FIXTURE_FACTORS, FIXTURE_FOODS, FIXTURE_RECIPE, FIXTURE_TRANSLATIONS } from '../../../scripts/catalog/testing/fixture';
import type { FetchLike } from '@/core/ai/types';
import { createMemorySecretStore } from '@/platform/memorySecretStore';
import type { SecretStore } from '@/platform/secretStore';
import { offlineFetch } from './offline';
import { withImportedMatching } from '../foodimport/importedMatch';
import { createBarcodeClient } from '../barcode/barcodeClient';
import { createBarcodeService } from '../barcode/barcodeService';
import { createInactiveHealthSync } from '../health/healthSync';
import { createAiServices } from '../startup/aiServices';
import type { AppServices } from '../startup/types';

const files: { plain?: string; recipes?: string } = {};

/** The screen-test catalog; `withRecipes` adds the fixture recipe-calculated dish (see scripts/catalog/testing/fixture.ts). */
function catalogFile(withRecipes: boolean): string {
  const kind = withRecipes ? 'recipes' : 'plain';
  if (!files[kind]) {
    const dir = mkdtempSync(path.join(tmpdir(), 'qn-screens-'));
    const file = path.join(dir, 'catalog.db');
    files[kind] = file;
    buildCatalog({
      ...(withRecipes ? { recipes: resolveRecipes([FIXTURE_RECIPE], FIXTURE_FOODS, FIXTURE_FACTORS, 'fixture-recipes@1'), recipeSetVersion: 'fixture-recipes@1' } : {}),
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
  return files[kind] as string;
}

/**
 * The harness repositories with the screen-test catalog, an in-memory secret store, and a fake fetch
 * (offline unless the test passes one; never a real provider). Call `close()` after the test.
 */
export function createTestServices(
  h: Harness,
  options: { fetch?: FetchLike; /** What Open Food Facts lookups use; offline unless the test gives one. */ barcodeFetch?: FetchLike; /** Add the recipe-calculated fixture dish to the catalog. */ recipes?: boolean } = {},
): AppServices & { close(): void; secrets: SecretStore } {
  const client = nodeCatalogClient(catalogFile(options.recipes === true));
  const catalog = withImportedMatching(createCatalog({ db: createSqliteCatalogDb(client), memory: h.repos.matchMemory }), h.repos.importedFoods);
  const secrets = createMemorySecretStore();
  const ai = createAiServices({ repos: h.repos, secrets, fetch: options.fetch ?? offlineFetch, retryDelayMs: 0 });
  const barcode = createBarcodeService({
    repos: h.repos,
    client: createBarcodeClient({ fetch: options.barcodeFetch ?? offlineFetch, userAgent: 'QbitNutrition/test (https://example.test)', timeoutMs: 1000 }),
  });
  return { repos: h.repos, catalog, ...ai, barcode, health: createInactiveHealthSync(), secrets, close: () => client.close() };
}
