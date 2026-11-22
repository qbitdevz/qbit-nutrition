import type { CatalogDb, MatchMemory, SqlRow } from './ports';
import {
  buildVariants,
  cueFree,
  DEFAULT_MATCH_THRESHOLD,
  detectPreparation,
  scoreCandidate,
  wordForms,
  type MatchedName,
  type RankContext,
} from './ranking';
import { normalizeName, searchWords } from './text';
import type {
  Catalog,
  FoodDetail,
  FoodNameEntry,
  FoodState,
  FoodSummary,
  Locale,
  MatchInput,
  MatchResult,
  Preparation,
  ScoredFood,
} from './types';
import { NUTRIENT_CODES, type NutrientAmounts, type NutrientCode } from '../nutrition/types';

export class CatalogError extends Error {
  constructor(
    public readonly code: 'not_found' | 'unsupported_source',
    message: string,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

export interface CatalogOptions {
  db: CatalogDb;
  memory: MatchMemory;
  /** Minimum score to accept a catalog candidate. Default `DEFAULT_MATCH_THRESHOLD`. */
  threshold?: number;
  /** FTS candidates read per query before re-ranking. Default 200. */
  candidateLimit?: number;
}

interface Candidate {
  id: number;
  matchedNames: MatchedName[];
}

interface FoodRow {
  id: number;
  source: string;
  category: string | null;
  state: FoodState;
  isBranded: boolean;
  kcal100g: number | null;
  protein100g: number | null;
  carbs100g: number | null;
  fat100g: number | null;
}

const ALTERNATIVES = 5;
const NUTRIENT_SET: ReadonlySet<string> = new Set(NUTRIENT_CODES);

const quote = (w: string) => `"${w}"`;
/** An FTS term for one word: the word and its other singular forms ("frijoles" or "frijol"), any of which may be indexed. */
const term = (w: string, prefix = false) => {
  const forms = wordForms(w).map((f) => quote(f) + (prefix ? '*' : ''));
  return forms.length > 1 ? `(${forms.join(' OR ')})` : (forms[0] as string);
};
const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

function toFoodRow(r: SqlRow): FoodRow {
  return {
    id: Number(r.id),
    source: String(r.source),
    category: (r.category as string | null) ?? null,
    state: r.state as FoodState,
    isBranded: Number(r.is_branded) === 1,
    kcal100g: (r.kcal_100g as number | null) ?? null,
    protein100g: (r.protein_100g as number | null) ?? null,
    carbs100g: (r.carbs_100g as number | null) ?? null,
    fat100g: (r.fat_100g as number | null) ?? null,
  };
}

function pickName(names: FoodNameEntry[], locale: Locale): string {
  const best =
    names.find((n) => n.locale === locale && !n.isAlias) ??
    names.find((n) => n.locale === 'en' && !n.isAlias) ??
    names.find((n) => n.locale === locale) ??
    names[0];
  return best?.name ?? '';
}

export function createCatalog(options: CatalogOptions): Catalog {
  const { db, memory } = options;
  const threshold = options.threshold ?? DEFAULT_MATCH_THRESHOLD;
  const candidateLimit = options.candidateLimit ?? 200;

  async function ftsCandidates(queries: string[], locale: Locale): Promise<Map<number, Candidate>> {
    const found = new Map<number, Candidate>();
    for (const q of queries) {
      const rows = await db.all(
        `SELECT fn.food_id AS food_id, fn.name AS name, fn.is_alias AS is_alias, fn.locale AS locale
           FROM food_fts JOIN food_name fn ON fn.rowid = food_fts.rowid
          WHERE food_fts MATCH ? AND fn.locale IN (?, 'en')
          ORDER BY bm25(food_fts) LIMIT ?`,
        [q, locale, candidateLimit],
      );
      for (const r of rows) {
        const id = Number(r.food_id);
        const c = found.get(id) ?? { id, matchedNames: [] };
        const name = String(r.name);
        if (!c.matchedNames.some((m) => m.name === name)) {
          c.matchedNames.push({ name, isAlias: Number(r.is_alias) === 1, locale: r.locale === 'es' ? 'es' : 'en' });
        }
        found.set(id, c);
      }
    }
    return found;
  }

  async function loadFoodRows(ids: number[]): Promise<Map<number, FoodRow>> {
    const out = new Map<number, FoodRow>();
    if (ids.length === 0) return out;
    const rows = await db.all(
      `SELECT id, source, category, state, is_branded, kcal_100g, protein_100g, carbs_100g, fat_100g
         FROM food WHERE id IN (${placeholders(ids.length)})`,
      ids,
    );
    for (const r of rows) out.set(Number(r.id), toFoodRow(r));
    return out;
  }

  async function loadNames(ids: number[]): Promise<Map<number, FoodNameEntry[]>> {
    const out = new Map<number, FoodNameEntry[]>();
    if (ids.length === 0) return out;
    const rows = await db.all(
      `SELECT food_id, locale, name, is_alias FROM food_name
        WHERE food_id IN (${placeholders(ids.length)}) ORDER BY is_alias, rowid`,
      ids,
    );
    for (const r of rows) {
      const id = Number(r.food_id);
      const list = out.get(id) ?? [];
      list.push({ locale: String(r.locale), name: String(r.name), isAlias: Number(r.is_alias) === 1 });
      out.set(id, list);
    }
    return out;
  }

  function toSummary(row: FoodRow, names: FoodNameEntry[], locale: Locale): FoodSummary {
    return {
      ref: { source: 'catalog', id: String(row.id) },
      name: pickName(names, locale),
      category: row.category,
      state: row.state,
      isBranded: row.isBranded,
      kcal100g: row.kcal100g,
      protein100g: row.protein100g,
      carbs100g: row.carbs100g,
      fat100g: row.fat100g,
    };
  }

  async function summaryById(id: number, locale: Locale): Promise<FoodSummary | null> {
    const rows = await loadFoodRows([id]);
    const row = rows.get(id);
    if (!row) return null;
    const names = await loadNames([id]);
    return toSummary(row, names.get(id) ?? [], locale);
  }

  /** Score candidates and return them best first. */
  async function rank(
    candidates: Map<number, Candidate>,
    ctx: RankContext,
    locale: Locale,
  ): Promise<(ScoredFood & { source: string })[]> {
    const ids = [...candidates.keys()];
    const rows = await loadFoodRows(ids);
    const scored: { id: number; row: FoodRow; score: number; nameLen: number }[] = [];
    for (const c of candidates.values()) {
      const row = rows.get(c.id);
      if (!row) continue;
      const score = scoreCandidate(ctx, { names: c.matchedNames, state: row.state, isBranded: row.isBranded, category: row.category });
      const nameLen = Math.min(...c.matchedNames.map((n) => n.name.length));
      scored.push({ id: c.id, row, score, nameLen });
    }
    // Ties: generic before branded, Foundation before SR Legacy, shorter name, lower id.
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.row.isBranded) - Number(b.row.isBranded) ||
        (a.row.source === b.row.source ? 0 : a.row.source === 'usda_foundation' ? -1 : 1) ||
        a.nameLen - b.nameLen ||
        a.id - b.id,
    );
    const top = scored.slice(0, 50);
    const names = await loadNames(top.map((t) => t.id));
    // Ranking uses the raw score, which may pass 1 (a cooked entry that also names the method); callers see 0..1.
    return top.map((t) => ({
      food: toSummary(t.row, names.get(t.id) ?? [], locale),
      score: Math.min(1, t.score),
      source: t.row.source,
    }));
  }

