/** @jest-environment node */
/// <reference types="node" />
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog } from '../builder';
import { duplicateDisplayNames, englishLeftovers, englishVocabulary, markupLeftovers, sameAsEnglish, spanishVocabulary, strip, type NameRowPair } from '../nameQuality';
import { FIXTURE_FOODS, FIXTURE_TRANSLATIONS } from '../testing/fixture';
import { loadAliasRules, loadGlossary, loadSynonyms, loadTranslations } from '../translations';

/**
 * Quality gates of the Spanish names (odd/tasks/catalog-expansion.md T2, S2). They run over the real built catalog
 * (catalog-build/catalog.db) when it exists, and always over a catalog built from the fixture with the real glossary.
 * CI does not build the catalog, so the real-catalog block is skipped there, with its reason in the test name.
 */
const DATA = path.join(__dirname, '..', 'data');
const BUILT = path.join(__dirname, '..', '..', '..', 'catalog-build', 'catalog.db');
const allow = JSON.parse(readFileSync(path.join(DATA, 'translation-allowlist.json'), 'utf8')) as { sameAsEnglish: string[]; englishWords: string[] };
const glossary = loadGlossary(path.join(DATA, 'glossary'));
const handwritten = loadTranslations(path.join(DATA, 'translations.es.json'));
const vocab = spanishVocabulary(glossary, handwritten.flatMap((t) => [t.es, ...(t.aliases ?? [])]));

function readNames(db: DatabaseSync): NameRowPair[] {
  return db
    .prepare(
      `SELECT f.id AS id, e.name AS en, s.name AS es, s.origin AS origin FROM food f
         JOIN food_name e ON e.food_id = f.id AND e.locale = 'en' AND e.is_alias = 0
         LEFT JOIN food_name s ON s.food_id = f.id AND s.locale = 'es' AND s.is_alias = 0`,
    )
    .all()
    .map((r) => ({ ...r })) as unknown as NameRowPair[];
}

function gates(db: DatabaseSync, label: string, expectCoverage: number) {
  const rows = readNames(db);

  it(`${label}: every food has exactly one Spanish display name (coverage ${expectCoverage * 100}%)`, () => {
    const named = rows.filter((r) => r.es);
    expect(named.length / rows.length).toBeGreaterThanOrEqual(expectCoverage);
    const dupes = db.prepare(`SELECT food_id FROM food_name WHERE locale = 'es' AND is_alias = 0 GROUP BY food_id HAVING count(*) > 1`).all();
    expect(dupes).toEqual([]);
  });

  it(`${label}: each Spanish name says how it was produced (handwritten or composed), and aliases are marked`, () => {
    const origins = db.prepare(`SELECT origin, is_alias, count(*) AS n FROM food_name WHERE locale = 'es' GROUP BY origin, is_alias`).all() as unknown as { origin: string; is_alias: number }[];
    for (const o of origins) {
      expect(o.is_alias === 0 ? ['handwritten', 'composed'] : ['handwritten', 'synonym']).toContain(o.origin);
    }
  });

  it(`${label}: no Spanish name equals its English name unless listed as an allowed exception`, () => {
    const bad = sameAsEnglish(rows, new Set(allow.sameAsEnglish)).map((r) => r.en);
    expect(bad).toEqual([]);
  });

  it(`${label}: no untranslated English word is left in a Spanish name beyond the explicit allow-list`, () => {
    const names = db.prepare(`SELECT food_id AS id, name AS es FROM food_name WHERE locale = 'es'`).all().map((r) => ({ ...r })) as unknown as { id: number; es: string }[];
    const left = englishLeftovers(names, englishVocabulary(rows), vocab, new Set(allow.englishWords));
    expect([...left.keys()]).toEqual([]);
  });

  it(`${label}: no two foods share a Spanish display name`, () => {
    const dup = [...duplicateDisplayNames(rows.filter((r) => r.es))].map(([k, list]) => `${k}: ${list.map((r) => r.en).join(' | ')}`);
    expect(dup).toEqual([]);
  });

  it(`${label}: no composer markup, double spaces or lower-case initials in a display name`, () => {
    expect(markupLeftovers(rows.filter((r) => r.es).map((r) => ({ id: r.id, es: r.es })))).toEqual([]);
  });
}

