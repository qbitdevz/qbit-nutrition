import { cleanDescription } from './classify';
import { composeSpanish, pluralizeWord, type Glossary } from './compose';
import { SOURCE_PRIORITY } from './dedupe';
import type { SourceFood, TranslationEntry } from './types';

/** How a food name was produced; stored in `food_name.origin`. */
export type NameOrigin = 'source' | 'handwritten' | 'reviewed' | 'composed' | 'synonym';

export interface NameRow {
  locale: 'en' | 'es';
  name: string;
  isAlias: boolean;
  origin: NameOrigin;
}

/** Words that mean the same food in other regions or dialects. `unless`: names containing one of these are left alone. */
export interface SynonymGroup {
  terms: string[];
  unless?: string[];
}

export interface SynonymFile {
  es: SynonymGroup[];
  en: SynonymGroup[];
}

/** Extra names for every food whose English description matches. */
export interface AliasRule {
  /** Regular expression (case-insensitive) over the cleaned English description. */
  match: string;
  en?: string[];
  es?: string[];
}

export interface NameOptions {
  glossary?: Glossary;
  handwritten: readonly TranslationEntry[];
  synonyms?: SynonymFile;
  aliasRules?: readonly AliasRule[];
}

export interface NameStats {
  handwritten: number;
  /** Composed names a person read and accepted; they are stored with origin `reviewed`. */
  reviewed: number;
  composed: number;
  /** English words with no glossary entry, with how many foods need them. Must be empty for a shippable catalog. */
  missingWords: Map<string, number>;
  /** Foods whose Spanish name was the same as another food's and got a qualifier. */
  disambiguated: number;
  /** Handwritten entries that matched no food. */
  unmatchedHandwritten: string[];
}

const strip = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

/** Capitalization of the matched text carried over to the replacement ("Palta" stays capitalized). */
function carryCase(from: string, to: string): string {
  return from[0] !== undefined && from[0] === from[0].toUpperCase() && from[0] !== from[0].toLowerCase()
    ? to.charAt(0).toUpperCase() + to.slice(1)
    : to;
}

/**
 * Replaces every whole-word occurrence of `from` (accents and case ignored, plural endings allowed) with `to`.
 * Returns null when `from` does not occur.
 */
export function replaceTerm(name: string, from: string, to: string): string | null {
  const fromWords = strip(from).split(/\s+/);
  const words = [...name.matchAll(/[\p{L}\p{N}]+/gu)];
  for (let i = 0; i + fromWords.length <= words.length; i++) {
    let plural = false;
    const ok = fromWords.every((fw, k) => {
      const w = strip((words[i + k] as RegExpMatchArray)[0]);
      if (w === fw) return true;
      if (k === fromWords.length - 1 && (w === `${fw}s` || w === `${fw}es`)) {
        plural = true;
        return true;
      }
      return false;
    });
    if (!ok) continue;
    const first = words[i] as RegExpMatchArray;
    const last = words[i + fromWords.length - 1] as RegExpMatchArray;
    const start = first.index as number;
    const end = (last.index as number) + last[0].length;
    const target = to.split(' ');
    if (plural) target[target.length - 1] = pluralizeWord(target[target.length - 1] as string);
    return name.slice(0, start) + carryCase(first[0], target.join(' ')) + name.slice(end);
  }
  return null;
}

/** Alias names obtained by swapping one member of a synonym group for each other member. */
export function synonymAliases(name: string, groups: readonly SynonymGroup[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    if (g.unless?.some((u) => strip(name).includes(strip(u)))) continue;
    for (const from of g.terms) {
      for (const to of g.terms) {
        if (to === from) continue;
        const swapped = replaceTerm(name, from, to);
        if (swapped !== null && !out.includes(swapped)) out.push(swapped);
      }
    }
  }
  return out;
}

/**
 * Builds every name row of the catalog: the English description as published, the Spanish name (handwritten, or composed from
 * the glossary), and aliases from the handwritten table, the alias rules and the synonym groups. Spanish names that two
 * different foods would share get a qualifier so that no two foods display alike.
 */
