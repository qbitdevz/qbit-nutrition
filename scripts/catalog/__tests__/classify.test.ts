import { deriveState, isBranded } from '../classify';

describe('deriveState', () => {
  it.each([
    ['Rice, white, long-grain, regular, cooked', null, 'cooked'],
    ['Bananas, raw', null, 'raw'],
    ['Apples, raw, with skin, boiled', null, 'cooked'], // a cooking word beats "raw"
    ['Soup, chicken noodle, canned, condensed', null, 'processed'],
    ['Cheese, cheddar', null, 'unknown'],
  ] as const)('%s -> %s', (description, category, expected) => {
    expect(deriveState(description, category)).toBe(expected);
  });

  it('reads the FNDDS "from dried" convention as cooked, and "from canned" as processed', () => {
    expect(deriveState('Lentils, from dried, no added fat', 'Beans, peas, legumes')).toBe('cooked');
    expect(deriveState('Peas, from canned, no added fat', 'Other vegetables and combinations')).toBe('processed');
  });

  it('treats FNDDS dishes as eaten (cooked) from their WWEIA category, but not plain foods', () => {
    expect(deriveState('Empanada, beef', 'Turnovers and other grain-based items')).toBe('cooked');
    expect(deriveState('Tacos, NFS', 'Burritos and tacos')).toBe('cooked');
    expect(deriveState('Milk, whole', 'Milk, whole')).toBe('unknown');
    expect(deriveState('Bananas, raw', 'Bananas')).toBe('raw');
  });
});

describe('isBranded', () => {
  it('flags restaurant and brand names that FNDDS writes in parentheses', () => {
    expect(isBranded({ description: 'Big Mac (McDonalds)', category: 'Burgers' })).toBe(true);
    expect(isBranded({ description: 'Cheeseburger (Burger King)', category: 'Burgers' })).toBe(true);
    expect(isBranded({ description: 'Nutrition bar (Clif Bar)', category: 'Nutrition bars' })).toBe(true);
    expect(isBranded({ description: 'Potato chips (Doritos)', category: 'Potato chips' })).toBe(true);
  });

  it('keeps generic dishes generic', () => {
    expect(isBranded({ description: 'Empanada, beef', category: 'Turnovers and other grain-based items' })).toBe(false);
    expect(isBranded({ description: 'Cheeseburger, NFS', category: 'Burgers' })).toBe(false);
  });
});
