/// <reference types="node" />
import { readFileSync } from 'node:fs';
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
