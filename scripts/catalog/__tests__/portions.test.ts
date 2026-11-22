/** @jest-environment node */
/// <reference types="node" />
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog } from '../builder';
import { loadPortionGlossary } from '../translations';
import { portionLabelEs } from '../portions';
import type { SourceFood } from '../types';

const glossary = loadPortionGlossary(path.join(__dirname, '..', 'data'));
const es = (label: string) => portionLabelEs(label, glossary);

describe('portionLabelEs (household measures in Spanish)', () => {
  it('translates the common units and agrees the quantity with the noun', () => {
    expect(es('1 cup').text).toBe('1 taza');
    expect(es('2 cups').text).toBe('2 tazas');
    expect(es('0.5 cup').text).toBe('1/2 taza');
    expect(es('1 tbsp').text).toBe('1 cucharada');
    expect(es('1 tablespoon').text).toBe('1 cucharada');
    expect(es('1 tsp').text).toBe('1 cucharadita');
    expect(es('1 slice').text).toBe('1 rebanada');
    expect(es('1 piece').text).toBe('1 pieza');
    expect(es('1 serving').text).toBe('1 porción');
    expect(es('1 can').text).toBe('1 lata');
    expect(es('1 package').text).toBe('1 paquete');
    expect(es('1 egg').text).toBe('1 huevo');
  });

  it('puts sizes after the noun and agrees them; a size alone becomes "unidad"', () => {
    expect(es('1 large slice').text).toBe('1 rebanada grande');
    expect(es('1 large or thick slice').text).toBe('1 rebanada grande o gruesa');
    expect(es('1 medium').text).toBe('1 unidad mediana');
    expect(es('1 small').text).toBe('1 unidad pequeña');
  });

  it('keeps weights and fluid ounces, with the Spanish abbreviation', () => {
    expect(es('3 oz').text).toBe('3 oz');
    expect(es('1 fl oz').text).toBe('1 oz líq.');
    expect(es('1 cup (8 fl oz)').text).toBe('1 taza (8 oz líq.)');
    expect(es('1 lb').text).toBe('1 lb');
  });

  it('translates qualifiers after the comma and in parentheses', () => {
    expect(es('1 cup, cooked, diced').text).toBe('1 taza, cocida, en cubos');
    expect(es('1 oz, cooked').text).toBe('1 oz, cocida');
    expect(es('1 fl oz (no ice)').text).toBe('1 oz líq. (sin hielo)');
  });

  it('keeps a number and its unit together: "of" goes between a measure and what it measures', () => {
    expect(es('1 steak (yield from 593 g raw meat)').text).toBe('1 bistec (rendimiento de 593 g de carne cruda)');
    expect(es('1 cup penne').text).toBe('1 taza de penne');
    expect(es('1 cup, cooked').text).toBe('1 taza, cocida');
  });

  it('puts a counted serving in parentheses, drops "each", and keeps product names as written', () => {
    expect(es('1 serving 3 cookies').text).toBe('1 porción (3 galletas)');
    expect(es('1 each medium (about 5" dia)').text).toBe('1 unidad mediana (aprox. 5" de diámetro)');
    expect(es('1 Wheat Thins').text).toBe('1 Wheat Thins');
    expect(es('1 wing, any size').text).toBe('1 ala de cualquier tamaño');
  });

  it('reports the English words it cannot translate', () => {
    expect(es('1 zorp').missing).toEqual(['zorp']);
  });
});

describe('the catalog carries Spanish portion labels with English as the fallback', () => {
  const food: SourceFood = {
    source: 'usda_fndds',
    fdcId: 5,
    description: 'Rice, cooked',
    category: null,
    nutrients: [{ id: 1008, unit: 'kcal', amount: 130 }],
    portions: [
      { label: '1 cup', grams: 158 },
      { label: '1 large slice', grams: 30 },
    ],
  };
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'qn-portions-')), 'catalog.db');
  buildCatalog({ foods: [food], translations: [], portionGlossary: glossary, outPath: out, meta: { dataVersion: 't', buildDate: 'x', sourceFiles: [] } });
  const db = new DatabaseSync(out, { readOnly: true });
  afterAll(() => db.close());

  it('stores each label in both locales with the same grams', () => {
    const rows = db.prepare('SELECT locale, label, grams FROM food_portion WHERE food_id = 5 ORDER BY locale, rowid').all().map((r) => ({ ...r }));
    expect(rows).toEqual([
      { locale: 'en', label: '1 cup', grams: 158 },
      { locale: 'en', label: '1 large slice', grams: 30 },
      { locale: 'es', label: '1 taza', grams: 158 },
      { locale: 'es', label: '1 rebanada grande', grams: 30 },
    ]);
  });

  it('refuses a catalog with an untranslatable portion label rather than shipping an English one', () => {
    const bad = { ...food, fdcId: 6, portions: [{ label: '1 zorp', grams: 1 }] };
    expect(() => buildCatalog({ foods: [bad], translations: [], portionGlossary: glossary, outPath: `${out}.2`, meta: { dataVersion: 't', buildDate: 'x', sourceFiles: [] } })).toThrow(/zorp/);
  });
});
