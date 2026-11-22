/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildGlossary, type Glossary, type GlossaryFile } from './compose';
import type { AliasRule, SynonymFile } from './names';
import type { TranslationEntry } from './types';

/** Reads and validates the Spanish translation table (scripts/catalog/data/translations.es.json). */
export function loadTranslations(file: string): TranslationEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file}: expected an array of {en, es, aliases?}`);
  return parsed.map((e, i) => {
    const entry = e as Partial<TranslationEntry>;
    if (typeof entry.en !== 'string' || typeof entry.es !== 'string' || entry.en === '' || entry.es === '') {
      throw new Error(`${file}: entry ${i} needs non-empty "en" and "es"`);
    }
    return { en: entry.en, es: entry.es, aliases: entry.aliases ?? [] };
  });
}

/** Reads every `*.json` glossary file of a directory (sorted by name, later files win) into one glossary. */
export function loadGlossary(dir: string): Glossary {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  return buildGlossary(
    files.map((f) => {
      const parsed = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as GlossaryFile;
      if (typeof parsed !== 'object' || parsed === null || typeof parsed.terms !== 'object') {
        throw new Error(`${path.join(dir, f)}: expected {"terms": {...}, "phrases"?: {...}, "keep"?: [...]}`);
      }
      return parsed;
    }),
  );
}

/** Reads the synonym groups (`data/synonyms.json`). */
export function loadSynonyms(file: string): SynonymFile {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<SynonymFile>;
  if (!Array.isArray(parsed.es) || !Array.isArray(parsed.en)) throw new Error(`${file}: expected {"es": [...], "en": [...]}`);
  for (const g of [...parsed.es, ...parsed.en]) {
    if (!Array.isArray(g.terms) || g.terms.length < 2) throw new Error(`${file}: every group needs at least two terms`);
  }
  return parsed as SynonymFile;
}

/** Reads the alias rules (`data/aliases.json`). */
export function loadAliasRules(file: string): AliasRule[] {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file}: expected an array of {match, en?, es?}`);
  for (const r of parsed as AliasRule[]) new RegExp(r.match, 'i'); // throws on an invalid pattern
  return parsed as AliasRule[];
}
