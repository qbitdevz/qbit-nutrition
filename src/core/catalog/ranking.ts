import { normalizeName, stemForms, tokenForms } from './text';
import type { FoodState, Locale, Preparation } from './types';

/** Minimum score for a catalog candidate to be accepted (docs/07 section 6, step 4). */
export const DEFAULT_MATCH_THRESHOLD = 0.55;

/** One way of writing what we look for: the canonical name or one search term. */
export interface QueryVariant {
  norm: string;
  /** One entry per query token: the singular forms of that token (English and Spanish). */
  tokens: string[][];
  /** Per token: true when it only states a preparation ("steamed"). Such a token is a bonus when the name has it, never a requirement. */
  cue: boolean[];
  /** Canonical name counts fully; search terms slightly less. */
  weight: number;
}

export interface RankContext {
  variants: QueryVariant[];
  preparation: Preparation;
  /** True while the user is typing: the last query token may be a prefix. */
  prefixLastToken: boolean;
}

/** One name of a food that the full-text index matched. */
export interface MatchedName {
  name: string;
  isAlias: boolean;
  locale: Locale;
}

export interface RankCandidate {
  names: MatchedName[];
  state: FoodState;
  isBranded: boolean;
  /** Source category (USDA food group or WWEIA category), used only to tell foods that are usually eaten cooked. */
  category?: string | null;
}

const COOKED_PREPARATIONS: ReadonlySet<Preparation> = new Set([
  'boiled',
  'steamed',
  'grilled',
  'baked',
  'fried',
  'sauteed',
  'stewed',
]);

/** Words USDA uses for the same cooking method, for a small agreement bonus. */
const METHOD_WORDS: Partial<Record<Preparation, string[]>> = {
  boiled: ['boiled', 'simmered', 'hervido'],
  steamed: ['steamed', 'vapor'],
  grilled: ['grilled', 'broiled', 'plancha', 'parrilla'],
  baked: ['baked', 'roasted', 'horneado', 'asado'],
  fried: ['fried', 'frito'],
  sauteed: ['sauteed', 'fried', 'salteado'],
  stewed: ['stewed', 'braised', 'estofado', 'braseado'],
};

// ---------------------------------------------------------------------------------------------------------------------
// Preparation cues in a query ("steamed broccoli", "pollo a la plancha")

const CUES: { prep: Preparation; re: RegExp }[] = [
  { prep: 'steamed', re: /\b(steamed|al vapor|vapor)\b/ },
  { prep: 'grilled', re: /\b(grilled|broiled|charbroiled|a la plancha|plancha|a la parrilla|parrilla|grillado|grillada)\b/ },
  { prep: 'fried', re: /\b(fried|deep fried|pan fried|fritos?|fritas?)\b/ },
  { prep: 'sauteed', re: /\b(sauteed|salteados?|salteadas?)\b/ },
  { prep: 'stewed', re: /\b(stewed|braised|estofados?|estofadas?|guisados?|guisadas?|braseados?|braseadas?)\b/ },
  { prep: 'baked', re: /\b(baked|roasted|al horno|hornead[oa]s?|asad[oa]s?)\b/ },
  { prep: 'boiled', re: /\b(boiled|cooked|cocid[oa]s?|hervid[oa]s?)\b/ },
  { prep: 'raw', re: /\b(raw|crud[oa]s?)\b/ },
];

/** The cooking method or "raw" a query asks for, in English or Spanish, or `unknown`. */
export function detectPreparation(text: string): Preparation {
  const norm = normalizeName(text);
  for (const cue of CUES) if (cue.re.test(norm)) return cue.prep;
  return 'unknown';
}

const CUE_WORD = /^(steamed|vapor|grilled|broiled|charbroiled|plancha|parrilla|grillado|grillada|fried|frito|frita|sauteed|salteado|salteada|stewed|braised|estofado|estofada|guisado|guisada|braseado|braseada|baked|roasted|horneado|horneada|asado|asada|boiled|cooked|cocido|cocida|hervido|hervida|raw|crudo|cruda)$/;

/** True for a token that only states a preparation: it asks for a state, not for a name. */
function isCueToken(forms: readonly string[]): boolean {
  return forms.some((f) => CUE_WORD.test(f));
}

// ---------------------------------------------------------------------------------------------------------------------
// Word classes used by the rules

