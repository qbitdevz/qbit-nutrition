/** @jest-environment node */
import { sql } from 'drizzle-orm';

import { dumpAll } from '../../features/testing/backupDump';
import { bundledMigrations, initializeDatabase } from '../database';
import { contentFingerprint, type NewImportedFood } from '../repositories';
import { createHarness, type Harness } from '../testing/harness';
import { openNodeDatabase } from '../testing/nodeDatabase';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const FOODS: NewImportedFood[] = [
  { name: 'Manzana inventada', group: 'Frutas', per100g: { kcal: 52.5, protein: 0.3, carbs: 13.8 } },
  { name: 'Frijoles ficticios', group: 'Legumbres', per100g: { kcal: 341, protein: 21.4, fiber: 15.5 } },
  { name: 'Ñoquis de ejemplo', group: null, per100g: { kcal: 130, protein: 0 } },
];

const candidateOf = (foods: NewImportedFood[], over: Partial<{ name: string; fileName: string | null }> = {}) => ({
  contentHash: contentFingerprint('g', foods),
  name: 'Tabla',
  fileName: 'tabla.csv',
  foods,
  ...over,
});

describe('the content fingerprint of a table (B1)', () => {
  it('is stored with the collection when it is imported', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Tabla', fileName: 'tabla.csv' }, FOODS);
    expect(created.contentHash).toBe(contentFingerprint('g', FOODS));
    expect(created.contentHash).toMatch(/^[0-9a-f]{26,}$/);
    expect((await h.repos.importedFoods.listCollections())[0]!.contentHash).toBe(created.contentHash);
  });

  it('does not depend on the order of the foods, nor on spaces around names, but on every value, the group and the basis', () => {
    const base = contentFingerprint('g', FOODS);
    expect(contentFingerprint('g', [...FOODS].reverse())).toBe(base);
    expect(contentFingerprint('g', FOODS.map((f) => ({ ...f, name: ` ${f.name} ` })))).toBe(base);
    expect(contentFingerprint('ml', FOODS)).not.toBe(base);
    expect(contentFingerprint('g', FOODS.map((f, i) => (i === 0 ? { ...f, per100g: { ...f.per100g, kcal: 52.6 } } : f)))).not.toBe(base);
    expect(contentFingerprint('g', FOODS.map((f, i) => (i === 0 ? { ...f, group: 'Otra' } : f)))).not.toBe(base);
    expect(contentFingerprint('g', FOODS.slice(1))).not.toBe(base);
  });

  it('a restore from a backup writes it too', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Tabla', fileName: 'tabla.csv' }, FOODS);
    const snapshot = await h.repos.backup.read();
    const other = await createHarness();
    await other.repos.backup.replaceAll(snapshot);
    expect((await other.repos.importedFoods.listCollections())[0]!.contentHash).toBe(contentFingerprint('g', FOODS));
    other.close();
  });
});

