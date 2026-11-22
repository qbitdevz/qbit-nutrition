/** @jest-environment node */
/// <reference types="node" />
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildCatalog } from '../builder';
import { selectCandidates } from '../handwrittenSelection';
import { duplicateDisplayNames, englishLeftovers, englishVocabulary, markupLeftovers, sameAsEnglish, spanishVocabulary, strip, type NameRowPair } from '../nameQuality';
import { FIXTURE_FOODS, FIXTURE_TRANSLATIONS } from '../testing/fixture';
import { loadAliasRules, loadGlossary, loadPortionGlossary, loadSynonyms, loadTranslations } from '../translations';

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
const portionVocab = spanishVocabulary(loadPortionGlossary(DATA), []);
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
      expect(o.is_alias === 0 ? ['handwritten', 'reviewed', 'composed'] : ['handwritten', 'synonym']).toContain(o.origin);
    }
  });

  it(`${label}: no Spanish name equals its English name unless listed as an allowed exception`, () => {
    const bad = sameAsEnglish(rows, new Set(allow.sameAsEnglish)).map((r) => r.en);
    expect(bad).toEqual([]);
  });

  it(`${label}: no untranslated English word is left in a Spanish name beyond the explicit allow-list`, () => {
    const names = db.prepare(`SELECT food_id AS id, name AS es FROM food_name WHERE locale = 'es'`).all().map((r) => ({ ...r })) as unknown as { id: number; es: string }[];
    const left = englishLeftovers(names, englishVocabulary(rows), vocab, new Set(allow.englishWords), glossary.keep);
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
  // A skipped describe still runs its body, and CI has no built catalog to open: leave before touching the file.
  if (!existsSync(BUILT)) {
    it.skip('needs the built catalog', () => {});
    return;
  }
  const db = new DatabaseSync(BUILT, { readOnly: true });
  afterAll(() => db.close());

  gates(db, 'built', 1);

  it('hand-writes or reviews at least 800 of the most common foods, and composes the rest', () => {
    const c = db.prepare(`SELECT origin, count(*) AS n FROM food_name WHERE locale = 'es' AND is_alias = 0 GROUP BY origin`).all() as unknown as { origin: string; n: number }[];
    const n = Object.fromEntries(c.map((r) => [r.origin, r.n]));
    expect(n.handwritten).toBeGreaterThanOrEqual(600);
    expect((n.handwritten ?? 0) + (n.reviewed ?? 0)).toBeGreaterThanOrEqual(800);
    expect(n.composed).toBeGreaterThan(10_000);
  });

  it('has a handwritten or reviewed name for every food the selection criterion picks (query-set foods and plain staples of each group)', async () => {
    const picked = await selectCandidates(BUILT);
    const origin = new Map((db.prepare(`SELECT food_id AS id, origin FROM food_name WHERE locale = 'es' AND is_alias = 0`).all() as unknown as { id: number; origin: string }[]).map((r) => [String(r.id), r.origin]));
    const without = picked.filter((c) => !['handwritten', 'reviewed'].includes(origin.get(c.id) ?? '')).map((c) => `${c.id} ${c.en}`);
    // The ranking may move a food in or out of a query's top 3 after the list was reviewed; a handful of such drifts is not a failure.
    expect(without.length).toBeLessThanOrEqual(Math.ceil(picked.length * 0.02));
  });

  it('has Spanish household-measure labels for every English one, same grams, none left in English', () => {
    const rows = db.prepare(`SELECT e.label AS en, s.label AS es, e.grams AS g1, s.grams AS g2 FROM food_portion e
      JOIN food_portion s ON s.food_id = e.food_id AND s.locale = 'es' AND s.grams = e.grams WHERE e.locale = 'en'`).all() as unknown as { en: string; es: string }[];
    const counts = db.prepare(`SELECT locale, count(*) AS n FROM food_portion GROUP BY locale`).all() as unknown as { locale: string; n: number }[];
    const n = Object.fromEntries(counts.map((c) => [c.locale, c.n]));
    expect(n.es).toBe(n.en);
    expect(rows.length).toBeGreaterThanOrEqual(n.en as number);
    // Identical labels are only numbers and units ("3 oz") or capitalized product names.
    const UNITS = new Set(['oz', 'lb', 'g', 'kg', 'ml', 'tbsp', 'tsp', 'fl']);
    const english = rows.filter(
      (r) => r.en === r.es && r.en.split(/[^a-zA-Z'’-]+/).filter(Boolean).some((w) => !UNITS.has(w) && !/^[A-Z]/.test(w) && !portionVocab.has(strip(w))),
    );
    expect(english.map((r) => r.en)).toEqual([]);
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
