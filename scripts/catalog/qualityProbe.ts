/// <reference types="node" />
/** Maintainer tool: prints the Spanish-name quality numbers of catalog-build/catalog.db (the gates of __tests__/translationQuality.test.ts). */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { duplicateDisplayNames, englishLeftovers, englishVocabulary, markupLeftovers, sameAsEnglish, spanishVocabulary, type NameRowPair } from './nameQuality';
import { loadGlossary, loadTranslations } from './translations';

const dataDir = path.join(__dirname, 'data');
const db = new DatabaseSync(path.join(__dirname, '../../catalog-build/catalog.db'), { readOnly: true });
const rows = db.prepare(`SELECT f.id, e.name AS en, s.name AS es, s.origin AS origin FROM food f
  JOIN food_name e ON e.food_id = f.id AND e.locale = 'en' AND e.is_alias = 0
  LEFT JOIN food_name s ON s.food_id = f.id AND s.locale = 'es' AND s.is_alias = 0`).all() as unknown as NameRowPair[];
const glossary = loadGlossary(path.join(dataDir, 'glossary'));
const hand = loadTranslations(path.join(dataDir, 'translations.es.json'));
const vocab = spanishVocabulary(glossary, hand.flatMap((t) => [t.es, ...(t.aliases ?? [])]));
console.log('foods', rows.length, 'without Spanish name', rows.filter((r) => !r.es).length);
console.log('same as English:', sameAsEnglish(rows, new Set()).length);
const left = englishLeftovers(rows, englishVocabulary(rows), vocab, new Set(), glossary.keep);
console.log('english leftovers:', [...left].map(([w, ids]) => `${w}(${ids.length})`).join(' '));
console.log('duplicate display names:', duplicateDisplayNames(rows).size);
console.log('markup leftovers:', markupLeftovers(rows).length);