describe('the migration that adds the fingerprint, from the previous schema with collections already in it (B1)', () => {
  it('keeps every collection and food, and leaves the fingerprint empty for them', async () => {
    const node = openNodeDatabase();
    const all = Object.entries(bundledMigrations.migrations);
    const previous = Object.fromEntries(all.slice(0, all.length - 1));
    expect(Object.keys(previous)).not.toContain(all[all.length - 1]![0]);
    await initializeDatabase(node.db, { migrations: previous });
    node.client.exec(`INSERT INTO food_collection (id, name, file_name, imported_at, food_count, preset_id, basis) VALUES ('old-1', 'Vieja', 'vieja.csv', '2026-11-22T10:00:00.000Z', 1, NULL, 'g')`);
    node.client.exec(`INSERT INTO imported_food (seq, id, collection_id, name, food_group, per_100g_json) VALUES (1, 'f1', 'old-1', 'Manzana inventada', NULL, '{"kcal":52}')`);
    expect(node.db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('food_collection')`).map((c) => c.name)).not.toContain('content_hash');

    await initializeDatabase(node.db); // the whole bundle: only the new migration runs
    expect(node.db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('food_collection')`).map((c) => c.name)).toContain('content_hash');
    expect(node.db.all(sql`SELECT id, name, content_hash FROM food_collection`)).toEqual([{ id: 'old-1', name: 'Vieja', content_hash: null }]);
    expect(node.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM imported_food`)[0]!.n).toBe(1);
    node.close();
  });
});

describe('finding a table that is already here (B1)', () => {
  it('matches the same content by its fingerprint, whatever it is called now', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Renombrada', fileName: 'otro.csv' }, FOODS);
    const found = await h.repos.importedFoods.findMatches(candidateOf([...FOODS].reverse()));
    expect(found.map((c) => c.id)).toEqual([created.id]);
  });

  it('does not match other content, other values, or another basis', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Tabla', fileName: 'tabla.csv' }, FOODS);
    expect(await h.repos.importedFoods.findMatches(candidateOf(FOODS.slice(1)))).toEqual([]);
    expect(await h.repos.importedFoods.findMatches(candidateOf(FOODS.map((f, i) => (i === 0 ? { ...f, per100g: { kcal: 1 } } : f))))).toEqual([]);
    expect(await h.repos.importedFoods.findMatches({ ...candidateOf(FOODS), contentHash: contentFingerprint('ml', FOODS) })).toEqual([]);
  });

  it('a collection imported before fingerprints (none stored) matches by name or file, food count and a sample of names', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Tabla', fileName: 'tabla.csv' }, FOODS);
    h.client.exec(`UPDATE food_collection SET content_hash = NULL`);
    expect((await h.repos.importedFoods.findMatches(candidateOf(FOODS))).map((c) => c.id)).toEqual([created.id]);
    // The same file under another name is still the same file…
    expect((await h.repos.importedFoods.findMatches(candidateOf(FOODS, { name: 'Otro nombre' }))).map((c) => c.id)).toEqual([created.id]);
    // …but neither the name nor the file agree: not claimed to be the same.
    expect(await h.repos.importedFoods.findMatches(candidateOf(FOODS, { name: 'Otro nombre', fileName: 'otro.csv' }))).toEqual([]);
    // A different count, or different names at the sampled places, never match.
    expect(await h.repos.importedFoods.findMatches(candidateOf([...FOODS, { name: 'Extra', per100g: { kcal: 1 } }]))).toEqual([]);
    expect(await h.repos.importedFoods.findMatches(candidateOf(FOODS.map((f, i) => (i === 1 ? { ...f, name: 'Otro' } : f))))).toEqual([]);
  });
});

describe('replacing a table (B1)', () => {
  it('swaps it for the new content in one step; meals logged from it keep their totals', async () => {
    const old = await h.repos.importedFoods.importCollection({ name: 'Tabla', fileName: 'tabla.csv' }, FOODS);
    const [apple] = await h.repos.importedFoods.search('manzana', 1);
    await h.repos.foodUsage.setFavorite({ source: 'custom', id: apple!.id }, true);
    await h.repos.meals.save({ eatenAt: new Date('2026-06-15T18:30:00.000Z'), timeZone: 'UTC', slot: 'dinner', source: 'manual', items: [{ displayName: apple!.name, grams: 100, foodSource: 'custom', foodRef: apple!.id, origin: 'manual', nutrients: { kcal: 52.5 } }] });
    const totals = await h.repos.meals.dayTotals('2026-06-15');

    const next = await h.repos.importedFoods.replaceCollections([old.id], { name: 'Tabla', fileName: 'tabla.csv' }, FOODS);
    const collections = await h.repos.importedFoods.listCollections();
    expect(collections.map((c) => c.id)).toEqual([next.id]);
    expect(next.id).not.toBe(old.id);
    expect(h.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM imported_food`)[0]!.n).toBe(3);
    expect(await h.repos.meals.dayTotals('2026-06-15')).toEqual(totals);
    expect(await h.repos.importedFoods.getFood(apple!.id)).toBeNull(); // the old foods are gone…
    expect((await h.repos.importedFoods.search('manzana', 5)).map((f) => f.collectionName)).toEqual(['Tabla']); // …and found once
  });

  it('is all or nothing: a food the repository refuses leaves the old table and every row as it was', async () => {
    const old = await h.repos.importedFoods.importCollection({ name: 'Tabla' }, FOODS);
    const before = dumpAll(h);
    await expect(h.repos.importedFoods.replaceCollections([old.id], { name: 'Tabla' }, [...FOODS, { name: 'Imposible', per100g: { kcal: 5000 } }])).rejects.toMatchObject({ code: 'invalid_input' });
    expect(dumpAll(h)).toEqual(before);
  });

  it('can replace several tables with one (a table that was imported in pieces)', async () => {
    const a = await h.repos.importedFoods.importCollection({ name: 'A' }, FOODS.slice(0, 1));
    const b = await h.repos.importedFoods.importCollection({ name: 'B' }, FOODS.slice(1));
    const joined = await h.repos.importedFoods.replaceCollections([a.id, b.id], { name: 'Juntas' }, FOODS);
    expect((await h.repos.importedFoods.listCollections()).map((c) => [c.id, c.foodCount])).toEqual([[joined.id, 3]]);
  });

  it('does not count the replaced tables against the limit of tables', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push((await h.repos.importedFoods.importCollection({ name: `T${i}` }, [{ name: `Comida ${i}`, per100g: { kcal: i + 1 } }])).id);
    await expect(h.repos.importedFoods.importCollection({ name: 'Una más' }, FOODS)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(h.repos.importedFoods.replaceCollections([ids[0]!], { name: 'Reemplazo' }, FOODS)).resolves.toBeDefined();
  });
});