/** Words that say how a USDA entry is prepared or described without naming another food. */
const NEUTRAL = new Set([
  'nfs', 'ns', 'as', 'to', 'no', 'added', 'fat', 'without', 'salt', 'made', 'oil', 'type', 'form', 'part', 'method', 'cooking', 'eaten', 'skin', 'not', 'drained',
  'enriched', 'unenriched', 'fortified', 'unspecified', 'raw', 'cooked', 'boiled', 'steamed', 'grilled', 'baked', 'roasted', 'fried', 'broiled', 'braised',
  'stewed', 'sauteed', 'simmered', 'poached',
  'especificar', 'sin', 'grasa', 'anadida', 'anadido', 'sal', 'hecho', 'hecha', 'crudo', 'cruda', 'cocido', 'cocida', 'hervido', 'hervida', 'frito', 'frita',
  'asado', 'asada', 'horneado', 'horneada', 'estofado', 'estofada', 'braseado', 'braseada', 'vapor', 'plancha',
]);

/** Qualifiers of the plain, everyday form of a food. */
const PLAIN = new Set([
  'white', 'whole', 'wheat', 'plain', 'regular', 'fresh', 'ripe', 'mature', 'commercial', 'commercially', 'prepared', 'types', 'type', 'all', 'average',
  'blanco', 'blanca', 'entero', 'entera', 'integral', 'natural', 'fresco', 'fresca', 'maduro', 'madura', 'comun', 'regular',
]);

/** Words of an entry that is not ready to eat: penalized unless the query asks for them. */
const NOT_READY = new Set(['unprepared', 'uncooked', 'purchased', 'dehydrated', 'powder', 'powdered', 'concentrate', 'polvo', 'deshidratado', 'deshidratada']);

/** Uncommon variants of a food: ranked below the ordinary one unless the query names them. */
const SPECIALTY = new Set([
  'glutinous', 'sprouted', 'puffed', 'imitation', 'substitute', 'meatless', 'babyfood', 'baby', 'infant', 'toddler', 'formula', 'flavored', 'sticky',
  'glutinoso', 'glutinosa', 'germinado', 'germinada', 'inflado', 'inflada', 'imitacion', 'sustituto', 'bebes', 'infantil',
]);

/** A part or by-product of an animal: "Chicken skin" is not chicken. */
const BODY_PARTS = new Set(['skin', 'fat', 'bone', 'bones', 'feet', 'piel', 'hueso', 'huesos', 'patas']);

/** A preparation that makes an entry a variant of the plain food ("Rice, fried", "Zucchini, pickled"), unless the query asks for it. */
const VARIANT_PREPARATION = new Set(['fried', 'pickled', 'candied', 'creamed', 'battered', 'breaded', 'smoked', 'stuffed', 'frito', 'frita', 'encurtido', 'encurtida', 'empanizado', 'empanizada']);

/** Products made from a food (not the food): "Oil, avocado", "Muffin, zucchini", "Icing, chocolate". */
const DERIVED_PRODUCTS = new Set([
  'fat', 'grasa', 'oil', 'icing', 'frosting', 'doughnut', 'muffin', 'bread', 'cake', 'cookie', 'cookies', 'pie', 'sauce', 'syrup', 'dressing', 'dip', 'soup', 'salad', 'juice', 'candy',
  'pudding', 'jam', 'jelly', 'butter', 'milk', 'flour', 'chips', 'cracker', 'crackers', 'beverage', 'drink', 'mix', 'bar', 'bars', 'snack', 'snacks', 'candies',
  'aceite', 'glaseado', 'dona', 'galleta', 'galletas', 'tarta', 'pastel', 'salsa', 'jarabe', 'aderezo', 'sopa', 'ensalada', 'jugo', 'dulce', 'budin', 'mermelada', 'harina', 'bebida', 'barra',
]);

/** USDA and WWEIA categories of foods people nearly always eat cooked (a raw entry is rarely what is meant). */
const EATEN_COOKED = /^(poultry products|beef products|pork products|lamb, veal, and game products|finfish and shellfish products|sausages and luncheon meats|cereal grains and pasta|legumes and legume products|chicken|fish|shellfish|pork|ground beef|beef|rice|pasta|beans|turkey|lamb|bacon|frankfurters|sausages|eggs)/i;

// ---------------------------------------------------------------------------------------------------------------------

export function buildVariants(canonical: string, terms: readonly string[]): QueryVariant[] {
  const seen = new Set<string>();
  const out: QueryVariant[] = [];
  const add = (text: string, weight: number) => {
    const norm = normalizeName(text);
    const tokens = tokenForms(text);
    if (!norm || tokens.length === 0 || seen.has(norm)) return;
    seen.add(norm);
    const cue = tokens.map(isCueToken);
    // A query made of cues only ("cooked") has nothing else to match: its tokens count as words.
    out.push({ norm, tokens, cue: cue.every(Boolean) ? cue.map(() => false) : cue, weight });
  };
  add(canonical, 1);
  for (const t of terms) add(t, 0.9);
  return out;
}

