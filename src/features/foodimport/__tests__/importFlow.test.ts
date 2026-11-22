/** @jest-environment node */
import { sql } from 'drizzle-orm';

import { createHarness, type Harness } from '@/data/testing/harness';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { dumpAll } from '../../testing/backupDump';
import { createTestServices } from '../../testing/testServices';
import { searchFoods } from '../../logging/foods';
import { buildPreview } from '../mapping';
import { suggestMapping } from '../headers';
import { commitImport, defaultTableName, pickTableFile, ImportCommitError } from '../importService';
import { READ_LIMITS } from '../readFile';
import { SPANISH_CSV, latin1, makeWorkbook, utf8 } from '../testing/synthetic';

let h: Harness;
let platform: FakeDataPlatform;
beforeEach(async () => {
  h = await createHarness();
  platform = createFakeDataPlatform();
});
afterEach(() => h.close());

const prepare = async (bytes: Uint8Array, name: string) => {
  platform.state.nextPick = { name, bytes };
  const picked = await pickTableFile(platform);
  if (picked.kind !== 'ok') throw new Error('expected a file');
  const { mapping } = suggestMapping(picked.file, 0);
  return { file: picked.file, mapping, preview: buildPreview(picked.file, mapping) };
};

describe('picking a file', () => {
  it('reads the picked file and removes the copy the picker made', async () => {
    const { file } = await prepare(utf8(SPANISH_CSV), 'Mi tabla.csv');
    expect(file.fileName).toBe('Mi tabla.csv');
    expect([...platform.state.cache.keys()]).toEqual([]);
  });

  it('returns cancelled when the person closes the picker', async () => {
    platform.state.nextPick = null;
    expect(await pickTableFile(platform)).toEqual({ kind: 'cancelled' });
  });

  it('refuses a file over the limit before reading it, naming the limit', async () => {
    platform.state.nextPick = { name: 'enorme.csv', bytes: new Uint8Array(READ_LIMITS.maxFileBytes + 1) };
    expect(await pickTableFile(platform)).toEqual({ kind: 'refused', code: 'too_large', limit: READ_LIMITS.maxFileBytes });
    expect(platform.state.readCount).toBe(0);
    expect([...platform.state.cache.keys()]).toEqual([]);
  });

  it('refuses by the size the file turns out to have when the picker reports none', async () => {
    platform.state.reportSize = false;
    platform.state.nextPick = { name: 'enorme.csv', bytes: new Uint8Array(READ_LIMITS.maxFileBytes + 1) };
    expect(await pickTableFile(platform)).toMatchObject({ kind: 'refused', code: 'too_large' });
  });

  it('reports a file that cannot be read as a refusal with its reason', async () => {
    platform.state.nextPick = { name: 'tabla.pdf', bytes: utf8('%PDF-1.7') };
    expect(await pickTableFile(platform)).toMatchObject({ kind: 'refused', code: 'unsupported' });
  });

  it('names a default table after the file', () => {
    expect(defaultTableName('Mi tabla inventada.xlsx')).toBe('Mi tabla inventada');
    expect(defaultTableName('C:\\x\\y\\datos.v2.csv')).toBe('datos.v2');
  });
});