export function buildNames(foods: readonly SourceFood[], options: NameOptions): { rows: Map<number, NameRow[]>; stats: NameStats } {
  const handwrittenByEnglish = new Map<string, TranslationEntry[]>();
  for (const t of options.handwritten) {
    const k = t.en.toLowerCase();
    handwrittenByEnglish.set(k, [...(handwrittenByEnglish.get(k) ?? []), t]);
  }
  const unmatched = new Set(options.handwritten.map((t) => t.en.toLowerCase()));
  const rules = (options.aliasRules ?? []).map((r) => ({ re: new RegExp(r.match, 'i'), en: r.en ?? [], es: r.es ?? [] }));
  const stats: NameStats = { handwritten: 0, reviewed: 0, composed: 0, missingWords: new Map(), disambiguated: 0, unmatchedHandwritten: [] };
  const rows = new Map<number, NameRow[]>();
  const primaryEs = new Map<number, { name: string; origin: NameOrigin }>();

  for (const food of foods) {
    const en = cleanDescription(food.description);
    const list: NameRow[] = [{ locale: 'en', name: en, isAlias: false, origin: 'source' }];
    const matches = handwrittenByEnglish.get(en.toLowerCase()) ?? [];
    let es: { name: string; origin: NameOrigin } | null = null;
    const aliasEs: NameRow[] = [];
    for (const t of matches) {
      unmatched.delete(en.toLowerCase());
      es = { name: t.es, origin: t.reviewed ? 'reviewed' : 'handwritten' };
      for (const alias of t.aliases ?? []) aliasEs.push({ locale: 'es', name: alias, isAlias: true, origin: 'handwritten' });
    }
    if (es) {
      if (es.origin === 'reviewed') stats.reviewed++;
      else stats.handwritten++;
    }
    else if (options.glossary) {
      const composed = composeSpanish(en, options.glossary);
      for (const w of composed.missing) stats.missingWords.set(w, (stats.missingWords.get(w) ?? 0) + 1);
      es = { name: composed.name, origin: 'composed' };
      stats.composed++;
    }
    if (es) {
      primaryEs.set(food.fdcId, es);
      list.push({ locale: 'es', name: es.name, isAlias: false, origin: es.origin });
    }
    list.push(...aliasEs);
    for (const r of rules) {
      if (!r.re.test(en)) continue;
      for (const n of r.en) list.push({ locale: 'en', name: n, isAlias: true, origin: 'synonym' });
      for (const n of r.es) list.push({ locale: 'es', name: n, isAlias: true, origin: 'synonym' });
    }
    rows.set(food.fdcId, list);
  }

  // Two foods must not display alike in Spanish: the later ones get the distinguishing qualifier.
  const byName = new Map<string, SourceFood[]>();
  for (const food of foods) {
    const es = primaryEs.get(food.fdcId);
    if (!es) continue;
    const key = strip(es.name);
    byName.set(key, [...(byName.get(key) ?? []), food]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    // The most generic food (shortest English description, then the higher-priority source) keeps the plain name.
    const plain = [...group].sort((a, b) => cleanDescription(a.description).length - cleanDescription(b.description).length || SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source) || a.fdcId - b.fdcId)[0] as SourceFood;
    const others = group.filter((f) => f !== plain);
    const used = new Set<string>();
    for (const food of others) {
      let q = qualifierOf(food, group, options.glossary);
      if (used.has(q)) q = `${q}, ${sourceLabel(food)}`;
      if (used.has(q)) q = `n.º ${food.fdcId}`;
      used.add(q);
      const es = primaryEs.get(food.fdcId) as { name: string; origin: NameOrigin };
      const row = (rows.get(food.fdcId) as NameRow[]).find((r) => r.locale === 'es' && !r.isAlias) as NameRow;
      row.name = `${es.name} (${q})`;
      stats.disambiguated++;
    }
  }

  // Synonym aliases come last, from the final display names (English and Spanish).
  if (options.synonyms) {
    for (const food of foods) {
      const list = rows.get(food.fdcId) as NameRow[];
      const have = new Set(list.map((r) => `${r.locale}|${strip(r.name)}`));
      const primaries = list.filter((r) => !r.isAlias);
      for (const p of primaries) {
        const groups = p.locale === 'es' ? options.synonyms.es : options.synonyms.en;
        for (const alias of synonymAliases(p.name, groups)) {
          const key = `${p.locale}|${strip(alias)}`;
          if (have.has(key)) continue;
          have.add(key);
          list.push({ locale: p.locale, name: alias, isAlias: true, origin: 'synonym' });
        }
      }
    }
  }
  stats.unmatchedHandwritten = options.handwritten.filter((t) => unmatched.has(t.en.toLowerCase())).map((t) => t.en);
  return { rows, stats };
}

const sourceLabel = (food: SourceFood): string => (food.source === 'usda_foundation' ? 'Foundation' : food.source === 'usda_sr_legacy' ? 'SR Legacy' : food.source === 'usda_branded' ? 'Branded' : 'FNDDS');

/** What tells a food apart from the others that compose to the same Spanish name: the English words only it has, else its source. */
function qualifierOf(food: SourceFood, group: readonly SourceFood[], glossary?: Glossary): string {
  const words = (f: SourceFood) => new Set(strip(cleanDescription(f.description)).split(/[^a-z0-9]+/).filter(Boolean));
  const mine = words(food);
  const others = group.filter((g) => g !== food).map(words);
  const distinct = [...mine].filter((w) => others.every((o) => !o.has(w)));
  const own = cleanDescription(food.description)
    .split(/[^A-Za-z0-9'%]+/)
    .filter((w) => distinct.includes(strip(w)));
  if (own.length === 0 || own.length > 5 || !glossary) return sourceLabel(food);
  // The distinguishing English words, in Spanish.
  const composed = composeSpanish(own.join(' '), glossary);
  return composed.missing.length === 0 ? composed.name.toLowerCase() : sourceLabel(food);
}
