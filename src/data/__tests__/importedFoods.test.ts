/** @jest-environment node */
import { sql } from 'drizzle-orm';
import { computeItemNutrients } from '../../core/nutrition';
import { dumpAll } from '../../features/testing/backupDump';
import { IMPORT_LIMITS, type NewImportedFood, type SaveMealItemInput } from '../repositories';
import { expectDataError } from '../testing/expectations';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const count = (table: string): number => h.db.all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))[0]?.n ?? -1;

const FOODS: NewImportedFood[] = [
  { name: 'Manzana inventada', group: 'Frutas', per100g: { kcal: 52.5, protein: 0.3, carbs: 13.8, fat: 0.2, sodium: 1 } },
  { name: 'Frijoles ficticios', group: 'Legumbres', per100g: { kcal: 341, protein: 21.4, fiber: 15.5 } },
  { name: 'Ñoquis de ejemplo', group: null, per100g: { kcal: 130, protein: 0 } },
];

describe('ImportedFoodRepository.importCollection', () => {
  it('stores a named collection with its foods and reads them back exactly', async () => {
    const odd = { kcal: 52.499999999999993, protein: 1 / 3, carbs: 1e-7, fat: 0, sodium: 98765.4321 };
    const created = await h.repos.importedFoods.importCollection({ name: 'Tabla inventada', fileName: 'tabla.xlsx', presetId: null }, [
      ...FOODS,
      { name: 'Valores raros', per100g: odd },
    ]);
    expect(created).toMatchObject({ name: 'Tabla inventada', fileName: 'tabla.xlsx', foodCount: 4, presetId: null, basis: 'g', importedAt: '2026-06-15T12:00:00.000Z' });
    expect(await h.repos.importedFoods.listCollections()).toEqual([created]);

    const [hit] = await h.repos.importedFoods.search('valores raros', 5);
    // Identical to the digit, zero kept as zero, nothing added for what the table did not have.
    expect(hit!.per100g).toEqual(odd);
    expect(Object.keys(hit!.per100g)).not.toContain('fiber');
    const [noquis] = await h.repos.importedFoods.search('noquis', 5);
    expect(noquis!.per100g).toEqual({ kcal: 130, protein: 0 });
    expect(noquis!.per100g.carbs).toBeUndefined();
    expect(noquis!.group).toBeNull();
  });

  it('keeps the flag of a per 100 ml table', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Bebidas', basis: 'ml' }, [{ name: 'Jugo inventado', per100g: { kcal: 45 } }]);
    expect(created.basis).toBe('ml');
    expect((await h.repos.importedFoods.search('jugo', 5))[0]).toMatchObject({ basis: 'ml', collectionName: 'Bebidas' });
  });

  it('is all or nothing: a bad food midway leaves the whole database as it was', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Ya estaba' }, FOODS);
    const before = dumpAll(h);
    const bad: NewImportedFood[] = [...FOODS, { name: 'Aceite imposible', per100g: { kcal: 5000 } }, { name: 'Nunca llega', per100g: { kcal: 1 } }];
    await expect(h.repos.importedFoods.importCollection({ name: 'Nueva' }, bad)).rejects.toMatchObject({ code: 'invalid_input' });
    expect(dumpAll(h)).toEqual(before);
    for (const [label, foods] of [
      ['a negative value', [{ name: 'A', per100g: { kcal: -1 } }]],
      ['an unknown nutrient', [{ name: 'A', per100g: { omega9: 3 } as never }]],
      ['a blank name', [{ name: '  ', per100g: { kcal: 1 } }]],
      ['no values at all', [{ name: 'A', per100g: {} }]],
    ] as const) {
      await expect(h.repos.importedFoods.importCollection({ name: label }, foods)).rejects.toMatchObject({ code: 'invalid_input' });
    }
    expect(dumpAll(h)).toEqual(before);
  });

  it('refuses a blank name, an empty table, too many foods and too many tables', async () => {
    await expectDataError(h.repos.importedFoods.importCollection({ name: ' ' }, FOODS), 'invalid_input');
    await expectDataError(h.repos.importedFoods.importCollection({ name: 'Vacía' }, []), 'invalid_input');
    const many = Array.from({ length: IMPORT_LIMITS.foodsPerCollection + 1 }, (_, i) => ({ name: `F${i}`, per100g: { kcal: 1 } }));
    await expectDataError(h.repos.importedFoods.importCollection({ name: 'Enorme' }, many), 'invalid_input');
    for (let i = 0; i < IMPORT_LIMITS.collections; i++) await h.repos.importedFoods.importCollection({ name: `T${i}` }, [FOODS[0]!]);
    await expectDataError(h.repos.importedFoods.importCollection({ name: 'Una más' }, FOODS), 'invalid_input');
  });
});

