/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * S2 / RN-16: no row, value or food list of an excluded table (ARGENFOODS, BEDCA, the Mexican INCMNSZ table, the Colombian TCAC, the tables
 * listed by LATINFOODS, CIQUAL) may be written anywhere in the repository: code, tests, fixtures, documentation.
 *
 * This test fails if a text file of the repository holds a MARKER of such a table's data. The markers are STRUCTURE, never data: the
 * header row of a published file (its column labels, in their published order, as a copy of the sheet would have them) or the row of
 * identifiers under it. They were read from the publishers' own files on 2026-11-22 for ARGENFOODS. The labels below are the only
 * place a table's real header sequence may appear, which is why this file excludes itself. A preset (`presets.ts`) and the synthetic
 * fixtures name single labels in a different order and never a whole header row.
 *
 * Which tables have markers: only those published as a spreadsheet (a header row to read). BEDCA (web query), the INCMNSZ table
 * (a PDF that no longer exists at its address), the Colombian TCAC (PDF) and the PDF-only LATINFOODS tables give no machine-readable
 * layout to derive a marker from, so nothing here guards them beyond the rule itself and review. CIQUAL's file could not be downloaded
 * on the day (the publisher's site answered "maintenance", HTTP 503): its marker is its identifier columns as the publisher named
 * them in earlier releases, not re-checked.
 */
const MARKERS: Record<string, string[][]> = {
  argenfoods: [
    ['Nº', 'Alimento', 'Género - especie - variedad', 'Energía (kj)', 'Energía (Kcal)', 'Agua (g)', 'Proteínas (g)', 'Grasa Total (g)'],
    ['<ENERC>', '<ENERC>', '<WATER>', '<PROTCNT>', '<FAT>', '<CHOCDF>'],
    ['Grasa Total (g)', 'A-G saturados (g)', 'A-G monoinsaturados (g)', 'A-G poliinsaturados (g)', 'AGPw6 (g)', 'AGPw3 (g)', 'Colesterol (mg)'],
    ['C14:0 mirístico (g)', 'C16:0 palmítico (g)', 'C18:0 esteárico (g)', 'C20:0 araquídico (g)'],
    ['<F14D0>', '<F16D0>', '<F18D0>', '<F20D0>', '<F16D1>', '<F18D1>'],
    ['Cenizas (g)', 'Sodio (mg)', 'Potasio (mg)', 'Calcio (mg)', 'Fósforo (mg)', 'Hierro (mg)', 'Zinc (mg)', 'Tiamina (mg)'],
  ],
  ciqual: [['alim_grp_code', 'alim_ssgrp_code', 'alim_ssssgrp_code', 'alim_grp_nom_fr', 'alim_ssgrp_nom_fr', 'alim_ssssgrp_nom_fr', 'alim_code']],
};

const ROOT = path.resolve(__dirname, '../../../..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo', 'dist', 'android', 'ios', 'coverage', '.gradle', 'catalog-build']);
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|csv|tsv|sql|yml|yaml|html|xml|svg|toml|gradle|properties)$/i;
const THIS_FILE = path.resolve(__filename);
const MAX_BYTES = 8 * 1024 * 1024;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (SKIP_DIRS.has(name)) return [];
    const info = statSync(full);
    if (info.isDirectory()) return files(full);
    return TEXT.test(name) && info.size <= MAX_BYTES ? [full] : [];
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The labels in order, with whatever a copy puts between cells (commas, semicolons, tabs, quotes, brackets, pipes, spaces). */
export function markerPattern(labels: readonly string[]): RegExp {
  return new RegExp(labels.map((l) => escape(l.normalize('NFC'))).join('[^\\p{L}\\p{N}<]{0,8}'), 'iu');
}

/** Which marker of which table a text holds, or null. */
export function findMarker(text: string, markers: Record<string, string[][]> = MARKERS): string | null {
  const normalized = text.normalize('NFC');
  for (const [table, list] of Object.entries(markers)) {
    for (const labels of list) if (markerPattern(labels).test(normalized)) return `${table}: ${labels.slice(0, 3).join(' | ')}…`;
  }
  return null;
}

describe('no data of an excluded table is in the repository (S2)', () => {
  it('the detector finds a header row however it was copied: CSV, semicolons, tabs, a JSON array, a table in Markdown', () => {
    const labels = ['Uno', 'Dos (g)', 'Tres - cuatro', 'Cinco (mg)', 'Seis'];
    const markers = { synthetic: [labels] };
    for (const text of [labels.join(','), labels.join(';'), labels.join('\t'), JSON.stringify(labels), `| ${labels.join(' | ')} |`, labels.map((l) => `"${l}"`).join(', '), labels.join(',').toUpperCase()]) {
      expect(findMarker(`x\n${text}\ny`, markers)).not.toBeNull();
    }
    // Other text, the labels in another order, or only some of them: not a match.
    expect(findMarker(labels.slice(0, 3).join(','), markers)).toBeNull();
    expect(findMarker([...labels].reverse().join(','), markers)).toBeNull();
    expect(findMarker('nothing to see', markers)).toBeNull();
  });

  it('the markers are real header rows of this size (at least four labels in a row), so a single shared word is never a match', () => {
    for (const list of Object.values(MARKERS)) for (const labels of list) expect(labels.length).toBeGreaterThanOrEqual(4);
  });

  it('no text file of the repository holds a marker of any excluded table', () => {
    const all = files(ROOT).filter((file) => path.resolve(file) !== THIS_FILE);
    // The walk really covers the repository: sources, docs and the synthetic fixtures.
    const relative = all.map((file) => path.relative(ROOT, file).split(path.sep).join('/'));
    expect(relative).toEqual(expect.arrayContaining(['docs/catalog-sources.md', 'src/features/foodimport/presets.ts', 'src/features/foodimport/testing/synthetic.ts', 'package.json']));
    const offenders = all.flatMap((file) => {
      const hit = findMarker(readFileSync(file, 'utf8'));
      return hit ? [`${path.relative(ROOT, file)} -> ${hit}`] : [];
    });
    expect(offenders).toEqual([]);
  });
});
