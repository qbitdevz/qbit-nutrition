/** @jest-environment node */
/// <reference types="node" />
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCatalog } from '../../../../scripts/catalog/builder';
import { InMemoryMatchMemory, NodeSqliteCatalogDb } from '../../../../scripts/catalog/nodeSqlitePort';
import type { SourceFood, TranslationEntry } from '../../../../scripts/catalog/types';
import { createCatalog, type Catalog, type MatchInput } from '..';
import { detectPreparation } from '../ranking';

/**
 * General ranking rules of catalog search and matching (odd/tasks/catalog-expansion.md T3, S6). Each test pins a rule on a
 * small catalog; none names a query of the everyday query set. Descriptions are real USDA ones.
 */
let nextId = 100;
function food(description: string, over: Partial<SourceFood> = {}): SourceFood {
  return {
    source: 'usda_sr_legacy',
    fdcId: nextId++,
    description,
    category: null,
    nutrients: [{ id: 1008, unit: 'kcal', amount: 100 }],
    portions: [],
    ...over,
  };
}
const fndds = (description: string, category: string | null = null): SourceFood => food(description, { source: 'usda_fndds', category });

const FOODS: SourceFood[] = [
  food('Eggnog'),
  food('Eggplant, raw'),
  food('Egg, whole, raw'),
  food('Egg, whole, cooked, fried'),
  food('Rice, white, glutinous, unenriched, cooked'),
  food('Rice, white, long-grain, regular, cooked'),
  food('Rice, white, long-grain, regular, raw, enriched'),
  food('Potatoes, french fried, all types, salt added in processing, frozen, unprepared'),
  fndds('Potato, french fries, NFS'),
  fndds('Hamburger, NFS', 'Burgers'),
  food('Beef, ground, 80% lean meat / 20% fat, raw'),
  fndds('Milk, NFS'),
  fndds('Milk, malted'),
  fndds('Bread, egg'),
  fndds('Bread, white'),
  fndds('Steak sauce'),
  food('Beef, loin, top loin steak, boneless, separable lean only, cooked, grilled'),
  food('Chicken, broilers or fryers, breast, meat only, raw', { category: 'Poultry Products' }),
  food('Chicken, broilers or fryers, breast, meat only, cooked, roasted', { category: 'Poultry Products' }),
  food('Fat, chicken'),
  food('Chicken skin'),
  food('Chicken, broilers or fryers, meat only, cooked, fried', { category: 'Poultry Products' }),
  food('Broccoli, raw', { category: 'Vegetables and Vegetable Products' }),
  food('Broccoli, cooked, boiled, drained, without salt', { category: 'Vegetables and Vegetable Products' }),
  food('Bananas, raw', { category: 'Fruits and Fruit Juices' }),
  food('Bananas, dehydrated, or banana powder'),
  food('Beans, black, mature seeds, cooked, boiled, without salt'),
  food('Lemons, raw, without peel'),
  food('Apples, raw, with skin'),
  food('Apple pie'),
];

const TRANSLATIONS: TranslationEntry[] = [
  { en: 'Beans, black, mature seeds, cooked, boiled, without salt', es: 'Frijoles negros, cocidos' },
  { en: 'Lemons, raw, without peel', es: 'Limón, crudo, sin cáscara' },
  { en: 'Apples, raw, with skin', es: 'Manzanas, crudas, con piel', aliases: ['manzana'] },
  { en: 'Apple pie', es: 'Tarta de manzana' },
  { en: 'Broccoli, cooked, boiled, drained, without salt', es: 'Brócoli, cocido, hervido, escurrido, sin sal' },
  { en: 'Broccoli, raw', es: 'Brócoli, crudo' },
];

let db: NodeSqliteCatalogDb;
let catalog: Catalog;
const byName = new Map<number, string>();

beforeAll(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qn-ranking-'));
  const dbPath = path.join(dir, 'catalog.db');
  buildCatalog({
    foods: FOODS,
    translations: TRANSLATIONS,
    aliasRules: [{ match: '^Beef, ground', en: ['ground beef', 'hamburger meat'] }, { match: 'french fried', en: ['french fries'] }],
    outPath: dbPath,
    meta: { dataVersion: 'ranking', buildDate: '2026-01-01T00:00:00.000Z', sourceFiles: ['r.zip'] },
  });
  db = new NodeSqliteCatalogDb(dbPath);
  catalog = createCatalog({ db, memory: new InMemoryMatchMemory() });
  for (const f of FOODS) byName.set(f.fdcId, f.description);
});
afterAll(() => db.close());

const top = async (q: string, locale: 'en' | 'es' = 'en', n = 1) => (await catalog.search(q, locale, n)).map((f) => f.ref.id).map((id) => byName.get(Number(id)));
const item = (over: Partial<MatchInput> & Pick<MatchInput, 'canonical_name_en'>): MatchInput => ({ name: over.canonical_name_en, search_terms_en: [], preparation: 'unknown', ...over });

describe('detectPreparation', () => {
  it('reads a cooking or raw cue out of a query, in English and Spanish', () => {
    expect(detectPreparation('steamed broccoli')).toBe('steamed');
    expect(detectPreparation('grilled chicken breast')).toBe('grilled');
    expect(detectPreparation('white rice, cooked')).toBe('boiled');
    expect(detectPreparation('raw carrot')).toBe('raw');
    expect(detectPreparation('brócoli al vapor')).toBe('steamed');
    expect(detectPreparation('pollo a la plancha')).toBe('grilled');
    expect(detectPreparation('arroz blanco cocido')).toBe('boiled');
    expect(detectPreparation('papa hervida')).toBe('boiled');
    expect(detectPreparation('zanahoria cruda')).toBe('raw');
    expect(detectPreparation('pollo frito')).toBe('fried');
  });

  it('finds nothing in a plain food name', () => {
    expect(detectPreparation('banana')).toBe('unknown');
    expect(detectPreparation('arroz blanco')).toBe('unknown');
  });
});