describe('rename and remove', () => {
  it('renames a collection and shows the new name on its foods', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Vieja' }, FOODS);
    expect((await h.repos.importedFoods.renameCollection(created.id, '  Nueva  ')).name).toBe('Nueva');
    expect((await h.repos.importedFoods.search('manzana', 5))[0]!.collectionName).toBe('Nueva');
    await expectDataError(h.repos.importedFoods.renameCollection(created.id, ' '), 'invalid_input');
    await expectDataError(h.repos.importedFoods.renameCollection('missing', 'X'), 'not_found');
  });

  it('removes every food, its search entries, and only its own favorites and learned matches', async () => {
    const a = await h.repos.importedFoods.importCollection({ name: 'A' }, FOODS);
    const b = await h.repos.importedFoods.importCollection({ name: 'B' }, [{ name: 'Manzana de otra tabla', per100g: { kcal: 60 } }]);
    const [apple] = await h.repos.importedFoods.search('manzana inventada', 1);
    const [other] = await h.repos.importedFoods.search('otra tabla', 1);
    await h.repos.foodUsage.setFavorite({ source: 'custom', id: apple!.id }, true);
    await h.repos.foodUsage.setFavorite({ source: 'custom', id: other!.id }, true);
    await h.catalog.rememberCorrection('manzana', { source: 'custom', id: apple!.id });
    await h.catalog.rememberCorrection('otra', { source: 'custom', id: other!.id });

    expect(await h.repos.importedFoods.removeCollection(a.id)).toEqual({ foods: 3 });

    expect(await h.repos.importedFoods.listCollections()).toEqual([b]);
    expect(count('imported_food')).toBe(1);
    expect(count('imported_food_token')).toBeGreaterThan(0);
    expect(await h.repos.importedFoods.search('inventada', 5)).toEqual([]);
    expect((await h.repos.foodUsage.favorites()).map((f) => f.foodRef)).toEqual([other!.id]);
    expect(await h.repos.matchMemory.getEntry('manzana')).toBeNull();
    expect((await h.repos.matchMemory.getEntry('otra'))?.ref.id).toBe(other!.id);
    await expectDataError(h.repos.importedFoods.removeCollection(a.id), 'not_found');
  });

  it('leaves meals already logged untouched: their snapshot and totals stay', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, FOODS);
    const [food] = await h.repos.importedFoods.search('manzana inventada', 1);
    const item: SaveMealItemInput = {
      displayName: food!.name,
      grams: 200,
      foodSource: 'custom',
      foodRef: food!.id,
      origin: 'manual',
      nutrients: computeItemNutrients({ per100g: food!.per100g }, 200),
    };
    await h.repos.meals.save({ eatenAt: new Date('2026-06-15T18:30:00.000Z'), timeZone: 'America/Bogota', slot: 'dinner', source: 'manual', items: [item] });
    const before = await h.repos.meals.getDay('2026-06-15');

    await h.repos.importedFoods.removeCollection(created.id);

    const after = await h.repos.meals.getDay('2026-06-15');
    expect(after).toEqual(before);
    expect(after.totals.kcal).toBeCloseTo(105);
    expect(after.meals[0]!.items[0]).toMatchObject({ displayName: 'Manzana inventada', grams: 200, foodRef: food!.id });
  });
});

