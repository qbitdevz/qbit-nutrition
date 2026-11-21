import { mapProduct, isComplete, MAX_SERVING_G } from '..';
import type { OffProduct } from '../offSchema';
import { nutellaNutriments } from '../__fixtures__/off';

const product = (over: Record<string, unknown>): OffProduct => ({ nutriments: {}, ...over }) as OffProduct;
const map = (over: Record<string, unknown>, locale: 'en' | 'es' = 'en') => mapProduct(product(over), locale);

describe('mapping an Open Food Facts product to per-100 g values', () => {
  it('maps a complete product (calories as reported, sodium in mg)', () => {
    const mapped = map({ product_name: 'Nutella', brands: 'Ferrero, Other', nutriments: nutellaNutriments });
    expect(mapped.name).toBe('Nutella');
    expect(mapped.brand).toBe('Ferrero');
    expect(mapped.per100g).toEqual({
      kcal: 539,
      protein: 6.3,
      carbs: 57.5,
      fat: 30.9,
      sugars: 56.3,
      sat_fat: 10.6,
      sodium: 43, // 0.043 g = 43 mg
    });
    expect(mapped.missing).toEqual([]);
    expect(mapped.inconsistent).toBe(false);
    expect(isComplete(mapped)).toBe(true);
    expect(mapped.servingG).toBeNull();
  });

  describe('units as the service reports them', () => {
    it('converts energy in kJ to kcal (1000 kJ / 4.184 = 239.0 kcal)', () => {
      const mapped = map({ nutriments: { 'energy-kj_100g': 1000, proteins_100g: 10, carbohydrates_100g: 40, fat_100g: 4 } });
      expect(mapped.per100g.kcal).toBeCloseTo(239.0, 1);
    });

    it('reads the plain energy value as kJ (the service default) unless it says kcal', () => {
      expect(map({ nutriments: { energy_100g: 1000 } }).per100g.kcal).toBeCloseTo(239.0, 1);
      expect(map({ nutriments: { energy_100g: 250, energy_unit: 'kcal' } }).per100g.kcal).toBe(250);
    });

    it('prefers the kcal value over a kJ value when both are given', () => {
      expect(map({ nutriments: { 'energy-kcal_100g': 100, 'energy-kj_100g': 9999 } }).per100g.kcal).toBe(100);
    });

    it('turns salt into sodium (1.5 g salt = 600 mg sodium) only when sodium is not reported', () => {
      expect(map({ nutriments: { salt_100g: 1.5 } }).per100g.sodium).toBeCloseTo(600, 6);
      expect(map({ nutriments: { salt_100g: 1.5, sodium_100g: 0.2 } }).per100g.sodium).toBeCloseTo(200, 6);
    });

    it('converts grams to the catalog units: mg minerals, µg vitamins', () => {
      const mapped = map({
        nutriments: { calcium_100g: 0.12, iron_100g: 0.0014, 'vitamin-c_100g': 0.08, 'vitamin-d_100g': 0.000005, 'vitamin-b12_100g': 0.0000024, 'vitamin-b9_100g': 0.0002 },
      });
      expect(mapped.per100g.calcium).toBeCloseTo(120, 6);
      expect(mapped.per100g.iron).toBeCloseTo(1.4, 6);
      expect(mapped.per100g.vit_c).toBeCloseTo(80, 6);
      expect(mapped.per100g.vit_d).toBeCloseTo(5, 6);
      expect(mapped.per100g.vit_b12).toBeCloseTo(2.4, 6);
      expect(mapped.per100g.folate).toBeCloseTo(200, 6);
    });

    it('rescales per-serving values to 100 g with the serving size (30 g serving: 6 g protein = 20 g per 100 g)', () => {
      const mapped = map({
        product_name: 'Bar',
        serving_quantity: 30,
        nutrition_data_per: 'serving',
        nutriments: { 'energy-kcal_serving': 147, proteins_serving: 6, carbohydrates_serving: 24, fat_serving: 3 },
      });
      expect(mapped.per100g).toEqual({ kcal: 490, protein: 20, carbs: 80, fat: 10 });
      expect(mapped.servingG).toBe(30);
      expect(mapped.missing).toEqual([]);
    });

    it('prefers per-100 g values over per-serving ones', () => {
      const mapped = map({ serving_quantity: 30, nutriments: { proteins_100g: 8, proteins_serving: 6 } });
      expect(mapped.per100g.protein).toBe(8);
    });

    it('does not rescale per-serving values when the serving size is unknown: they are missing', () => {
      const mapped = map({ nutriments: { proteins_serving: 6 } });
      expect(mapped.per100g.protein).toBeUndefined();
      expect(mapped.missing).toContain('protein');
    });

    it('reads numbers sent as text, with a decimal comma', () => {
      expect(map({ nutriments: { proteins_100g: '12,5', fat_100g: '3.5' } }).per100g).toMatchObject({ protein: 12.5, fat: 3.5 });
    });
  });

  describe('serving size', () => {
    it.each([
      [{ serving_quantity: 30, serving_quantity_unit: 'g' }, 30],
      [{ serving_quantity: '45.5' }, 45.5],
      [{ serving_size: '45 g' }, 45],
      [{ serving_size: '12,5g' }, 12.5],
      [{ serving_quantity: 250, serving_quantity_unit: 'ml' }, null], // millilitres are not grams; no density is invented
      [{ serving_size: '1 cup (240 ml)' }, null],
      [{ serving_quantity: 0 }, null],
      [{ serving_quantity: MAX_SERVING_G + 1 }, null],
      [{}, null],
    ])('%j -> %s g', (fields, grams) => {
      expect(map(fields).servingG).toBe(grams);
    });
  });

  describe('missing, out-of-range and implausible values', () => {
    it('lists the missing headline values and never invents them', () => {
      const mapped = map({ product_name: 'Mystery', nutriments: { proteins_100g: 3 } });
      expect(mapped.per100g).toEqual({ protein: 3 });
      expect(mapped.missing).toEqual(['kcal', 'carbs', 'fat']);
      expect(isComplete(mapped)).toBe(false);
    });

    it('reports a missing name', () => {
      const mapped = map({ nutriments: nutellaNutriments });
      expect(mapped.name).toBe('');
      expect(mapped.missing).toEqual(['name']);
    });

    it.each([
      ['negative', { 'energy-kcal_100g': -5 }, 'kcal'],
      ['more than 1,000 kcal', { 'energy-kcal_100g': 5000 }, 'kcal'],
      ['more than 100 g of protein', { proteins_100g: 150 }, 'protein'],
      ['not a number', { fat_100g: 'a lot' }, 'fat'],
      ['not finite', { carbohydrates_100g: 'Infinity' }, 'carbs'],
    ])('treats a value that is %s as missing', (_label, nutriments, field) => {
      const mapped = map({ nutriments });
      expect(mapped.missing).toContain(field);
    });

    it('flags energy that does not match the macronutrients, keeping the values as reported', () => {
      const mapped = map({ product_name: 'x', nutriments: { 'energy-kcal_100g': 900, proteins_100g: 5, carbohydrates_100g: 5, fat_100g: 5 } });
      expect(mapped.inconsistent).toBe(true);
      expect(mapped.per100g).toMatchObject({ kcal: 900, protein: 5, carbs: 5, fat: 5 });
      expect(isComplete(mapped)).toBe(false);
    });

    it('flags macronutrients that add up to more than 100 g', () => {
      const mapped = map({ nutriments: { 'energy-kcal_100g': 560, proteins_100g: 60, carbohydrates_100g: 60, fat_100g: 10 } });
      expect(mapped.inconsistent).toBe(true);
    });

    it('does not flag consistency when something is missing (the missing value is the problem)', () => {
      expect(map({ nutriments: { 'energy-kcal_100g': 900, proteins_100g: 5 } }).inconsistent).toBe(false);
    });
  });

  describe('names', () => {
    const names = { product_name: 'Generic', product_name_en: 'English', product_name_es: 'Español' };
    it('prefers the name in the app language, then the plain one, then English', () => {
      expect(map(names, 'es').name).toBe('Español');
      expect(map(names, 'en').name).toBe('Generic');
      expect(map({ product_name: '  ', product_name_en: 'English' }, 'es').name).toBe('English');
    });

    it('keeps names on one line and bounded', () => {
      expect(map({ product_name: ' Choco\n\tcream  ' }).name).toBe('Choco cream');
      expect(map({ product_name: 'x'.repeat(1000) }).name).toHaveLength(120);
    });
  });
});