describe('importing: the file to the phone (S1, S4)', () => {
  it('stores the foods exactly as the file has them, whatever the format', async () => {
    const rows = [
      ['Alimento', 'Grupo', 'Energía (kcal)', 'Proteínas (g)', 'Sodio (mg)'],
      ['Pera inventada', 'Frutas', 57.25, 0.36, 1],
      ['Higo de ejemplo', 'Frutas', 74.1, 'tr', 'nd'],
      ['Aceite ficticio', 'Grasas', 884.0000000000001, 0, 0],
    ];
    const bytes = [
      ['csv', utf8(rows.map((r) => r.map((c) => String(c).replace('.', ',')).join(';')).join('\n')), 'a.csv'],
      ['latin1', latin1(rows.map((r) => r.map((c) => String(c).replace('.', ',')).join(';')).join('\n')), 'a.csv'],
      ['xlsx', makeWorkbook([{ name: 'Hoja1', rows }], 'xlsx'), 'a.xlsx'],
      ['xls', makeWorkbook([{ name: 'Hoja1', rows }], 'xls'), 'a.xls'],
    ] as const;
    for (const [label, data, name] of bytes) {
      const harness = await createHarness();
      try {
        platform.state.nextPick = { name, bytes: data };
        const picked = await pickTableFile(platform);
        if (picked.kind !== 'ok') throw new Error(`${label}: not read`);
        const { mapping } = suggestMapping(picked.file, 0);
        const preview = buildPreview(picked.file, mapping);
        const created = await commitImport(harness.repos, { preview, name: 'Tabla', fileName: name, presetId: null });
        expect(created.foodCount).toBe(3);
        const stored = await harness.repos.importedFoods.search('pera', 5);
        // A float with 16 digits comes back the same: no rounding, no estimation.
        expect(stored[0]!.per100g).toEqual({ kcal: 57.25, protein: 0.36, sodium: 1 });
        expect((await harness.repos.importedFoods.search('higo', 5))[0]!.per100g).toEqual({ kcal: 74.1 });
        expect((await harness.repos.importedFoods.search('aceite', 5))[0]!.per100g).toEqual({ kcal: 884.0000000000001, protein: 0, sodium: 0 });
      } finally {
        harness.close();
      }
    }
  });

  it('refuses to import what the preview blocks', async () => {
    const { preview } = await prepare(utf8('Alimento;Notas\nA;b'), 'x.csv');
    await expect(commitImport(h.repos, { preview, name: 'X', fileName: 'x.csv', presetId: null })).rejects.toBeInstanceOf(ImportCommitError);
    expect(await h.repos.importedFoods.listCollections()).toEqual([]);
  });

  it('is all or nothing: a failure midway leaves the whole database as it was', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Ya estaba' }, [{ name: 'Manzana', per100g: { kcal: 52 } }]);
    const before = dumpAll(h);
    // A database that fails while the index of the third food is written.
    h.db.run(sql.raw(`CREATE TRIGGER fail_midway BEFORE INSERT ON imported_food_token WHEN NEW.term = 'bomba' BEGIN SELECT RAISE(ABORT, 'disk full'); END`));
    const csv = ['Alimento;Energía (kcal)', 'Uno;1', 'Dos;2', 'Bomba;3', 'Cuatro;4'].join('\n');
    const { preview } = await prepare(utf8(csv), 'x.csv');
    expect(preview.counts.foods).toBe(4);
    const withTrigger = dumpAll(h);
    await expect(commitImport(h.repos, { preview, name: 'Nueva', fileName: 'x.csv', presetId: null })).rejects.toBeInstanceOf(ImportCommitError);
    expect(dumpAll(h)).toEqual(withTrigger);
    expect(Object.keys(before)).toEqual(Object.keys(dumpAll(h)));
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });

  it('flags a per 100 ml table on the collection and keeps the foods usable', async () => {
    const csv = ['Bebida;Energía (kcal/100 ml)', 'Jugo inventado;45'].join('\n');
    const { preview, mapping } = await prepare(utf8(csv), 'bebidas.csv');
    expect(mapping.basis).toBe('ml100');
    const created = await commitImport(h.repos, { preview, name: 'Bebidas', fileName: 'bebidas.csv', presetId: null });
    expect(created.basis).toBe('ml');
  });

  it('makes no network request, from picking to searching', async () => {
    const calls: unknown[] = [];
    const original = globalThis.fetch;
    const originalXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    globalThis.fetch = ((...args: unknown[]) => {
      calls.push(args);
      throw new Error('no network in an import');
    }) as typeof fetch;
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = function XhrGuard() {
      calls.push('xhr');
      throw new Error('no network in an import');
    };
    const services = createTestServices(h);
    try {
      for (const [bytes, name] of [
        [utf8(SPANISH_CSV), 'a.csv'],
        [makeWorkbook([{ name: 'S', rows: [['Alimento', 'Energía (kcal)'], ['Pera inventada', 57]] }], 'xlsx'), 'b.xlsx'],
        [makeWorkbook([{ name: 'S', rows: [['Alimento', 'Energía (kcal)'], ['Higo inventado', 74]] }], 'xls'), 'c.xls'],
      ] as const) {
        const { preview } = await prepare(bytes, name);
        await commitImport(h.repos, { preview, name, fileName: name, presetId: null });
      }
      expect((await searchFoods(services, 'manzana', 'es')).some((r) => r.imported)).toBe(true);
    } finally {
      services.close();
      globalThis.fetch = original;
      (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXhr;
    }
    expect(calls).toEqual([]);
  });
});
