/** @jest-environment node */
import { sql } from 'drizzle-orm';
import { computeItemNutrients, type NutrientAmounts } from '../../core/nutrition';
import { expectDataError } from '../testing/expectations';
import { deriveMealTime } from '../localDate';
import type { SaveMealInput, SaveMealItemInput } from '../repositories';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const count = (table: string): number =>
  h.db.all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))[0]?.n ?? -1;

/** A catalog banana (fixture id 1001) with the snapshot the way a feature builds it. */
async function bananaItem(grams: number, over: Partial<SaveMealItemInput> = {}): Promise<SaveMealItemInput> {
  const food = await h.catalog.getFood({ source: 'catalog', id: '1001' });
  return {
    displayName: 'Plátano',
    grams,
    foodSource: 'catalog',
    foodRef: '1001',
    origin: 'manual',
    nutrients: computeItemNutrients(food, grams),
    ...over,
  };
}

const meal = (items: SaveMealItemInput[], over: Partial<SaveMealInput> = {}): SaveMealInput => ({
  eatenAt: new Date('2026-06-15T18:30:00.000Z'),
  timeZone: 'America/Bogota',
  slot: 'dinner',
  source: 'manual',
  items,
  ...over,
});

describe('MealRepository.save and getDay', () => {
  it('stores a meal with its items and snapshots and reads it back by local date', async () => {
    const saved = await h.repos.meals.save(
      meal([await bananaItem(150), await bananaItem(100, { displayName: 'Plátano 2' })], { name: 'Cena', note: 'rápida' }),
    );
    expect(saved).toMatchObject({ localDate: '2026-06-15', eatenAt: '2026-06-15T18:30:00.000Z', slot: 'dinner', name: 'Cena' });

    const day = await h.repos.meals.getDay('2026-06-15');
    expect(day.meals).toHaveLength(1);
    const [m] = day.meals;
    expect(m?.items.map((i) => [i.position, i.displayName, i.grams])).toEqual([
      [0, 'Plátano', 150],
      [1, 'Plátano 2', 100],
    ]);
    const first = m?.items[0];
    expect(first?.kcal).toBeCloseTo(133.5);
    expect(first?.proteinG).toBeCloseTo(1.635);
    expect(first?.carbsG).toBeCloseTo(34.26);
    expect(first?.fatG).toBeCloseTo(0.495);
    // The rest of the nutrients are in the side table, headline values are not duplicated there.
    expect(first?.nutrients.fiber).toBeCloseTo(3.9);
    expect(first?.nutrients.sodium).toBeCloseTo(1.5);
    expect(first?.nutrients).not.toHaveProperty('kcal');
    expect(count('meal_item_nutrient')).toBe(4);
  });

  it('stores the local date together with the UTC timestamp, and it does not move with the time zone', async () => {
    const instant = new Date('2026-06-15T02:30:00.000Z');
    const bogota = await h.repos.meals.save(meal([await bananaItem(100)], { eatenAt: instant, timeZone: 'America/Bogota' }));
    const tokyo = await h.repos.meals.save(meal([await bananaItem(100)], { eatenAt: instant, timeZone: 'Asia/Tokyo' }));
    expect(bogota.localDate).toBe('2026-06-14');
    expect(tokyo.localDate).toBe('2026-06-15');
    expect(bogota.eatenAt).toBe(tokyo.eatenAt);

    // Later, in Tokyo: the Bogota meal is still on the day it was eaten.
    expect(deriveMealTime(new Date(bogota.eatenAt), 'Asia/Tokyo').localDate).toBe('2026-06-15');
    expect((await h.repos.meals.getDay('2026-06-14')).meals.map((m) => m.id)).toEqual([bogota.id]);
    expect((await h.repos.meals.getDay('2026-06-15')).meals.map((m) => m.id)).toEqual([tokyo.id]);
  });

  it('opens any previous day and lists its meals in the order they were eaten', async () => {
    const lunch = await h.repos.meals.save(meal([await bananaItem(100)], { eatenAt: new Date('2026-06-10T17:00:00Z'), slot: 'lunch' }));
    const breakfast = await h.repos.meals.save(meal([await bananaItem(100)], { eatenAt: new Date('2026-06-10T13:00:00Z'), slot: 'breakfast' }));
    await h.repos.meals.save(meal([await bananaItem(100)], { eatenAt: new Date('2026-06-11T13:00:00Z') }));
    const day = await h.repos.meals.getDay('2026-06-10');
    expect(day.meals.map((m) => m.id)).toEqual([breakfast.id, lunch.id]);
    expect((await h.repos.meals.getDay('2026-01-01')).meals).toEqual([]);
  });

  it('computes day totals by query, including optional nutrients', async () => {
    await h.repos.meals.save(meal([await bananaItem(150)]));
    await h.repos.meals.save(meal([await bananaItem(50)], { slot: 'snack' }));
    await h.repos.meals.save(meal([await bananaItem(500)], { eatenAt: new Date('2026-06-16T18:00:00Z') }));

    const { totals } = await h.repos.meals.getDay('2026-06-15');
    expect(totals.kcal).toBeCloseTo(178);
    expect(totals.protein).toBeCloseTo(2.18);
    expect(totals.carbs).toBeCloseTo(45.68);
    expect(totals.fat).toBeCloseTo(0.66);
    expect(totals.fiber).toBeCloseTo(5.2);
    expect(totals).not.toHaveProperty('vit_c'); // never reported, so not zero
    expect(await h.repos.meals.dayTotals('2026-06-15')).toEqual(totals);

    const empty = await h.repos.meals.getDay('2026-06-01');
    expect(empty.totals).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });

    const range = await h.repos.meals.totalsByDay('2026-06-14', '2026-06-16');
    expect(range.map((d) => d.localDate)).toEqual(['2026-06-15', '2026-06-16']);
    expect(range[1]?.totals.kcal).toBeCloseTo(445);
  });

  it('is atomic: a failure in the middle of the save stores nothing', async () => {
    const good = await bananaItem(100);
    const bad = { ...(await bananaItem(100)), foodSource: 'bogus' as never };
    await expect(h.repos.meals.save(meal([good, bad]))).rejects.toThrow();
    expect(count('meal')).toBe(0);
    expect(count('meal_item')).toBe(0);
    expect(count('meal_item_nutrient')).toBe(0);
    expect(count('food_usage')).toBe(0);
    // And the connection is usable afterwards.
    await expect(h.repos.meals.save(meal([good]))).resolves.toBeDefined();
    expect(count('meal')).toBe(1);
  });

  it('rejects numbers that cannot be stored before touching the database', async () => {
    const item = await bananaItem(100);
    await expectDataError(h.repos.meals.save(meal([{ ...item, grams: -1 }])), 'invalid_input');
    await expectDataError(h.repos.meals.save(meal([{ ...item, grams: Number.NaN }])), 'invalid_input');
    await expectDataError(h.repos.meals.save(meal([{ ...item, nutrients: { kcal: Number.POSITIVE_INFINITY } }])), 'invalid_input');
    await expectDataError(h.repos.meals.save(meal([])), 'invalid_input');
    expect(count('meal')).toBe(0);
  });

  it('records recents for the foods it saves, in the same transaction', async () => {
    await h.repos.meals.save(meal([await bananaItem(150), await bananaItem(80)]));
    const recents = await h.repos.foodUsage.recents(10);
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ foodSource: 'catalog', foodRef: '1001', useCount: 2, lastGrams: 80 });
  });
});