describe('search ranking', () => {
  it('a whole word beats a prefix of a longer word: "egg" is an egg, not eggnog or eggplant', async () => {
    expect(await top('egg')).toEqual(['Egg, whole, raw']);
  });

  it('still completes a word while typing when nothing better exists', async () => {
    expect((await top('eggpl'))[0]).toBe('Eggplant, raw');
  });

  it('does not rank a specialty variant (glutinous) above the plain one for "white rice, cooked"', async () => {
    expect((await top('white rice, cooked'))[0]).toBe('Rice, white, long-grain, regular, cooked');
  });

  it('prefers a prepared entry to an unprepared frozen one when the query names a prepared food', async () => {
    expect((await top('french fries'))[0]).toBe('Potato, french fries, NFS');
  });

  it('prefers the generic "not further specified" entry over a specialty one', async () => {
    expect((await top('milk'))[0]).toBe('Milk, NFS');
    expect((await top('hamburger'))[0]).toBe('Hamburger, NFS');
    expect((await top('bread'))[0]).toBe('Bread, white');
  });

  it('prefers the plain food to a compound that merely contains the word ("steak" is not steak sauce)', async () => {
    expect((await top('steak'))[0]).toBe('Beef, loin, top loin steak, boneless, separable lean only, cooked, grilled');
  });

  it('uses the cooking word of the query: "steamed broccoli" finds the cooked entry, "raw broccoli" the raw one', async () => {
    expect((await top('steamed broccoli'))[0]).toBe('Broccoli, cooked, boiled, drained, without salt');
    expect((await top('raw broccoli'))[0]).toBe('Broccoli, raw');
    expect((await top('brócoli al vapor', 'es'))[0]).toBe('Broccoli, cooked, boiled, drained, without salt');
  });

  it('without a cue, prefers cooked to raw for foods people eat cooked (meat, rice), but not for fruit', async () => {
    expect((await top('chicken breast'))[0]).toBe('Chicken, broilers or fryers, breast, meat only, cooked, roasted');
    expect((await top('banana'))[0]).toBe('Bananas, raw');
  });

  it('a body part or by-product is not the dish: "fried chicken" is not chicken fat or skin', async () => {
    expect((await top('fried chicken'))[0]).toBe('Chicken, broilers or fryers, meat only, cooked, fried');
  });

  it('prefers a plain fruit to a processed form of it', async () => {
    expect((await top('banana'))[0]).toBe('Bananas, raw');
    expect((await top('apple'))[0]).toBe('Apples, raw, with skin');
  });

  it('finds a Spanish plural by its singular and the other way round ("frijoles" and "limones")', async () => {
    expect((await top('frijoles', 'es'))[0]).toBe('Beans, black, mature seeds, cooked, boiled, without salt');
    expect((await top('limones', 'es'))[0]).toBe('Lemons, raw, without peel');
    expect((await top('manzanas', 'es'))[0]).toBe('Apples, raw, with skin');
  });

  it('ignores accents in both directions', async () => {
    expect((await top('limon', 'es'))[0]).toBe('Lemons, raw, without peel');
    expect((await top('LIMÓN', 'es'))[0]).toBe('Lemons, raw, without peel');
  });

  it('weights an alias slightly below the name itself', async () => {
    const hits = await catalog.search('ground beef', 'en', 3);
    expect(byName.get(Number(hits[0]?.ref.id))).toBe('Beef, ground, 80% lean meat / 20% fat, raw');
  });
});

describe('match with a preparation hint (AI-detected items)', () => {
  it('chooses the state the preparation asks for, whatever the name order', async () => {
    const [grilled] = await catalog.match([item({ canonical_name_en: 'chicken breast', preparation: 'grilled' })], 'en');
    expect(byName.get(Number(grilled?.food?.ref.id))).toBe('Chicken, broilers or fryers, breast, meat only, cooked, roasted');
    const [raw] = await catalog.match([item({ canonical_name_en: 'chicken breast', preparation: 'raw' })], 'en');
    expect(byName.get(Number(raw?.food?.ref.id))).toBe('Chicken, broilers or fryers, breast, meat only, raw');
  });

  it('reads the cue from the detected name when the model left the preparation unknown', async () => {
    const [r] = await catalog.match([item({ canonical_name_en: 'steamed broccoli', preparation: 'unknown' })], 'en');
    expect(byName.get(Number(r?.food?.ref.id))).toBe('Broccoli, cooked, boiled, drained, without salt');
  });

  it('keeps a boiled-rice item on the plain cooked entry, not the glutinous one', async () => {
    const [r] = await catalog.match([item({ canonical_name_en: 'white rice', search_terms_en: ['steamed rice'], preparation: 'steamed' })], 'en');
    expect(byName.get(Number(r?.food?.ref.id))).toBe('Rice, white, long-grain, regular, cooked');
  });

  it('a preparation hint does not rescue an unrelated food: no cooked entry of another food is accepted', async () => {
    const [r] = await catalog.match([item({ canonical_name_en: 'dragon fruit', preparation: 'grilled' })], 'en');
    expect(r?.kind).toBe('ai_estimate');
  });
});