  return {
    async search(query, locale, limit) {
      const all = searchWords(query);
      if (all.length === 0 || limit <= 0) return [];
      // A cooking cue ("steamed broccoli") asks for a state; the name need not contain it.
      const preparation = detectPreparation(query);
      const words = preparation === 'unknown' ? all : cueFree(all);
      const last = words.length - 1;
      const andQuery = words.map((w, i) => term(w, i === last)).join(' AND ');
      const orQuery = words.map((w, i) => term(w, i === last)).join(' OR ');
      const candidates = await ftsCandidates([andQuery, orQuery], locale);
      const ctx: RankContext = {
        variants: buildVariants(query, []),
        preparation,
        prefixLastToken: true,
      };
      const ranked = await rank(candidates, ctx, locale);
      return ranked.filter((r) => r.score > 0).slice(0, limit).map((r) => r.food);
    },

    async match(items, locale) {
      const results: MatchResult[] = [];
      for (const item of items) {
        results.push(await matchOne(item, locale));
      }
      return results;
    },

    async getFood(ref) {
      if (ref.source !== 'catalog') {
        throw new CatalogError('unsupported_source', `core/catalog only resolves catalog foods, got "${ref.source}"`);
      }
      const id = Number(ref.id);
      const row = Number.isInteger(id) ? (await loadFoodRows([id])).get(id) : undefined;
      if (!row) throw new CatalogError('not_found', `catalog food not found: ${ref.id}`);
      const names = (await loadNames([id])).get(id) ?? [];
      const nutrientRows = await db.all('SELECT nutrient_code, amount_100g FROM food_nutrient WHERE food_id = ?', [id]);
      const per100g: NutrientAmounts = {};
      for (const r of nutrientRows) {
        const code = String(r.nutrient_code);
        if (NUTRIENT_SET.has(code)) per100g[code as NutrientCode] = Number(r.amount_100g);
      }
      const portionRows = await db.all(
        'SELECT locale, label, grams FROM food_portion WHERE food_id = ? ORDER BY rowid',
        [id],
      );
      const detail: FoodDetail = {
        ref,
        name: pickName(names, 'en'),
        names,
        category: row.category,
        state: row.state,
        isBranded: row.isBranded,
        per100g,
        portions: portionRows.map((p) => ({ locale: String(p.locale), label: String(p.label), grams: Number(p.grams) })),
      };
      return detail;
    },

    async rememberCorrection(detectedName, ref) {
      const key = normalizeName(detectedName);
      if (!key) return;
      await memory.remember(key, ref);
    },
  };