describe('deleting', () => {
  it('removes the items and their nutrient snapshots with the meal (cascade)', async () => {
    const m = await h.repos.meals.save(meal([await bananaItem(100), await bananaItem(200)]));
    const other = await h.repos.meals.save(meal([await bananaItem(100)], { slot: 'snack' }));
    expect(count('meal_item')).toBe(3);

    await h.repos.meals.deleteMeal(m.id);
    expect(count('meal')).toBe(1);
    expect(count('meal_item')).toBe(1);
    expect(count('meal_item_nutrient')).toBe(2);
    expect((await h.repos.meals.getMeal(other.id))?.items).toHaveLength(1);
    expect(await h.repos.meals.getMeal(m.id)).toBeNull();
  });

  it('deletes one item with its snapshot and updates the day totals', async () => {
    const m = await h.repos.meals.save(meal([await bananaItem(100), await bananaItem(200)]));
    const [a, b] = m.items;
    expect(await h.repos.meals.deleteItem(a!.id)).toBe(m.id); // the meal it belonged to (Health Connect updates that meal's record)
    const day = await h.repos.meals.getDay('2026-06-15');
    expect(day.meals[0]?.items.map((i) => i.id)).toEqual([b!.id]);
    expect(day.totals.kcal).toBeCloseTo(178);
    expect(count('meal_item_nutrient')).toBe(2);
  });

  it('lists the id of every saved meal, oldest first', async () => {
    expect(await h.repos.meals.listIds()).toEqual([]);
    const late = await h.repos.meals.save(meal([await bananaItem(100)], { eatenAt: new Date('2026-06-16T10:00:00.000Z') }));
    const early = await h.repos.meals.save(meal([await bananaItem(100)], { eatenAt: new Date('2026-06-14T10:00:00.000Z') }));
    expect(await h.repos.meals.listIds()).toEqual([early.id, late.id]);
  });

  it('reports unknown ids', async () => {
    await expectDataError(h.repos.meals.deleteMeal('nope'), 'not_found');
    await expectDataError(h.repos.meals.deleteItem('nope'), 'not_found');
    await expectDataError(h.repos.meals.updateItemGrams('nope', 10), 'not_found');
  });
});

