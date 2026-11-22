/** @jest-environment node */
import { createHarness, type Harness } from '@/data/testing/harness';
import type { SaveMealItemInput } from '@/data';
import { nutritionRecordForMeal } from '../record';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const item = (displayName: string, grams: number, nutrients: SaveMealItemInput['nutrients']): SaveMealItemInput => ({
  displayName,
  grams,
  foodSource: 'ai_estimate',
  foodRef: null,
  origin: 'ai',
  nutrients,
});

// Two items with numbers that add up by hand. The harness clock is 2026-06-15T12:00:00Z, so `updatedAt` is that instant.
const BANANA = item('Banana', 118, { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, sugars: 14.4, sodium: 1, potassium: 422, vit_c: 10.3, vit_a: 3 });
const YOGURT = item('Yogurt', 150, { kcal: 95, protein: 9, carbs: 7, fat: 3.5, fiber: 0, sugars: 7, sodium: 80, potassium: 250, vit_c: 1, vit_b12: 0.9, folate: 18 });

describe('nutritionRecordForMeal (docs/09 section 2.7)', () => {
  it('writes the meal as one record: its id, its time, its type, and the hand-calculated totals', async () => {
    const meal = await h.repos.meals.save({
      eatenAt: new Date('2026-06-15T18:30:00.000Z'),
      timeZone: 'America/Bogota',
      slot: 'dinner',
      source: 'manual',
      items: [BANANA, YOGURT],
    });
    const record = nutritionRecordForMeal(meal);

    expect(record.clientRecordId).toBe(meal.id);
    expect(record.mealType).toBe('dinner');
    // The record ends when the meal was eaten and starts a minute before.
    expect(record.endTime).toBe('2026-06-15T18:30:00.000Z');
    expect(record.startTime).toBe('2026-06-15T18:29:00.000Z');
    expect(record.clientRecordVersion).toBe(Date.parse('2026-06-15T12:00:00.000Z'));
    expect(record.name).toBe('Banana, Yogurt');

    // 105 + 95 kcal; every other value in grams: sodium 1 + 80 mg = 0.081 g; potassium 422 + 250 mg = 0.672 g.
    expect(record.energyKcal).toBeCloseTo(200, 9);
    const g = record.grams;
    expect(g.protein).toBeCloseTo(10.3, 9);
    expect(g.totalCarbohydrate).toBeCloseTo(34, 9);
    expect(g.totalFat).toBeCloseTo(3.9, 9);
    expect(g.dietaryFiber).toBeCloseTo(3.1, 9);
    expect(g.sugar).toBeCloseTo(21.4, 9);
    expect(g.sodium).toBeCloseTo(0.081, 9);
    expect(g.potassium).toBeCloseTo(0.672, 9);
    // Vitamin C: 10.3 + 1 mg = 0.0113 g.
    expect(g.vitaminC).toBeCloseTo(0.0113, 9);
  });

  it('leaves out a nutrient that only some items report, instead of writing a smaller number as a fact', async () => {
    const meal = await h.repos.meals.save({ eatenAt: new Date('2026-06-15T18:30:00.000Z'), slot: 'lunch', source: 'manual', items: [BANANA, YOGURT] });
    const g = nutritionRecordForMeal(meal).grams;
    // Vitamin A (banana only), B12 and folate (yogurt only), and everything the catalog does not know.
    expect(g.vitaminA).toBeUndefined();
    expect(g.vitaminB12).toBeUndefined();
    expect(g.folate).toBeUndefined();
    expect(g.calcium).toBeUndefined();
    expect(Object.keys(g).sort()).toEqual(['dietaryFiber', 'potassium', 'protein', 'sodium', 'sugar', 'totalCarbohydrate', 'totalFat', 'vitaminC']);
  });

  it('converts micrograms to grams and writes a nutrient when every item reports it', async () => {
    const meal = await h.repos.meals.save({
      eatenAt: new Date('2026-06-15T08:00:00.000Z'),
      slot: 'breakfast',
      name: 'Oats',
      source: 'manual',
      items: [item('Oats', 40, { kcal: 150, protein: 5, carbs: 27, fat: 3, vit_d: 2, folate: 12 }), item('Milk', 200, { kcal: 90, protein: 7, carbs: 10, fat: 3, vit_d: 2.5, folate: 10 })],
    });
    const record = nutritionRecordForMeal(meal);
    expect(record.name).toBe('Oats'); // the meal's own name wins
    expect(record.mealType).toBe('breakfast');
    expect(record.grams.vitaminD).toBeCloseTo(4.5e-6, 12); // 4.5 µg
    expect(record.grams.folate).toBeCloseTo(22e-6, 12);
  });

  it('writes zero energy for a meal of zero-calorie items and never a negative or missing energy', async () => {
    const meal = await h.repos.meals.save({ eatenAt: new Date('2026-06-15T08:00:00.000Z'), slot: 'snack', source: 'manual', items: [item('Water', 250, { kcal: 0, protein: 0, carbs: 0, fat: 0 })] });
    const record = nutritionRecordForMeal(meal);
    expect(record.energyKcal).toBe(0);
    expect(record.mealType).toBe('snack');
  });

  it('raises the record version with every edit, so Health Connect applies it', async () => {
    const meal = await h.repos.meals.save({ eatenAt: new Date('2026-06-15T08:00:00.000Z'), slot: 'lunch', source: 'manual', items: [BANANA] });
    const first = nutritionRecordForMeal(meal).clientRecordVersion;
    h.setNow('2026-06-15T12:00:05.000Z');
    const edited = await h.repos.meals.updateMeal(meal.id, { slot: 'dinner' });
    const second = nutritionRecordForMeal(edited);
    expect(second.clientRecordVersion).toBe(first + 5000);
    expect(second.mealType).toBe('dinner');
  });
});
