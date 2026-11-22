/// <reference types="node" />
import { readFileSync } from 'node:fs';
import type { AliasRule } from './names';
import type { SourceFood, TranslationEntry } from './types';

type Snapshot = SourceFood & { es: string; aliasesEs: string[]; aliasesEn: string[]; dataFile: string };

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reads `data/regional-foods.json` (the reviewed Branded Foods selection, see regional.ts) into what the builder takes. */
export function loadRegional(file: string): { foods: SourceFood[]; translations: TranslationEntry[]; aliasRules: AliasRule[] } {
  const snapshot = JSON.parse(readFileSync(file, 'utf8')) as Snapshot[];
  return {
    foods: snapshot.map(({ es: _es, aliasesEs: _a, aliasesEn: _b, dataFile: _c, ...food }) => food),
    translations: snapshot.map((s) => ({ en: s.description, es: s.es, aliases: s.aliasesEs })),
    aliasRules: snapshot
      .filter((s) => s.aliasesEn.length > 0)
      .map((s) => ({ match: `^${escapeRe(s.description)}$`, en: s.aliasesEn })),
  };
}
