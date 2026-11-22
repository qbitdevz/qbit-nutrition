import { dedupeFoods, dedupeKey } from '../dedupe';
import type { SourceFood } from '../types';

const f = (source: SourceFood['source'], fdcId: number, description: string, portions: SourceFood['portions'] = []): SourceFood => ({
  source,
  fdcId,
  description,
  category: null,
  nutrients: [{ id: 1008, unit: 'kcal', amount: 100 }],
  portions,
});

describe('dedupeKey', () => {
  it('ignores case, plurals, punctuation and word order', () => {
    expect(dedupeKey('Bananas, raw')).toBe(dedupeKey('Banana, raw'));
    expect(dedupeKey('Oil, coconut')).toBe(dedupeKey('Coconut oil'));
    expect(dedupeKey('Cheese, cheddar')).toBe(dedupeKey('Cheese, Cheddar'));
  });

  it('keeps different foods apart', () => {
    expect(dedupeKey('Rice, white, cooked')).not.toBe(dedupeKey('Rice, white, raw'));
    expect(dedupeKey('Rice, brown, cooked')).not.toBe(dedupeKey('Rice, white, cooked'));
  });
});

describe('dedupeFoods', () => {
  it('keeps Foundation over SR Legacy over FNDDS for the same food, whatever the input order', () => {
    const fndds = f('usda_fndds', 3, 'Kale, raw');
    const sr = f('usda_sr_legacy', 2, 'Kale, raw');
    const foundation = f('usda_foundation', 1, 'Kale, raw');
    for (const input of [
      [fndds, sr, foundation],
      [foundation, fndds, sr],
      [sr, foundation, fndds],
    ]) {
      const { kept, dropped } = dedupeFoods(input);
      expect(kept.map((x) => x.fdcId)).toEqual([1]);
      expect(dropped.map((d) => [d.food.fdcId, d.keptId]).sort()).toEqual([
        [2, 1],
        [3, 1],
      ]);
    }
  });

  it('prefers SR Legacy over FNDDS, and keeps the input order of the survivors', () => {
    const { kept } = dedupeFoods([
      f('usda_fndds', 9, 'Nectarine, raw'),
      f('usda_fndds', 8, 'Empanada, beef'),
      f('usda_sr_legacy', 7, 'Nectarines, raw'),
    ]);
    expect(kept.map((x) => x.fdcId)).toEqual([8, 7]);
  });

  it('hands the household portions of a dropped duplicate to a survivor that has none, never overwriting its own', () => {
    const cup = [{ label: '1 cup', grams: 21 }];
    const own = [{ label: '1 leaf', grams: 3 }];
    const a = dedupeFoods([f('usda_foundation', 1, 'Kale, raw'), f('usda_fndds', 2, 'Kale, raw', cup)]);
    expect(a.kept[0]?.portions).toEqual(cup);
    const b = dedupeFoods([f('usda_foundation', 1, 'Kale, raw', own), f('usda_fndds', 2, 'Kale, raw', cup)]);
    expect(b.kept[0]?.portions).toEqual(own);
  });

  it('does not mutate its input', () => {
    const input = [f('usda_foundation', 1, 'Kale, raw'), f('usda_fndds', 2, 'Kale, raw', [{ label: '1 cup', grams: 21 }])];
    dedupeFoods(input);
    expect(input[0]?.portions).toEqual([]);
  });

  it('keeps several entries of the same source that share a name (a restaurant item and a generic one)', () => {
    const input = [f('usda_sr_legacy', 1, 'Hamburger, plain'), f('usda_sr_legacy', 2, 'Hamburger, plain'), f('usda_fndds', 3, 'Hamburger, plain')];
    const { kept, dropped } = dedupeFoods(input);
    expect(kept.map((x) => x.fdcId)).toEqual([1, 2]);
    expect(dropped.map((d) => [d.food.fdcId, d.keptId])).toEqual([[3, 1]]);
  });

  it('leaves distinct foods untouched', () => {
    const input = [f('usda_sr_legacy', 1, 'Rice, white, cooked'), f('usda_fndds', 2, 'Rice, white, cooked, no added fat')];
    expect(dedupeFoods(input).kept).toHaveLength(2);
  });
});