describe('Spanish name quality gates, fixture catalog (always runs)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qn-names-'));
  const outPath = path.join(dir, 'catalog.db');
  buildCatalog({
    foods: FIXTURE_FOODS,
    translations: FIXTURE_TRANSLATIONS.filter((t) => t.en !== 'Not in the data set'),
    glossary,
    synonyms: loadSynonyms(path.join(DATA, 'synonyms.json')),
    aliasRules: loadAliasRules(path.join(DATA, 'aliases.json')),
    outPath,
    meta: { dataVersion: 'fixture@names', buildDate: '2026-01-01T00:00:00.000Z', sourceFiles: ['fixture.zip'] },
  });
  const db = new DatabaseSync(outPath, { readOnly: true });
  afterAll(() => db.close());

  gates(db, 'fixture', 1);

  it('composes the foods without a handwritten name and tells the two "Hamburger, plain" apart', () => {
    const es = (id: number) => (db.prepare(`SELECT name, origin FROM food_name WHERE food_id = ? AND locale = 'es' AND is_alias = 0`).get(id) as { name: string; origin: string });
    expect(es(1010)).toMatchObject({ name: 'Lentejas, crudas', origin: 'composed' });
    expect(es(1001)).toMatchObject({ name: 'Plátano, crudo', origin: 'handwritten' });
    expect(es(1007).name).not.toBe(es(1008).name);
  });

  it('adds the regional synonyms as aliases, marked as such', () => {
    const alias = (id: number, locale: string) =>
      db.prepare(`SELECT name FROM food_name WHERE food_id = ? AND locale = ? AND is_alias = 1 AND origin = 'synonym'`).all(id, locale).map((r) => (r as { name: string }).name);
    expect(alias(1001, 'es')).toEqual(expect.arrayContaining(['Banana, crudo', 'Banano, crudo']));
    expect(alias(1009, 'es')).toEqual(expect.arrayContaining(['Jitomate, crudo']));
    expect(alias(1011, 'es')).toEqual([]); // "Queso cheddar" has no synonym
  });
});

const describeBuilt = existsSync(BUILT) ? describe : describe.skip;
const builtLabel = existsSync(BUILT)
  ? 'Spanish name quality gates, built catalog'
  : 'Spanish name quality gates, built catalog (SKIPPED: catalog-build/catalog.db not found; run "npm run catalog:build" to check the real catalog)';

describeBuilt(builtLabel, () => {
  const db = new DatabaseSync(BUILT, { readOnly: true });
  afterAll(() => db.close());

  gates(db, 'built', 1);

  it('composes most names and hand-writes the most common foods', () => {
    const c = db.prepare(`SELECT origin, count(*) AS n FROM food_name WHERE locale = 'es' AND is_alias = 0 GROUP BY origin`).all() as unknown as { origin: string; n: number }[];
    const n = Object.fromEntries(c.map((r) => [r.origin, r.n]));
    expect(n.handwritten).toBeGreaterThanOrEqual(100);
    expect(n.composed).toBeGreaterThan(10_000);
  });

  it('finds a food by every regional name of the task list (S2)', () => {
    const names = db.prepare(`SELECT name FROM food_name WHERE locale = 'es'`).all().map((r) => ` ${strip((r as { name: string }).name).replace(/[^a-z0-9]+/g, ' ')} `);
    const groups: string[][] = [
      ['palta', 'aguacate'], ['frutilla', 'fresa'], ['choclo', 'maiz', 'elote'], ['poroto', 'frijol', 'judia', 'alubia'], ['zapallo', 'calabaza'],
      ['banana', 'platano', 'banano'], ['durazno', 'melocoton'], ['papa', 'patata'], ['arveja', 'guisante', 'chicharo'], ['anana', 'pina'],
      ['pomelo', 'toronja'], ['manteca', 'mantequilla'], ['carne picada', 'carne molida'], ['panceta', 'tocino', 'beicon'],
    ];
    for (const g of groups) {
      for (const term of g) {
        const found = names.some((n) => n.includes(` ${term} `) || n.includes(` ${term}s `) || n.includes(` ${term}es `));
        expect([term, found]).toEqual([term, true]);
      }
    }
  });

  it('finds foods by the common English names that differ from USDA wording (T2)', () => {
    const en = db.prepare(`SELECT lower(name) AS n FROM food_name WHERE locale = 'en'`).all().map((r) => (r as { n: string }).n);
    for (const term of ['french fries', 'ground beef', 'scrambled eggs', 'zucchini', 'courgette', 'eggplant', 'aubergine', 'cilantro', 'coriander']) {
      expect([term, en.some((n) => n.includes(term))]).toEqual([term, true]);
    }
  });

  it('keeps the owner example: "Pechuga de pollo, a la plancha"', () => {
    const row = db.prepare(`SELECT name FROM food_name WHERE locale = 'es' AND is_alias = 0 AND name = 'Pechuga de pollo, a la plancha'`).get();
    expect(row).toBeDefined();
  });

  it('has the 200-name review sample next to the English originals', () => {
    const doc = readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'catalog-translation-sample.md'), 'utf8');
    const rowsInTable = doc.split('\n').filter((l) => /^\| \d+ \|/.test(l));
    expect(rowsInTable).toHaveLength(200);
  });
});
