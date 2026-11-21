/** @jest-environment node */
import { aggregate } from '../metrics/aggregate';
import { pairItems } from '../metrics/pairing';
import { mean, median, percentile } from '../metrics/stats';
import type { MealOutcome } from '../types';

const base: MealOutcome = {
  id: 'x',
  isFood: true,
  status: 'ok',
  repaired: false,
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
  detectedCount: 0,
  truthCount: 0,
  pairs: [],
  trueNutrients: null,
  predictedNutrients: null,
};
const meal = (o: Partial<MealOutcome>): MealOutcome => ({ ...base, ...o });

const A = meal({
  id: 'A',
  latencyMs: 1000,
  inputTokens: 800,
  outputTokens: 200,
  detectedCount: 4,
  truthCount: 4,
  pairs: [
    { trueGrams: 100, predictedGrams: 110, matched: true },
    { trueGrams: 200, predictedGrams: 160, matched: true },
    { trueGrams: 50, predictedGrams: 50, matched: false },
  ],
  trueNutrients: { kcal: 500, protein: 30, carbs: 50, fat: 20 },
  predictedNutrients: { kcal: 550, protein: 24, carbs: 50, fat: 25 },
});
const B = meal({
  id: 'B',
  repaired: true,
  latencyMs: 3000,
  inputTokens: 1000,
  outputTokens: 300,
  detectedCount: 2,
  truthCount: 2,
  pairs: [
    { trueGrams: 100, predictedGrams: 130, matched: true },
    { trueGrams: 100, predictedGrams: 70, matched: true },
  ],
  trueNutrients: { kcal: 400, protein: 20, carbs: 40, fat: 10 },
  predictedNutrients: { kcal: 340, protein: 20, carbs: 60, fat: 10 },
});
const C = meal({ id: 'C', status: 'no_food', latencyMs: 500, truthCount: 1, trueNutrients: { kcal: 300, protein: 1, carbs: 1, fat: 1 } });
const D = meal({ id: 'D', isFood: false, status: 'no_food', latencyMs: 700 });
const E = meal({ id: 'E', isFood: false, status: 'ok', latencyMs: 2000, detectedCount: 1 });
const F = meal({ id: 'F', status: 'invalid_output', latencyMs: 4000, truthCount: 3, trueNutrients: { kcal: 300, protein: 1, carbs: 1, fat: 1 } });
const G = meal({ id: 'G', status: 'failed', truthCount: 2 });

describe('stats', () => {
  it('mean, median, and nearest-rank percentile', () => {
    expect(mean([1, 2, 6])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
  });
  it('returns null for empty input', () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
    expect(percentile([], 0.95)).toBeNull();
  });
});

describe('pairItems', () => {
  it('pairs by normalized name, aliases, and whole-word containment', () => {
    const pairs = pairItems(
      [{ names: ['Pollo a la plancha', 'chicken breast, grilled'] }, { names: ['Arroz', 'white rice, cooked', 'rice'] }, { names: ['Ketchup'] }],
      [{ names: ['Rice, white'] }, { names: ['chicken breast'] }],
    );
    expect(pairs).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });
  it('is one to one: a second detection of the same food stays unpaired', () => {
    expect(pairItems([{ names: ['rice'] }, { names: ['rice'] }], [{ names: ['rice'] }])).toEqual([[0, 0]]);
  });
  it('prefers an exact match over a containment match', () => {
    expect(pairItems([{ names: ['rice pudding'] }, { names: ['rice'] }], [{ names: ['rice'] }])).toEqual([[1, 0]]);
  });
  it('handles empty lists', () => {
    expect(pairItems([], [{ names: ['rice'] }])).toEqual([]);
    expect(pairItems([{ names: ['rice'] }], [])).toEqual([]);
  });
});

describe('aggregate', () => {
  const m = aggregate([A, B, C, D, E, F, G]);

  it('counts meals', () => {
    expect(m.counts).toEqual({ total: 7, food: 5, nonFood: 2, scored: 6, failed: 1 });
  });
  it('item precision and recall over scored food meals', () => {
    expect(m.itemPrecision).toBeCloseTo(5 / 6, 10);
    expect(m.itemRecall).toBeCloseTo(0.5, 10);
  });
  it('portion error and signed bias over identified items', () => {
    expect(m.portionMape).toBeCloseTo(0.18, 10);
    expect(m.portionBias).toBeCloseTo(-0.02, 10);
  });
  it('matching rate over identified items', () => {
    expect(m.matchingRate).toBeCloseTo(0.8, 10);
  });
  it('energy and macronutrient error over meals with a usable answer', () => {
    expect(m.energyMape).toBeCloseTo(0.125, 10);
    expect(m.proteinMape).toBeCloseTo(0.1, 10);
    expect(m.carbsMape).toBeCloseTo(0.25, 10);
    expect(m.fatMape).toBeCloseTo(0.125, 10);
  });
  it('within ±10% and ±20% count unusable answers as misses, boundary included', () => {
    expect(m.within10).toBeCloseTo(0.25, 10);
    expect(m.within20).toBeCloseTo(0.5, 10);
  });
  it('valid output on first attempt and after repair', () => {
    expect(m.validFirstAttempt).toBeCloseTo(4 / 6, 10);
    expect(m.validAfterRepair).toBeCloseTo(5 / 6, 10);
  });
  it('latency and tokens', () => {
    expect(m.latencyMedianMs).toBe(1500);
    expect(m.latencyP95Ms).toBe(4000);
    expect(m.inputTokensPerScan).toBe(900);
    expect(m.outputTokensPerScan).toBe(250);
  });
  it('no-food rate on food and non-food photos', () => {
    expect(m.noFoodRateFoodPhotos).toBeCloseTo(0.25, 10);
    expect(m.noFoodRateNonFoodPhotos).toBeCloseTo(0.5, 10);
  });

  it('empty input gives null metrics, not NaN', () => {
    const e = aggregate([]);
    expect(e.counts).toEqual({ total: 0, food: 0, nonFood: 0, scored: 0, failed: 0 });
    for (const [key, value] of Object.entries(e)) {
      if (key !== 'counts') expect(value).toBeNull();
    }
  });
  it('a single meal works', () => {
    const s = aggregate([A]);
    expect(s.itemPrecision).toBeCloseTo(0.75, 10);
    expect(s.itemRecall).toBeCloseTo(0.75, 10);
    expect(s.energyMape).toBeCloseTo(0.1, 10);
    expect(s.latencyMedianMs).toBe(1000);
    expect(s.latencyP95Ms).toBe(1000);
    expect(s.noFoodRateNonFoodPhotos).toBeNull();
    expect(s.validFirstAttempt).toBe(1);
  });
  it('only failed meals leave every rate null', () => {
    const f = aggregate([G]);
    expect(f.counts.failed).toBe(1);
    expect(f.counts.scored).toBe(0);
    expect(f.validAfterRepair).toBeNull();
    expect(f.within20).toBeNull();
  });
});
