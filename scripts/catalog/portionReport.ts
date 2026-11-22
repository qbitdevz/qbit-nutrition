/// <reference types="node" />
/** Maintainer tool: English words of the portion labels in catalog-build/catalog.db that the portion glossary lacks, most frequent first. */
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { portionLabelEs } from './portions';
import { loadPortionGlossary } from './translations';

const db = new DatabaseSync(path.join(__dirname, '../../catalog-build/catalog.db'), { readOnly: true });
const glossary = loadPortionGlossary(path.join(__dirname, 'data'));
const rows = db.prepare(`SELECT label, count(*) AS n FROM food_portion WHERE locale = 'en' GROUP BY label`).all() as unknown as { label: string; n: number }[];
const missing = new Map<string, { n: number; ex: string }>();
for (const r of rows) {
  for (const w of portionLabelEs(r.label, glossary).missing) {
    const c = missing.get(w) ?? { n: 0, ex: r.label };
    c.n += r.n;
    missing.set(w, c);
  }
}
for (const [w, c] of [...missing].sort((a, b) => b[1].n - a[1].n)) console.log(`${w}\t${c.n}\t${c.ex}`);
console.error(`${missing.size} words missing in ${rows.length} labels`);
