/** @jest-environment node */
import { createHarness, type Harness } from '@/data/testing/harness';
import { createFakeDataPlatform, type FakeDataPlatform } from '@/platform/fakeDataPlatform';
import { dumpAll } from '../../testing/backupDump';
import { analyseFile, pickAndAnalyse, buildPlan, defaultChoices, groupMatches, refusedFile, runPlan, type AnalysedFile, type Choices } from '../batchService';
import { readTableFile } from '../readFile';
import { SPANISH_CSV, utf8 } from '../testing/synthetic';

let h: Harness;
let platform: FakeDataPlatform;
beforeEach(async () => {
  h = await createHarness();
  platform = createFakeDataPlatform();
});
afterEach(() => {
  jest.restoreAllMocks();
  h.close();
});

/** A SYNTHETIC table in the layout of a published one (invented foods): one file of a table published as several. */
const argenCsv = (group: string, foods: string[]) =>
  [
    `${group};;;;;`,
    'Por 100 g de porción comestible;;;;;',
    'Nº;Alimento;Género - especie - variedad;Energía (Kcal);Proteínas (g);Sodio (mg)',
    ';;;<ENERC>;<PROTCNT>;<NA>',
    ';;;2*1;3*1;13*1',
    ...foods.map((f, i) => `${i + 1};${f};;${100 + i};${i + 1},5;${10 + i}`),
  ].join('\n');

const CEREALES = argenCsv('CEREALES INVENTADOS', ['Arroz inventado', 'Avena ficticia', 'Trigo de ejemplo']);
const FRUTAS = argenCsv('FRUTAS INVENTADAS', ['Manzana inventada', 'Pera ficticia']);
const GRASAS_ACIDOS = ['Alimento;C18:2 (g);C18:3 (g);C20:5 (g)', 'Aceite inventado;50;1;0', 'Manteca ficticia;2;0;0'].join('\n');
const CLEAN = ['Alimento;Energía (kcal/100 g);Proteínas (g/100 g);Hidratos de carbono (g/100 g);Grasa total (g/100 g)', 'Manzana inventada;52;0,3;13,8;0,2', 'Pan de ejemplo;265;9;49;3,2'].join('\n');

async function analyse(csv: string, name: string, id = name): Promise<AnalysedFile> {
  return analyseFile(h.repos, { id, file: await readTableFile(utf8(csv), name) });
}
const everything = async (files: AnalysedFile[], over: Partial<Choices> = {}): Promise<Choices> => ({ ...defaultChoices(files), ...over });
const planOf = async (files: AnalysedFile[], over: Partial<Choices> = {}) => buildPlan(files, await everything(files, over), (await h.repos.importedFoods.listCollections()).length);

describe('what a file turns out to be (B2)', () => {
  it('a table the app can use is ready, with what was recognised', async () => {
    const file = await analyse(CLEAN, 'limpia.csv');
    expect(file.outcome).toEqual({ kind: 'ready' });
    expect(file.assessment).toMatchObject({ confident: true, nutrients: 4 });
    expect(file.preview!.counts.foods).toBe(2);
  });

  it('a sheet with nothing the app tracks (fatty acids only) is "nothing usable", not an error', async () => {
    const file = await analyse(GRASAS_ACIDOS, 'acidos.csv');
    expect(file.outcome).toEqual({ kind: 'nothing_usable' });
    expect(file.preview).not.toBeNull();
  });

  it('a table it cannot read as it is (no name column) needs its columns chosen', async () => {
    const file = await analyse('Energía (kcal);Proteínas (g)\n1;2\n3;4', 'sin nombres.csv');
    expect(file.outcome).toMatchObject({ kind: 'needs_mapping' });
  });

  it('a file the reader refuses is reported with its reason, and nothing else is claimed about it', () => {
    const file = refusedFile('x', 'tabla.pdf', 'unsupported');
    expect(file).toMatchObject({ outcome: { kind: 'refused', code: 'unsupported' }, file: null, preview: null, matches: [] });
  });

  it('a file recognised as a published layout names the preset and the group', async () => {
    const file = await analyse(CEREALES, 'a.csv');
    expect(file.preset).toMatchObject({ id: 'argenfoods', name: 'ARGENFOODS' });
    expect(file.defaultName).toBe('ARGENFOODS · Cereales inventados');
  });
});

