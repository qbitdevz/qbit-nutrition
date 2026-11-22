import { pluralizeWord, type Glossary } from './compose';

/** A food with its English and Spanish display names, as read back from catalog.db. */
export interface NameRowPair {
  id: number;
  en: string;
  es: string;
  origin: string;
}

export const strip = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
const words = (s: string): string[] => strip(s).split(/[^a-z0-9'’]+/).filter(Boolean);

/** Every Spanish word the glossary can emit (all agreement forms and plurals), plus the given extra texts and the keep list. */
export function spanishVocabulary(glossary: Glossary, extraTexts: readonly string[]): Set<string> {
  const vocab = new Set<string>();
  const add = (text: string) => {
    for (const w of words(text)) {
      vocab.add(w);
      vocab.add(strip(pluralizeWord(w)));
    }
  };
  for (const t of [...glossary.terms.values(), ...glossary.phrases.values()]) {
    for (const suffix of ['o', 'a', 'os', 'as']) add(t.es.replace(/=/g, '').replace(/@/g, suffix));
  }
  for (const k of glossary.keep) add(k);
  for (const t of extraTexts) add(t);
  return vocab;
}

/** Foods whose Spanish name equals the English one (case-insensitive, accents kept) and is not an allowed exception. */
export function sameAsEnglish(rows: readonly NameRowPair[], allowed: ReadonlySet<string>): NameRowPair[] {
  return rows.filter((r) => r.en.toLowerCase() === r.es.toLowerCase() && !allowed.has(r.en.toLowerCase()));
}

/**
 * Tokens of Spanish names that are English words (they occur in some English description) and that Spanish does not
 * use either (not in the vocabulary), minus brand-style ALL-CAPS words and the explicit allow-list.
 */
export function englishLeftovers(
  names: readonly { id: number; es: string }[],
  englishVocab: ReadonlySet<string>,
  spanishVocab: ReadonlySet<string>,
  allowed: ReadonlySet<string>,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const n of names) {
    for (const raw of n.es.split(/[^\p{L}\p{N}'’]+/u).filter(Boolean)) {
      if (/^[A-Z0-9'’&.-]+$/.test(raw) && raw.length > 1) continue; // brand and restaurant names
      const t = strip(raw);
      if (/^\d/.test(t) || !englishVocab.has(t) || spanishVocab.has(t) || allowed.has(t)) continue;
      out.set(t, [...(out.get(t) ?? []), n.id]);
    }
  }
  return out;
}

export function englishVocabulary(rows: readonly { en: string }[]): Set<string> {
  return new Set(rows.flatMap((r) => words(r.en)));
}

/** Foods that share a Spanish display name with another food. */
export function duplicateDisplayNames(rows: readonly NameRowPair[]): Map<string, NameRowPair[]> {
  const by = new Map<string, NameRowPair[]>();
  for (const r of rows) by.set(strip(r.es), [...(by.get(strip(r.es)) ?? []), r]);
  return new Map([...by].filter(([, list]) => list.length > 1));
}

/** Composer markup or sloppy text that must never reach a display name. */
export function markupLeftovers(rows: readonly { id: number; es: string }[]): number[] {
  return rows.filter((r) => /[@=\u0001]|\s{2}|^\s|\s$|\s,/.test(r.es) || /^[a-zà-ÿ]/.test(r.es)).map((r) => r.id);
}