describe('editing grams', () => {
  it('recalculates the snapshot from the catalog food and the day totals follow', async () => {
    const m = await h.repos.meals.save(meal([await bananaItem(100, { origin: 'ai' }), await bananaItem(100)]));
    const edited = await h.repos.meals.updateItemGrams(m.items[0]!.id, 250);

    expect(edited.grams).toBe(250);
    expect(edited.kcal).toBeCloseTo(222.5);
    expect(edited.proteinG).toBeCloseTo(2.725);
    expect(edited.nutrients.fiber).toBeCloseTo(6.5);
    expect(edited.origin).toBe('ai_edited'); // the user changed what the AI detected

    const day = await h.repos.meals.getDay('2026-06-15');
    expect(day.totals.kcal).toBeCloseTo(222.5 + 89);
    expect(day.totals.fiber).toBeCloseTo(6.5 + 2.6);
    expect(count('meal_item_nutrient')).toBe(4); // replaced, not duplicated
    expect(day.meals[0]?.items[1]?.origin).toBe('manual');
    expect(day.meals[0]?.updatedAt).toBe('2026-06-15T12:00:00.000Z');
  });

  it('drops a snapshot nutrient the source food does not report', async () => {
    const m = await h.repos.meals.save(meal([await bananaItem(100, { nutrients: { kcal: 89, protein: 1, carbs: 22, fat: 0.3, vit_c: 9 } })]));
    const edited = await h.repos.meals.updateItemGrams(m.items[0]!.id, 100);
    expect(edited.nutrients).not.toHaveProperty('vit_c');
    expect(edited.nutrients.fiber).toBeCloseTo(2.6);
  });

  it('uses the custom food, and scales the snapshot for an AI estimate that has no source food', async () => {
    const granola = await h.repos.customFoods.create({
      name: 'Granola', kcal100g: 400, protein100g: 10, carbs100g: 60, fat100g: 12, otherNutrients: { fiber: 8 },
    });
    const customNutrients = (g: number): NutrientAmounts => ({ kcal: 4 * g, protein: g / 10, carbs: 0.6 * g, fat: 0.12 * g, fiber: 0.08 * g });
    const m = await h.repos.meals.save(
      meal([
        { displayName: 'Granola', grams: 50, foodSource: 'custom', foodRef: granola.id, origin: 'manual', nutrients: customNutrients(50) },
        { displayName: 'Guiso', grams: 200, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 300, protein: 20, carbs: 30, fat: 10, sodium: 600 } },
      ]),
    );
    const g = await h.repos.meals.updateItemGrams(m.items[0]!.id, 100);
    expect(g).toMatchObject({ kcal: 400, proteinG: 10, carbsG: 60 });
    expect(g.nutrients.fiber).toBeCloseTo(8);

    const e = await h.repos.meals.updateItemGrams(m.items[1]!.id, 100);
    expect(e).toMatchObject({ kcal: 150, proteinG: 10, carbsG: 15, fatG: 5, origin: 'ai_edited' });
    expect(e.nutrients.sodium).toBeCloseTo(300);
  });

  it('scales the existing snapshot when the source food no longer exists', async () => {
    const granola = await h.repos.customFoods.create({ name: 'Granola', kcal100g: 400, protein100g: 10, carbs100g: 60, fat100g: 12 });
    const m = await h.repos.meals.save(
      meal([{ displayName: 'Granola', grams: 50, foodSource: 'custom', foodRef: granola.id, origin: 'manual', nutrients: { kcal: 200, protein: 5, carbs: 30, fat: 6 } }]),
    );
    await h.repos.customFoods.delete(granola.id);
    const edited = await h.repos.meals.updateItemGrams(m.items[0]!.id, 150);
    expect(edited).toMatchObject({ kcal: 600, proteinG: 15, carbsG: 90, fatG: 18 });
  });

  it('uses a cached barcode product', async () => {
    h.db.run(
      sql`INSERT INTO barcode_product (barcode, name, kcal_100g, protein_100g, carbs_100g, fat_100g, other_nutrients_json, fetched_at)
          VALUES ('7501', 'Galletas', 450, 6, 70, 16, '{"sodium": 400}', '2026-06-01T00:00:00Z')`,
    );
    const m = await h.repos.meals.save(
      meal([{ displayName: 'Galletas', grams: 20, foodSource: 'barcode', foodRef: '7501', origin: 'manual', nutrients: { kcal: 90, protein: 1.2, carbs: 14, fat: 3.2 } }]),
    );
    const edited = await h.repos.meals.updateItemGrams(m.items[0]!.id, 40);
    expect(edited.kcal).toBeCloseTo(180);
    expect(edited.proteinG).toBeCloseTo(2.4);
    expect(edited.carbsG).toBeCloseTo(28);
    expect(edited.fatG).toBeCloseTo(6.4);
    expect(edited.nutrients.sodium).toBeCloseTo(160);
  });

  it('rejects invalid grams and leaves the item as it was', async () => {
    const m = await h.repos.meals.save(meal([await bananaItem(100)]));
    const id = m.items[0]!.id;
    for (const grams of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expectDataError(h.repos.meals.updateItemGrams(id, grams), 'invalid_input');
    }
    const item = (await h.repos.meals.getMeal(m.id))?.items[0];
    expect(item).toMatchObject({ grams: 100, kcal: 89 });
  });

  it('keeps nothing half-edited when the update fails in the middle', async () => {
    const m = await h.repos.meals.save(meal([await bananaItem(100)]));
    // Make the second write of the edit (the nutrient re-insert) fail.
    h.db.run(sql`CREATE TRIGGER block_nutrients BEFORE INSERT ON meal_item_nutrient BEGIN SELECT RAISE(ABORT, 'blocked'); END`);
    await expect(h.repos.meals.updateItemGrams(m.items[0]!.id, 300)).rejects.toThrow();
    h.db.run(sql`DROP TRIGGER block_nutrients`);
    const item = (await h.repos.meals.getMeal(m.id))?.items[0];
    expect(item).toMatchObject({ grams: 100, kcal: 89 });
    expect(item?.nutrients.fiber).toBeCloseTo(2.6);
  });
});