describe('importing the same file twice is noticed (B1)', () => {
  const importIt = async (csv: string, name: string, choice: Choices['duplicate'][string] | null) => {
    const files = [await analyse(csv, name)];
    const plan = await planOf(files, choice ? { duplicate: { [files[0]!.id]: choice } } : {});
    return { files, plan, report: await runPlan(h.repos, plan) };
  };

  it('the second import finds the table that is already here, and asks before doing anything', async () => {
    await importIt(CLEAN, 'limpia.csv', null);
    const again = [await analyse(CLEAN, 'limpia.csv')];
    expect(again[0]!.matches).toHaveLength(1);
    const plan = await planOf(again);
    expect(plan.units[0]!.matches).toHaveLength(1);
    expect(plan.blockedBy).toEqual([{ kind: 'duplicate_undecided', unit: plan.units[0]!.key }]);
    expect(plan.canImport).toBe(false);
  });

  it('"replace" leaves exactly one collection, and the meals logged from the old one keep their totals', async () => {
    await importIt(CLEAN, 'limpia.csv', null);
    const [apple] = await h.repos.importedFoods.search('manzana', 1);
    await h.repos.meals.save({ eatenAt: new Date('2026-06-15T18:30:00.000Z'), timeZone: 'UTC', slot: 'dinner', source: 'manual', items: [{ displayName: apple!.name, grams: 150, foodSource: 'custom', foodRef: apple!.id, origin: 'manual', nutrients: { kcal: 78 } }] });
    const totals = await h.repos.meals.dayTotals('2026-06-15');
    const { report } = await importIt(CLEAN, 'limpia.csv', 'replace');
    expect(report.imported).toHaveLength(1);
    expect(report.imported[0]).toMatchObject({ replaced: 1, foods: 2 });
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
    expect(await h.repos.meals.dayTotals('2026-06-15')).toEqual(totals);
  });

  it('"keep both" is explicit: nothing is imported twice unless it is chosen, and then there are two', async () => {
    await importIt(CLEAN, 'limpia.csv', null);
    await importIt(CLEAN, 'limpia.csv', 'skip');
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
    await importIt(CLEAN, 'limpia.csv', 'keep');
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(2);
  });

  it('cancel (skip) imports nothing and writes nothing', async () => {
    await importIt(CLEAN, 'limpia.csv', null);
    const before = dumpAll(h);
    const { report } = await importIt(CLEAN, 'limpia.csv', 'skip');
    expect(report.imported).toEqual([]);
    expect(dumpAll(h)).toEqual(before);
  });

  it('a table imported before fingerprints is recognised by its name or file, count and names', async () => {
    await importIt(CLEAN, 'limpia.csv', null);
    h.client.exec(`UPDATE food_collection SET content_hash = NULL`);
    const files = [await analyse(CLEAN, 'limpia.csv')];
    expect(files[0]!.matches).toHaveLength(1);
  });
});

describe('several files at once (B2)', () => {
  it('imports the accepted ones; a bad one does not import half and does not undo the others; a useless one is listed, not an error', async () => {
    const good1 = await analyse(CLEAN, 'limpia.csv');
    const good2 = await analyse(SPANISH_CSV, 'española.csv');
    const useless = await analyse(GRASAS_ACIDOS, 'acidos.csv');
    const refused = refusedFile('pdf', 'tabla.pdf', 'unsupported');
    const files = [good1, useless, good2, refused];
    const plan = await planOf(files, { confirmed: { [good2.id]: ['basis_assumed'] } });
    expect(plan.units.map((u) => u.files.map((f) => f.fileName))).toEqual([['limpia.csv'], ['española.csv']]);
    expect(plan.notImported.map((n) => [n.file.fileName, n.reason])).toEqual([
      ['acidos.csv', 'nothing_usable'],
      ['tabla.pdf', 'refused'],
    ]);

    const real = h.repos.importedFoods.importCollection.bind(h.repos.importedFoods);
    jest.spyOn(h.repos.importedFoods, 'importCollection').mockImplementation(async (input, foods) => {
      if (input.fileName === 'española.csv') throw new Error('disk full'); // the second one fails
      return real(input, foods);
    });
    const report = await runPlan(h.repos, plan);
    expect(report.imported.map((r) => r.unit.files[0]!.fileName)).toEqual(['limpia.csv']);
    expect(report.failed.map((r) => r.unit.files[0]!.fileName)).toEqual(['española.csv']);
    const stored = await h.repos.importedFoods.listCollections();
    expect(stored.map((c) => c.fileName)).toEqual(['limpia.csv']); // the first stays, the failed one left no trace
    expect(h.db.all).toBeDefined();
    expect((await h.repos.importedFoods.search('yogur', 5))).toEqual([]);
  });

  it('a file the person deselected is not imported and is listed as such', async () => {
    const a = await analyse(CLEAN, 'a.csv');
    const b = await analyse(SPANISH_CSV, 'b.csv');
    const plan = await planOf([a, b], { selected: { [a.id]: true, [b.id]: false } });
    expect(plan.units).toHaveLength(1);
    expect(plan.notImported).toEqual([expect.objectContaining({ reason: 'deselected' })]);
  });

  it('a file with a point to confirm blocks the import until that point is confirmed', async () => {
    const weak = await analyse(SPANISH_CSV, 'débil.csv'); // basis not stated
    expect(weak.assessment!.confirm.map((c) => c.kind)).toContain('basis_assumed');
    const blocked = await planOf([weak]);
    expect(blocked.blockedBy).toEqual(expect.arrayContaining([{ kind: 'unconfirmed', file: weak.id, point: 'basis_assumed' }]));
    expect(blocked.canImport).toBe(false);
    const confirmed = await planOf([weak], { confirmed: { [weak.id]: weak.assessment!.confirm.map((c) => c.kind) } });
    expect(confirmed.canImport).toBe(true);
  });

  it('refuses a batch that would pass the limit of tables, and says how many fit', async () => {
    const files = [await analyse(CLEAN, 'a.csv'), await analyse(SPANISH_CSV, 'b.csv')];
    const plan = buildPlan(files, await everything(files, { confirmed: { [files[1]!.id]: ['basis_assumed'] } }), 29);
    expect(plan.blockedBy).toEqual([{ kind: 'too_many_tables', limit: 30, existing: 29, adding: 2, replacing: 0 }]);
    expect(plan.canImport).toBe(false);
  });
});