/** The words of a normalized query without its preparation cues, unless nothing else is left. */
export function cueFree(words: readonly string[]): string[] {
  const rest = words.filter((w) => !isCueToken(stemForms(w)));
  return rest.length > 0 ? rest : [...words];
}

export function desiredState(prep: Preparation): FoodState | null {
  if (prep === 'raw') return 'raw';
  if (COOKED_PREPARATIONS.has(prep)) return 'cooked';
  if (prep === 'processed') return 'processed';
  return null;
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.includes(x));
const prefixOf = (q: readonly string[], n: readonly string[]): boolean => q.some((x) => x.length >= 2 && n.some((y) => y.length > x.length && y.startsWith(x)));

/** Score 0..1 of one name against one query variant (without state, branded or alias adjustments). */
function nameScore(variant: QueryVariant, name: string, locale: Locale, prefixLastToken: boolean): number {
  let v = variant;
  const nameTokens = tokenForms(name);
  if (nameTokens.length === 0) return 0;
  // The query without its cues: those are not words the name must contain.
  const core = v.tokens.filter((_, i) => !v.cue[i]);
  const cues = v.tokens.filter((_, i) => v.cue[i]);
  const lastIdx = core.length - 1;
  v = { ...v, tokens: core };

  // Which query tokens the name covers: a whole word counts fully, the prefix of a longer word (while typing) half.
  const credit: number[] = v.tokens.map((q, i) => {
    if (nameTokens.some((n) => same(q, n))) return 1;
    return prefixLastToken && i === lastIdx && nameTokens.some((n) => prefixOf(q, n)) ? 0.5 : 0;
  });
  const coverage = credit.reduce((s, x) => s + x, 0) / v.tokens.length;
  if (coverage === 0) return 0;

  const isNeutral = (n: readonly string[]) => n.some((f) => NEUTRAL.has(f));
  const relevant = nameTokens.filter((n) => !isNeutral(n));
  const extras = relevant.filter((n) => !v.tokens.some((q) => same(q, n)) && !(prefixLastToken && prefixOf(v.tokens[lastIdx] as string[], n)));
  // A plain qualifier ("white") weighs half an unrelated word.
  const extraWeight = extras.reduce((s, n) => s + (n.some((f) => PLAIN.has(f)) ? 0.5 : 1), 0);
  const precision = relevant.length === 0 ? 1 : Math.max(0, (relevant.length - extraWeight) / relevant.length);

  const allWhole = credit.every((x) => x === 1);
  const nameNorm = normalizeName(name);
  let score = 0.55 * coverage + 0.25 * precision;
  if (allWhole && extras.length === 0) {
    score += 0.2; // every word of the query and nothing else: an exact match
  } else if (allWhole && (nameNorm.startsWith(v.norm) || v.norm.startsWith(`${nameNorm} `))) {
    score += 0.1; // prefix match
  } else if (credit[0] === 1 && v.tokens.length > 0 && same(v.tokens[0] as string[], nameTokens[0] as string[])) {
    score += 0.1; // USDA names lead with the food noun ("Rice, white, ..."), the head word
  }

  // A cue the name states too ("papas fritas" for "papas fritas") is a small bonus.
  if (cues.some((q) => nameTokens.some((n) => same(q, n)))) score += 0.08;

  // Plain staples over specialty variants: a name whose only extra words are plain qualifiers ("Bread, white") is the everyday form.
  if (coverage === 1) {
    if (extras.length === 0) score += 0.03;
    else if (extras.every((n) => n.some((f) => PLAIN.has(f)))) score += 0.02;
  }

  // "Steak sauce", "Rice cake", "Salmon salad": the query word is a modifier and the entry is about another noun.
  if (locale === 'en') {
    const first = name.split(',')[0] ?? '';
    const firstTokens = tokenForms(first);
    const head = firstTokens[firstTokens.length - 1];
    const headMatched = head !== undefined && v.tokens.some((q) => same(q, head));
    const touchesFirst = firstTokens.some((n) => v.tokens.some((q) => same(q, n)));
    const raw = first;
    if (firstTokens.length > 1 && touchesFirst && !headMatched && head !== undefined && (!isNeutral(head) || head.some((f) => BODY_PARTS.has(f))) && !/[()]/.test(raw)) {
      score -= 0.25; // the entry is about another noun: a sauce, a cake, a salad
    } else if (coverage === 1 && firstTokens.length > 1 && !isNeutral(firstTokens[0] as string[]) && !v.tokens.some((q) => same(q, firstTokens[0] as string[])) && !/[()]/.test(raw)) {
      score -= 0.06; // "Beans and white rice" for "white rice": the entry leads with another food
    }
  }

  return score * v.weight;
}