describe('history is stable', () => {
  it('does not change a logged meal when the custom food is edited afterwards', async () => {
    const granola = await h.repos.customFoods.create({ name: 'Granola', kcal100g: 400, protein100g: 10, carbs100g: 60, fat100g: 12 });
    const m = await h.repos.meals.save(
      meal([{ displayName: 'Granola', grams: 50, foodSource: 'custom', foodRef: granola.id, origin: 'manual', nutrients: { kcal: 200, protein: 5, carbs: 30, fat: 6 } }]),
    );
    await h.repos.customFoods.update(granola.id, { kcal100g: 800, protein100g: 20 });

    const day = await h.repos.meals.getDay('2026-06-15');
    expect(day.meals[0]?.items[0]).toMatchObject({ kcal: 200, proteinG: 5 });
    expect(day.totals).toMatchObject({ kcal: 200, protein: 5 });

    // Only an explicit edit of that item picks up the food's current values.
    const edited = await h.repos.meals.updateItemGrams(m.items[0]!.id, 50);
    expect(edited.kcal).toBe(400);
  });
});

describe('updateMeal', () => {
  it('changes the slot, name and note', async () => {
    const m = await h.repos.meals.save(meal([await bananaItem(100)]));
    h.setNow('2026-06-16T08:00:00.000Z');
    const updated = await h.repos.meals.updateMeal(m.id, { slot: 'lunch', name: 'Almuerzo', note: null });
    expect(updated).toMatchObject({ slot: 'lunch', name: 'Almuerzo', note: null, updatedAt: '2026-06-16T08:00:00.000Z', createdAt: '2026-06-15T12:00:00.000Z' });
    await expectDataError(h.repos.meals.updateMeal('nope', { slot: 'lunch' }), 'not_found');
  });
});
