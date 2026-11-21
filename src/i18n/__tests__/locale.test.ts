import en from '../en.json';
import es from '../es.json';
import { resolveLocale } from '../locale';

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

describe('translations', () => {
  it('has the same keys in English and Spanish', () => {
    expect(keysOf(es).sort()).toEqual(keysOf(en).sort());
  });

  it('has no empty strings', () => {
    const empty = (tree: unknown) => keysOf(tree).filter((key) => {
      const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], tree);
      return typeof text !== 'string' || text.trim() === '';
    });
    expect(empty(en)).toEqual([]);
    expect(empty(es)).toEqual([]);
  });
});

describe('resolveLocale', () => {
  it('keeps supported languages', () => {
    expect(resolveLocale('es')).toBe('es');
    expect(resolveLocale('en')).toBe('en');
  });

  it('ignores region and case', () => {
    expect(resolveLocale('es-AR')).toBe('es');
    expect(resolveLocale('EN_us')).toBe('en');
  });

  it('falls back to English for anything else', () => {
    expect(resolveLocale('fr')).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale('')).toBe('en');
  });
});