describe('search', () => {
  const index = async () =>
    h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, [
      { name: 'Arroz blanco cocido', per100g: { kcal: 130 } },
      { name: 'Frijoles negros', per100g: { kcal: 341 } },
      { name: 'Limón, jugo', per100g: { kcal: 22 } },
      { name: 'Nueces', per100g: { kcal: 654 } },
      { name: 'Plátano maduro', per100g: { kcal: 90 } },
      { name: 'Pan de maíz', per100g: { kcal: 280 } },
    ]);
  const names = async (q: string) => (await h.repos.importedFoods.search(q, 10)).map((f) => f.name);

  it('finds a food with and without accents, in any case', async () => {
    await index();
    expect(await names('platano')).toEqual(['Plátano maduro']);
    expect(await names('PLÁTANO')).toEqual(['Plátano maduro']);
    expect(await names('limon')).toEqual(['Limón, jugo']);
    expect(await names('maiz')).toEqual(['Pan de maíz']);
  });

  it('matches plural and singular forms in both directions', async () => {
    await index();
    expect(await names('frijol negro')).toEqual(['Frijoles negros']);
    expect(await names('frijoles')).toEqual(['Frijoles negros']);
    expect(await names('nuez')).toEqual(['Nueces']);
    expect(await names('limones')).toEqual(['Limón, jugo']);
  });

  it('matches the word being typed as a prefix, and needs every word', async () => {
    await index();
    expect(await names('arr')).toEqual(['Arroz blanco cocido']);
    expect(await names('arroz blan')).toEqual(['Arroz blanco cocido']);
    expect(await names('arroz negro')).toEqual(expect.arrayContaining(['Arroz blanco cocido', 'Frijoles negros'])); // falls back to any word
    expect(await names('zzz')).toEqual([]);
    expect(await names('')).toEqual([]);
  });

  it('stays fast with thousands of foods', async () => {
    const foods = Array.from({ length: 10_000 }, (_, i) => ({ name: `Alimento número ${i} con arroz ${i % 7}`, per100g: { kcal: (i % 900) + 1 } }));
    foods.push({ name: 'Quinoa única', per100g: { kcal: 120 } });
    await h.repos.importedFoods.importCollection({ name: 'Grande' }, foods);
    const started = Date.now();
    expect((await h.repos.importedFoods.search('quinoa', 10)).map((f) => f.name)).toEqual(['Quinoa única']);
    expect((await h.repos.importedFoods.search('alimento arroz 3', 50)).length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('resolves a food and the origin of several ids', async () => {
    const created = await index();
    const [food] = await h.repos.importedFoods.search('platano', 1);
    expect(await h.repos.importedFoods.getFood(food!.id)).toMatchObject({ name: 'Plátano maduro', collectionId: created.id, collectionName: 'Mi tabla' });
    expect(await h.repos.importedFoods.getFood('nope')).toBeNull();
    const origins = await h.repos.importedFoods.originsOf([food!.id, 'nope']);
    expect([...origins.entries()]).toEqual([[food!.id, { collectionName: 'Mi tabla', basis: 'g' }]]);
  });
});

describe('use like any other food', () => {
  it('is resolved when the grams of a logged item change, from the imported values', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, FOODS);
    const [food] = await h.repos.importedFoods.search('frijoles', 1);
    const meal = await h.repos.meals.save({
      eatenAt: new Date('2026-06-15T18:30:00.000Z'),
      timeZone: 'America/Bogota',
      slot: 'lunch',
      source: 'manual',
      items: [{ displayName: food!.name, grams: 100, foodSource: 'custom', foodRef: food!.id, origin: 'manual', nutrients: computeItemNutrients({ per100g: food!.per100g }, 100) }],
    });
    const updated = await h.repos.meals.updateItemGrams(meal.items[0]!.id, 50);
    expect(updated.kcal).toBeCloseTo(170.5);
    expect(updated.nutrients.fiber).toBeCloseTo(7.75);
  });
});

describe('export and import of the user data', () => {
  it('reads a collection with its foods and writes it back with the same ids', async () => {
    const created = await h.repos.importedFoods.importCollection({ name: 'Mi tabla', fileName: 'x.csv', presetId: 'some-preset' }, FOODS);
    const [food] = await h.repos.importedFoods.search('frijoles', 1);
    const snapshot = await h.repos.backup.read();
    expect(snapshot.importedCollections).toHaveLength(1);
    expect(snapshot.importedCollections[0]).toMatchObject({ ...created, foods: expect.any(Array) });
    expect(snapshot.importedCollections[0]!.foods).toHaveLength(3);

    const before = dumpAll(h);
    await h.repos.backup.replaceAll(snapshot);
    // Same rows (the integer search keys may be renumbered, so compare what a person can see).
    expect(await h.repos.importedFoods.listCollections()).toEqual([created]);
    expect((await h.repos.importedFoods.search('frijoles', 1))[0]).toEqual(food);
    expect(count('imported_food_token')).toBe((before.imported_food_token as unknown[]).length);
  });

  it('is wiped by delete-all', async () => {
    await h.repos.importedFoods.importCollection({ name: 'Mi tabla' }, FOODS);
    await h.repos.backup.deleteAll();
    expect([count('food_collection'), count('imported_food'), count('imported_food_token')]).toEqual([0, 0, 0]);
  });
});