describe('files from the same recognised table become one collection (B3)', () => {
  it('are offered as one, named after the table, and importing them makes one collection with every food', async () => {
    const files = [await analyse(CEREALES, 'cereales.csv'), await analyse(FRUTAS, 'frutas.csv')];
    const plan = await planOf(files);
    expect(plan.groups).toEqual([{ presetId: 'argenfoods', presetName: 'ARGENFOODS', files: ['cereales.csv', 'frutas.csv'], combined: true }]);
    expect(plan.units).toHaveLength(1);
    expect(plan.units[0]).toMatchObject({ name: 'ARGENFOODS', presetId: 'argenfoods' });
    expect(plan.units[0]!.foods).toHaveLength(5);

    const report = await runPlan(h.repos, plan);
    expect(report.imported).toHaveLength(1);
    const collections = await h.repos.importedFoods.listCollections();
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({ name: 'ARGENFOODS', foodCount: 5, presetId: 'argenfoods' });
    expect((await h.repos.importedFoods.search('arroz', 5))[0]).toMatchObject({ group: 'Cereales inventados', collectionName: 'ARGENFOODS' });
    expect((await h.repos.importedFoods.search('manzana', 5))[0]).toMatchObject({ group: 'Frutas inventadas', collectionName: 'ARGENFOODS' });
  });

  it('removing the combined collection removes every food of every file', async () => {
    const files = [await analyse(CEREALES, 'cereales.csv'), await analyse(FRUTAS, 'frutas.csv')];
    await runPlan(h.repos, await planOf(files));
    const [only] = await h.repos.importedFoods.listCollections();
    expect((await h.repos.importedFoods.search('arroz', 5)).length).toBe(1);
    expect(await h.repos.importedFoods.removeCollection(only!.id)).toEqual({ foods: 5 });
    expect(await h.repos.importedFoods.search('arroz', 5)).toEqual([]);
    expect(await h.repos.importedFoods.search('manzana', 5)).toEqual([]);
  });

  it('can be kept as one collection per file instead', async () => {
    const files = [await analyse(CEREALES, 'cereales.csv'), await analyse(FRUTAS, 'frutas.csv')];
    const plan = await planOf(files, { combine: { argenfoods: false } });
    expect(plan.units.map((u) => u.name)).toEqual(['ARGENFOODS · Cereales inventados', 'ARGENFOODS · Frutas inventadas']);
    expect(plan.groups[0]).toMatchObject({ combined: false });
  });

  it('is only offered for two or more files of the same preset; other files stay on their own', async () => {
    const files = [await analyse(CEREALES, 'cereales.csv'), await analyse(CLEAN, 'limpia.csv')];
    const plan = await planOf(files);
    expect(plan.groups).toEqual([]);
    expect(plan.units).toHaveLength(2);
  });

  it('importing the same combined table again is noticed, and replacing it leaves one', async () => {
    const files = [await analyse(CEREALES, 'cereales.csv'), await analyse(FRUTAS, 'frutas.csv')];
    await runPlan(h.repos, await planOf(files));
    const again = [await analyse(CEREALES, 'cereales.csv'), await analyse(FRUTAS, 'frutas.csv')];
    const matches = await groupMatches(h.repos, again);
    const plan = buildPlan(again, { ...defaultChoices(again), groupMatches: matches }, 1);
    expect(plan.units[0]!.matches).toHaveLength(1);
    expect(plan.canImport).toBe(false);
    const replaced = buildPlan(again, { ...defaultChoices(again), groupMatches: matches, duplicate: { [plan.units[0]!.key]: 'replace' } }, 1);
    const report = await runPlan(h.repos, replaced);
    expect(report.imported[0]).toMatchObject({ replaced: 1, foods: 5 });
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });

  it('files already imported one by one (the owner’s case) are found inside a combined import, and replaced by it', async () => {
    for (const [csv, name] of [[CEREALES, 'cereales.csv'], [FRUTAS, 'frutas.csv']] as const) {
      const files = [await analyse(csv, name)];
      await runPlan(h.repos, await planOf(files));
    }
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(2);
    const again = [await analyse(CEREALES, 'cereales.csv'), await analyse(FRUTAS, 'frutas.csv')];
    const plan = buildPlan(again, { ...defaultChoices(again), groupMatches: await groupMatches(h.repos, again) }, 2);
    expect(plan.units[0]!.matches).toHaveLength(2);
    const replaced = buildPlan(again, { ...defaultChoices(again), groupMatches: await groupMatches(h.repos, again), duplicate: { [plan.units[0]!.key]: 'replace' } }, 2);
    const report = await runPlan(h.repos, replaced);
    expect(report.imported[0]).toMatchObject({ replaced: 2, foods: 5 });
    expect((await h.repos.importedFoods.listCollections()).map((c) => c.name)).toEqual(['ARGENFOODS']);
  });
});