  async function matchOne(item: MatchInput, locale: Locale): Promise<MatchResult> {
    // 1. The user's own history for this detected name goes first.
    for (const key of [normalizeName(item.canonical_name_en), normalizeName(item.name)]) {
      if (!key) continue;
      const ref = await memory.get(key);
      if (!ref) continue;
      if (ref.source === 'catalog') {
        const id = Number(ref.id);
        const food = Number.isInteger(id) ? await summaryById(id, locale) : null;
        if (!food) continue; // stale mapping: the food is no longer in the catalog
        return { kind: 'memory', ref, food, score: 1, needsReview: false, alternatives: [] };
      }
      return { kind: 'memory', ref, food: null, score: 1, needsReview: false, alternatives: [] };
    }

    // 2. FTS candidates from the canonical name and the search terms.
    // The model's preparation wins; when it left it unknown, a cue in the detected name ("steamed broccoli") is used.
    const preparation: Preparation =
      item.preparation !== 'unknown' ? item.preparation : [item.canonical_name_en, item.name, ...item.search_terms_en].map(detectPreparation).find((p) => p !== 'unknown') ?? 'unknown';
    const variants = buildVariants(item.canonical_name_en, item.search_terms_en);
    const queries: string[] = [];
    const canonicalWords = cueFree(searchWords(item.canonical_name_en));
    if (canonicalWords.length > 0) queries.push(canonicalWords.map((w) => term(w)).join(' AND '));
    const allWords = [...new Set(variants.flatMap((v) => cueFree(searchWords(v.norm))))];
    if (allWords.length > 0) queries.push(allWords.map((w) => term(w)).join(' OR '));
    const candidates = queries.length > 0 ? await ftsCandidates(queries, locale) : new Map<number, Candidate>();

    // 3. Re-rank, 4. threshold.
    const ranked = await rank(candidates, { variants, preparation, prefixLastToken: false }, locale);
    const alternatives: ScoredFood[] = ranked.slice(0, ALTERNATIVES).map(({ food, score }) => ({ food, score }));
    const top = ranked[0];
    if (top && top.score >= threshold) {
      return { kind: 'catalog', ref: top.food.ref, food: top.food, score: top.score, needsReview: false, alternatives };
    }
    return {
      kind: 'ai_estimate',
      ref: null,
      food: null,
      score: top?.score ?? 0,
      needsReview: true,
      fallback_per_100g: item.fallback_per_100g ?? null,
      alternatives,
    };
  }
}