/** Final 0..1 score of a candidate food for a query. */
export function scoreCandidate(ctx: RankContext, cand: RankCandidate): number {
  let best = 0;
  let bestName = '';
  let bestVariant: QueryVariant | null = null;
  for (const n of cand.names) {
    for (const v of ctx.variants) {
      // An alias is a real name people use, but the entry's own name says more: a hair less.
      const s = nameScore(v, n.name, n.locale, ctx.prefixLastToken) * (n.isAlias ? 0.97 : 1);
      if (s > best) {
        best = s;
        bestName = n.name;
        bestVariant = v;
      }
    }
  }
  if (best === 0) return 0;

  let score = best;
  const nameForms = tokenForms(bestName);
  const queryHas = (words: ReadonlySet<string>) => (bestVariant?.tokens ?? []).some((q) => q.some((f) => words.has(f)));
  // Any name of the food may say it is not ready to eat ("..., frozen, unprepared"), even when the matched name is an alias.
  const allForms = cand.names.flatMap((n) => tokenForms(n.name));
  if (allForms.some((n) => n.some((f) => NOT_READY.has(f))) && !queryHas(NOT_READY)) score -= 0.3; // "unprepared", "as purchased": an ingredient, not what someone ate
  if (allForms.some((n) => n.some((f) => SPECIALTY.has(f))) && !queryHas(SPECIALTY)) score -= 0.08;

  // "Oil, avocado" for "avocado": the entry's head is a product made from the food, and the query did not ask for it.
  const headWord = bestName.split(',')[0]?.trim().split(/\s+/)[0] ?? '';
  const headForms = headWord === '' ? [] : stemForms(normalizeName(headWord));
  if (headForms.some((f) => DERIVED_PRODUCTS.has(f)) && !queryHas(DERIVED_PRODUCTS) && bestName.includes(',')) score -= 0.12;
  // A variant preparation ("Rice, fried") is not the plain food.
  if (allForms.some((n) => n.some((f) => VARIANT_PREPARATION.has(f))) && !queryHas(VARIANT_PREPARATION) && !asksFor(ctx.preparation, 'fried')) score -= 0.08;

  const want = desiredState(ctx.preparation);
  if (want && cand.state !== 'unknown') {
    if (cand.state === want) score += 0.15;
    else if ((want === 'cooked' && cand.state === 'raw') || (want === 'raw' && cand.state === 'cooked')) score -= 0.3;
    else score -= 0.1;
  } else if (!want && cand.state === 'raw' && cand.category && EATEN_COOKED.test(cand.category)) {
    score -= 0.05; // no cue: meat, fish, rice and beans are logged cooked far more often than raw
  }
  const methods = METHOD_WORDS[ctx.preparation];
  if (methods && nameForms.some((n) => n.some((f) => methods.includes(f)))) score += 0.05;
  // The query names one cooking method and the entry another ("steamed" vs "Fried broccoli").
  if (methods && COOKED_PREPARATIONS.has(ctx.preparation) && ctx.preparation !== 'boiled') {
    const other = Object.entries(METHOD_WORDS).filter(([k]) => k !== ctx.preparation);
    const mine = new Set(methods);
    if (other.some(([, words]) => (words as string[]).some((w) => !mine.has(w) && allForms.some((n) => n.includes(w))))) score -= 0.15;
  }
  if (cand.isBranded) score -= 0.2;
  return Math.max(0, score);
}

const asksFor = (prep: Preparation, method: string): boolean => (METHOD_WORDS[prep] ?? []).includes(method);

/** Singular forms of one raw word, for building the full-text query. */
export function wordForms(word: string): string[] {
  return stemForms(word);
}

/**
 * Scores names that did not come from the catalog (the person's imported tables) with the catalog's own rules, so the two kinds of
 * result compare on one scale: the same word matching, plurals, prefix of the word being typed, preparation cues and penalties. The
 * names are not USDA descriptions, so the rule about the head noun of an English description is switched off (locale `es`).
 * Returns 0..1 like `search` does.
 */
export function createNameScorer(query: string, options: { prefixLastToken?: boolean; searchTerms?: readonly string[] } = {}): (name: string) => number {
  const ctx: RankContext = {
    variants: buildVariants(query, options.searchTerms ?? []),
    preparation: detectPreparation(query),
    prefixLastToken: options.prefixLastToken ?? true,
  };
  return (name) => Math.min(1, scoreCandidate(ctx, { names: [{ name, isAlias: false, locale: 'es' }], state: 'unknown', isBranded: false }));
}
