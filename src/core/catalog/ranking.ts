import { normalizeName, tokenize } from './text';
import type { FoodState, Preparation } from './types';

/** Minimum score for a catalog candidate to be accepted (docs/07 section 6, step 4). */
export const DEFAULT_MATCH_THRESHOLD = 0.55;

/** One way of writing what we look for: the canonical name or one search term. */
export interface QueryVariant {
  norm: string;
  tokens: string[];
  /** Canonical name counts fully; search terms slightly less. */
  weight: number;
}

export interface RankContext {
  variants: QueryVariant[];
  preparation: Preparation;
  /** True while the user is typing: the last query token may be a prefix. */
  prefixLastToken: boolean;
}

export interface RankCandidate {
  names: string[];
  state: FoodState;
  isBranded: boolean;
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
  boiled: ['boiled', 'simmered'],
  steamed: ['steamed'],
  grilled: ['grilled', 'broiled'],
  baked: ['baked', 'roasted'],
  fried: ['fried'],
  sauteed: ['sauteed', 'fried'],
  stewed: ['stewed', 'braised'],
};

export function buildVariants(canonical: string, terms: readonly string[]): QueryVariant[] {
  const seen = new Set<string>();
  const out: QueryVariant[] = [];
  const add = (text: string, weight: number) => {
    const norm = normalizeName(text);
    const tokens = tokenize(text);
    if (!norm || tokens.length === 0 || seen.has(norm)) return;
    seen.add(norm);
    out.push({ norm, tokens, weight });
  };
  add(canonical, 1);
  for (const t of terms) add(t, 0.9);
  return out;
}

export function desiredState(prep: Preparation): FoodState | null {
  if (prep === 'raw') return 'raw';
  if (COOKED_PREPARATIONS.has(prep)) return 'cooked';
  if (prep === 'processed') return 'processed';
  return null;
}

function tokenHit(q: string, nameTokens: readonly string[], prefix: boolean): boolean {
  return nameTokens.some((n) => n === q || (prefix && n.startsWith(q)));
}

/** Score 0..1 of one name against one query variant (without state or branded adjustments). */
function nameScore(v: QueryVariant, name: string, prefixLastToken: boolean): number {
  const nameTokens = tokenize(name);
  if (nameTokens.length === 0) return 0;
  const lastIdx = v.tokens.length - 1;
  let covered = 0;
  v.tokens.forEach((q, i) => {
    if (tokenHit(q, nameTokens, prefixLastToken && i === lastIdx)) covered += 1;
  });
  const coverage = covered / v.tokens.length;
  if (coverage === 0) return 0;
  const queryHit = (n: string) => v.tokens.some((q, i) => q === n || (prefixLastToken && i === lastIdx && n.startsWith(q)));
  const precision = nameTokens.filter(queryHit).length / nameTokens.length;

  const nameNorm = normalizeName(name);
  const sameTokens = coverage === 1 && precision === 1;
  let score = 0.55 * coverage + 0.25 * precision;
  if (nameNorm === v.norm || sameTokens) {
    score += 0.2; // exact match
  } else if (nameNorm.startsWith(v.norm) || v.norm.startsWith(`${nameNorm} `)) {
    score += 0.1; // prefix match
  } else if (v.tokens.includes(nameTokens[0] as string)) {
    score += 0.1; // USDA names lead with the food noun ("Rice, white, ..."), the head word
  }
  return Math.min(1, score) * v.weight;
}

/** Final 0..1 score of a candidate food for a query. */
export function scoreCandidate(ctx: RankContext, cand: RankCandidate): number {
  let best = 0;
  let bestName = '';
  for (const name of cand.names) {
    for (const v of ctx.variants) {
      const s = nameScore(v, name, ctx.prefixLastToken);
      if (s > best) {
        best = s;
        bestName = name;
      }
    }
  }
  if (best === 0) return 0;

  let score = best;
  const want = desiredState(ctx.preparation);
  if (want && cand.state !== 'unknown') {
    if (cand.state === want) score += 0.15;
    else if ((want === 'cooked' && cand.state === 'raw') || (want === 'raw' && cand.state === 'cooked')) score -= 0.3;
    else score -= 0.1;
  }
  const methods = METHOD_WORDS[ctx.preparation];
  if (methods) {
    const nameTokens = tokenize(bestName);
    if (methods.some((m) => nameTokens.includes(m))) score += 0.05;
  }
  if (cand.isBranded) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}
