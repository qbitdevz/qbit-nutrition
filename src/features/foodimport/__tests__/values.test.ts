/** @jest-environment node */
import { NUTRIENT_UNITS, parseSourceUnit, toNutrientUnit, unitRule } from '@/core/nutrition';
import { MISSING_MARKERS, detectDecimal, parseValue } from '../values';

describe('reading a value', () => {
  it('reads a decimal point and a decimal comma', () => {
    expect(parseValue('52.5', '.')).toEqual({ kind: 'number', value: 52.5 });
    expect(parseValue('52,5', ',')).toEqual({ kind: 'number', value: 52.5 });
    expect(parseValue('0,003', ',')).toEqual({ kind: 'number', value: 0.003 });
    expect(parseValue(' 7 ', '.')).toEqual({ kind: 'number', value: 7 });
    expect(parseValue(12.75, '.')).toEqual({ kind: 'number', value: 12.75 });
    expect(parseValue('1e-3', '.')).toEqual({ kind: 'number', value: 0.001 });
  });
  it('reads the other separator too when the number cannot be anything else, and thousands separators', () => {
    expect(parseValue('52,5', '.')).toEqual({ kind: 'number', value: 52.5 });
    expect(parseValue('52.5', ',')).toEqual({ kind: 'number', value: 52.5 });
    expect(parseValue('1.234,5', ',')).toEqual({ kind: 'number', value: 1234.5 });
    expect(parseValue('1,234.5', '.')).toEqual({ kind: 'number', value: 1234.5 });
    expect(parseValue('1.234', ',')).toEqual({ kind: 'number', value: 1234 });
    expect(parseValue('1,234', '.')).toEqual({ kind: 'number', value: 1234 });
    expect(parseValue('0,125', ',')).toEqual({ kind: 'number', value: 0.125 });
    expect(parseValue('0.125', ',')).toEqual({ kind: 'number', value: 0.125 });
  });
  it('reads brackets around a number as the number', () => {
    expect(parseValue('(0,3)', ',')).toEqual({ kind: 'number', value: 0.3 });
    expect(parseValue('[12.5]', '.')).toEqual({ kind: 'number', value: 12.5 });
  });
  it('turns every missing-value marker into unknown, never zero', () => {
    for (const marker of ['', null, '-', '–', '—', 'tr', 'Tr', 'TR.', 'traces', 'Trazas', 'traço', 'nd', 'N.D.', 'n/d', 'NA', 'n.a.', 'nc', 'sd', 's/d', 'no detectado', 'non détecté', '<0,1', '< 0.5', '<LOQ', '?', 'x']) {
      expect(parseValue(marker, ',').kind).toBe('missing');
    }
    expect(parseValue('0', '.')).toEqual({ kind: 'number', value: 0 });
    expect(parseValue(0, '.')).toEqual({ kind: 'number', value: 0 });
  });
  it('calls text that is not a number unreadable (it is reported, and stays unknown)', () => {
    expect(parseValue('abc', '.').kind).toBe('invalid');
    expect(parseValue('1,2,3', '.').kind).toBe('invalid');
    expect(parseValue('12 g', '.').kind).toBe('invalid');
  });
  it('lists the markers, to show them to the person', () => {
    expect(MISSING_MARKERS).toEqual(expect.arrayContaining(['-', 'tr', 'nd', 'n/d']));
  });
  it('detects the decimal separator of a text table from its numbers', () => {
    expect(detectDecimal([['a', '52,5', '1,25'], ['b', '3,2', 7]])).toBe(',');
    expect(detectDecimal([['a', '52.5', '1.25']])).toBe('.');
    expect(detectDecimal([['a', 52.5, 7]])).toBe('.');
    expect(detectDecimal([['a', '1,234', '2,345']])).toBe('.');
  });
});

describe('unit conversions, against hand-calculated values', () => {
  it('stores each nutrient in the catalog unit', () => {
    expect(NUTRIENT_UNITS.kcal).toBe('kcal');
    expect(NUTRIENT_UNITS.sodium).toBe('mg');
    expect(NUTRIENT_UNITS.vit_c).toBe('mg');
    expect(NUTRIENT_UNITS.vit_d).toBe('ug');
    expect(NUTRIENT_UNITS.protein).toBe('g');
  });
  it('converts energy: kJ / 4.184 = kcal', () => {
    expect(toNutrientUnit(1000, 'kj', 'kcal')).toBe(1000 / 4.184);
    expect(toNutrientUnit(1000, 'kj', 'kcal')).toBeCloseTo(239.00573613766731, 10);
    expect(toNutrientUnit(4.184, 'kj', 'kcal')).toBe(1);
    expect(toNutrientUnit(52.5, 'kcal', 'kcal')).toBe(52.5);
  });
  it('converts mass by exact powers of ten', () => {
    expect(toNutrientUnit(491, 'mg', 'protein')).toBe(0.491); // mg to g
    expect(toNutrientUnit(1.5, 'g', 'sodium')).toBe(1500); // g to mg
    expect(toNutrientUnit(250, 'ug', 'calcium')).toBe(0.25); // µg to mg
    expect(toNutrientUnit(0.3, 'mg', 'vit_b12')).toBe(300); // mg to µg
    expect(toNutrientUnit(2, 'g', 'folate')).toBe(2_000_000);
    expect(toNutrientUnit(7, 'ug', 'protein')).toBe(0.000007);
    expect(toNutrientUnit(0.29, 'mg', 'iron')).toBe(0.29);
  });
  it('converts vitamin D from IU (40 IU = 1 µg) and refuses IU where there is no exact factor', () => {
    expect(toNutrientUnit(400, 'iu', 'vit_d')).toBe(10);
    expect(unitRule('iu', 'vit_a')).toEqual({ kind: 'refused', reason: 'iu_ambiguous' });
    expect(toNutrientUnit(100, 'iu', 'vit_a')).toBeNull();
    expect(toNutrientUnit(100, 'iu', 'vit_c')).toBeNull();
  });
  it('refuses a unit of another kind of quantity', () => {
    expect(unitRule('mg', 'kcal')).toEqual({ kind: 'refused', reason: 'incompatible' });
    expect(unitRule('kj', 'sodium')).toEqual({ kind: 'refused', reason: 'incompatible' });
  });
  it('recognises unit names', () => {
    expect(parseSourceUnit('µg')).toBe('ug');
    expect(parseSourceUnit('μg')).toBe('ug');
    expect(parseSourceUnit('MCG')).toBe('ug');
    expect(parseSourceUnit('kJ')).toBe('kj');
    expect(parseSourceUnit('UI')).toBe('iu');
    expect(parseSourceUnit('furlong')).toBeNull();
  });
});
