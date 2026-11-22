import { computeItemNutrients, convert, sumNutrients } from '..';

describe('computeItemNutrients', () => {
  // Cooked white rice, hand-calculated: values per 100 g scaled to 150 g (x1.5).
  const rice = { per100g: { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4, sodium: 1 } };

  it('scales every nutrient from per-100 g to the given grams', () => {
    const n = computeItemNutrients(rice, 150);
    expect(n.kcal).toBeCloseTo(195, 6);
    expect(n.protein).toBeCloseTo(4.05, 6);
    expect(n.carbs).toBeCloseTo(42.3, 6);
    expect(n.fat).toBeCloseTo(0.45, 6);
    expect(n.fiber).toBeCloseTo(0.6, 6);
    expect(n.sodium).toBeCloseTo(1.5, 6);
  });

  it('leaves nutrients the food does not report absent instead of zero', () => {
    const n = computeItemNutrients(rice, 100);
    expect(n.zinc).toBeUndefined();
    expect('zinc' in n).toBe(false);
  });

  it('returns zeros for zero grams and rejects negative or non-finite grams', () => {
    expect(computeItemNutrients(rice, 0).kcal).toBe(0);
    expect(() => computeItemNutrients(rice, -1)).toThrow(RangeError);
    expect(() => computeItemNutrients(rice, Number.NaN)).toThrow(RangeError);
  });
});

describe('sumNutrients', () => {
  it('adds per nutrient and treats a nutrient missing from one item as unknown, not zero', () => {
    const total = sumNutrients([
      { kcal: 195, protein: 4.05, fiber: 0.6 },
      { kcal: 105, protein: 1.3 },
    ]);
    expect(total.kcal).toBeCloseTo(300, 6);
    expect(total.protein).toBeCloseTo(5.35, 6);
    expect(total.fiber).toBeCloseTo(0.6, 6);
    expect(total.zinc).toBeUndefined();
  });

  it('returns an empty object for an empty list', () => {
    expect(sumNutrients([])).toEqual({});
  });
});

describe('convert', () => {
  it('converts mass units', () => {
    expect(convert(1, 'kg', 'g')).toBeCloseTo(1000, 9);
    expect(convert(500, 'mg', 'g')).toBeCloseTo(0.5, 9);
    expect(convert(2500, 'ug', 'mg')).toBeCloseTo(2.5, 9);
    expect(convert(1, 'oz', 'g')).toBeCloseTo(28.349523125, 6);
    expect(convert(1, 'lb', 'oz')).toBeCloseTo(16, 6);
  });

  it('converts energy and volume units', () => {
    expect(convert(100, 'kcal', 'kj')).toBeCloseTo(418.4, 6);
    expect(convert(418.4, 'kj', 'kcal')).toBeCloseTo(100, 6);
    expect(convert(1.5, 'l', 'ml')).toBeCloseTo(1500, 9);
  });

  it('is the identity for the same unit', () => {
    expect(convert(42, 'g', 'g')).toBe(42);
  });

  it('refuses to convert between different dimensions', () => {
    expect(() => convert(1, 'g', 'ml')).toThrow(RangeError);
    expect(() => convert(1, 'kcal', 'g')).toThrow(RangeError);
  });
});