describe('picking several files and reading them in sequence (B2)', () => {
  it('reads each picked file, removes every copy the picker made, and reports progress file by file', async () => {
    platform.state.nextPicks = [
      { name: 'limpia.csv', bytes: utf8(CLEAN) },
      { name: 'acidos.csv', bytes: utf8(GRASAS_ACIDOS) },
      { name: 'tabla.pdf', bytes: utf8('%PDF-1.7') },
    ];
    const seen: string[] = [];
    const result = await pickAndAnalyse(platform, h.repos, { onFile: (p) => seen.push(`${p.index + 1}/${p.total} ${p.name}`) });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.files.map((f) => [f.fileName, f.outcome.kind])).toEqual([
      ['limpia.csv', 'ready'],
      ['acidos.csv', 'nothing_usable'],
      ['tabla.pdf', 'refused'],
    ]);
    expect(seen).toEqual(['1/3 limpia.csv', '2/3 acidos.csv', '3/3 tabla.pdf']);
    expect([...platform.state.cache.keys()]).toEqual([]);
  });

  it('returns cancelled when the person closes the picker', async () => {
    expect(await pickAndAnalyse(platform, h.repos, {})).toEqual({ kind: 'cancelled' });
  });
});

describe('the same content twice in one batch (final verification, item 1)', () => {
  it('flags the second file as a copy of the first, and imports only one by default', async () => {
    const a = await analyse(CLEAN, 'a.csv');
    const b = await analyse(CLEAN, 'copia de a.csv');
    const plan = await planOf([a, b]);
    expect(plan.duplicateOf).toEqual({ [b.id]: a.id });
    expect(plan.selected).toEqual({ [a.id]: true, [b.id]: false });
    expect(plan.units.map((u) => u.files.map((f) => f.fileName))).toEqual([['a.csv']]);
    expect(plan.notImported).toEqual([expect.objectContaining({ reason: 'duplicate_in_batch' })]);
    const report = await runPlan(h.repos, plan);
    expect(report.imported).toHaveLength(1);
    expect(await h.repos.importedFoods.listCollections()).toHaveLength(1);
  });

  it('imports both as separate tables only when the person ticks the copy', async () => {
    const a = await analyse(CLEAN, 'a.csv');
    const b = await analyse(CLEAN, 'b.csv');
    const plan = await planOf([a, b], { selected: { [b.id]: true } });
    expect(plan.selected[b.id]).toBe(true);
    expect(plan.units).toHaveLength(2);
  });

  it('in a combined collection the foods of an identical file are never added twice, even when ticked', async () => {
    const files = [await analyse(CEREALES, 'cereales.csv'), await analyse(CEREALES, 'cereales otra vez.csv'), await analyse(FRUTAS, 'frutas.csv')];
    for (const choices of [{}, { selected: { [files[1]!.id]: true } }]) {
      const plan = await planOf(files, choices);
      expect(plan.units).toHaveLength(1);
      expect(plan.units[0]!.foods).toHaveLength(5);
    }
    await runPlan(h.repos, await planOf(files, { selected: { [files[1]!.id]: true } }));
    expect((await h.repos.importedFoods.listCollections())[0]).toMatchObject({ foodCount: 5 });
    expect((await h.repos.importedFoods.search('arroz', 10)).length).toBe(1);
  });

  it('files with different content are not flagged', async () => {
    const plan = await planOf([await analyse(CLEAN, 'a.csv'), await analyse(SPANISH_CSV, 'b.csv')]);
    expect(plan.duplicateOf).toEqual({});
  });
});