describe('duplicates that already exist (B1)', () => {
  it('groups tables with identical content (even imported before fingerprints) and leaves different ones alone', async () => {
    h.setNow('2026-06-15T12:00:00.000Z');
    const one = await h.repos.importedFoods.importCollection({ name: 'Tabla', fileName: 'tabla.csv' }, FOODS);
    h.setNow('2026-06-15T12:05:00.000Z');
    const two = await h.repos.importedFoods.importCollection({ name: 'Tabla (2)', fileName: 'tabla.csv' }, FOODS);
    const other = await h.repos.importedFoods.importCollection({ name: 'Otra' }, [{ name: 'Distinta', per100g: { kcal: 9 } }]);
    h.client.exec(`UPDATE food_collection SET content_hash = NULL`); // as the owner's phone has them
    const groups = await h.repos.importedFoods.duplicateGroups();
    expect(groups.map((g) => g.map((c) => c.id))).toEqual([[one.id, two.id]]); // oldest first
    expect(groups.flat().map((c) => c.id)).not.toContain(other.id);
    // The scan left the fingerprints behind, so the next one is instant.
    expect((await h.repos.importedFoods.listCollections()).every((c) => c.contentHash !== null)).toBe(true);
  });

  it('reports nothing when there are no duplicates', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Tabla' }, FOODS);
    expect(await h.repos.importedFoods.duplicateGroups()).toEqual([]);
  });

  it('removing the others leaves exactly one, all or nothing', async () => {
    const one = await h.repos.importedFoods.importCollection({ name: 'Tabla' }, FOODS);
    const two = await h.repos.importedFoods.importCollection({ name: 'Tabla 2' }, FOODS);
    const three = await h.repos.importedFoods.importCollection({ name: 'Tabla 3' }, FOODS);
    const before = dumpAll(h);
    await expect(h.repos.importedFoods.removeCollections([two.id, 'missing'])).rejects.toMatchObject({ code: 'not_found' });
    expect(dumpAll(h)).toEqual(before);
    expect(await h.repos.importedFoods.removeCollections([two.id, three.id])).toEqual({ foods: 6 });
    expect((await h.repos.importedFoods.listCollections()).map((c) => c.id)).toEqual([one.id]);
    expect(h.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM imported_food_token`)[0]!.n).toBeGreaterThan(0);
  });
});
