import type { NutrientCode, SourceUnit } from '@/core/nutrition';
import { isNameHeader, labelStrength } from './headers';
import type { Basis, ImportMapping, ImportPreview, SkipReason } from './mapping';
import type { Cell, TableFile } from './readTypes';

/**
 * How sure the importer is about what it read, by explicit rules (B4). The owner imported a dozen tables with the default mapping without
 * looking at it: the default path has to be honest. When the importer is CONFIDENT the preview says in one line what was recognised and
 * the mapping screen is optional. When it is not, the preview says exactly which point is weak and asks the person to confirm THAT point;
 * nothing is imported on a weak point nobody confirmed.
 *
 * Confident means none of these rules fires. Each one is a point to confirm (a `ConfirmPoint`), always listed in this order:
 *
 *  1. `weak_columns`   a nutrient column was matched only through an abbreviation in its header ("Prot", "CHO", "Na", "AGS"), not through
 *                      the name of the nutrient. Not for a recognised published layout (a preset), which names its columns by tag.
 *  2. `units_assumed`  a nutrient column's header does not state its unit: the nutrient's own unit was assumed ("Energía" read as kcal).
 *  3. `basis_assumed`  the table does not say what the values are per: per 100 g was assumed.
 *  4. `basis_ml`       the table says per 100 ml: the amount a person eats is counted in grams, so 100 ml is used as 100 g (no density).
 *  5. `name_guessed`   no header names the foods: the name column was found by looking at the data. Not for a preset.
 *  6. `energy_mismatch` at least 3 foods, and at least 20% of them, have an energy that does not fit their protein, carbohydrate and fat
 *                      (the Atwater check of the preview): a wrong column or unit is likely.
 *  7. `many_skipped`   at least 3 rows, and at least 30% of the rows, were left out because a value is impossible for a food: a wrong unit is likely.
 *
 * What the person has looked at on the mapping screen (`reviewed`) is not asked again: that screen shows rules 1 to 5 (the column of every
 * nutrient, the unit "not stated: kcal assumed", the basis, the name column). Rules 6 and 7 are about the data and stay.
 */
export type ConfirmPoint =
  | { kind: 'weak_columns'; nutrients: NutrientCode[] }
  | { kind: 'units_assumed'; units: { nutrient: NutrientCode; unit: SourceUnit }[] }
  | { kind: 'basis_assumed' }
  | { kind: 'basis_ml' }
  | { kind: 'name_guessed'; column: number }
  | { kind: 'energy_mismatch'; count: number; total: number }
  | { kind: 'many_skipped'; count: number; total: number };

export type ConfirmKind = ConfirmPoint['kind'];

export interface Assessment {
  /** A published layout was recognised (`presetName`), or the columns were read from the headers. */
  recognition: 'preset' | 'headers';
  presetName: string | null;
  /** Nutrients the table has a column for. */
  nutrients: number;
  basis: Basis;
  /** What to confirm before importing; empty when the importer is confident. */
  confirm: ConfirmPoint[];
  confident: boolean;
}

export const ENERGY_MISMATCH_MIN_COUNT = 3;
export const ENERGY_MISMATCH_MIN_SHARE = 0.2;
export const MANY_SKIPPED_MIN_COUNT = 3;
export const MANY_SKIPPED_MIN_SHARE = 0.3;

const SKIP_REASONS: SkipReason[] = ['no_name', 'no_values', 'out_of_range', 'name_too_long'];

const cellText = (cell: Cell | undefined): string => (cell === null || cell === undefined ? '' : String(cell));

export function assessMapping(file: TableFile, mapping: ImportMapping, preview: ImportPreview, options: { preset: string | null; reviewed: boolean }): Assessment {
  const { preset, reviewed } = options;
  const confirm: ConfirmPoint[] = [];

  if (!reviewed) {
    if (!preset) {
      const weak = new Set<NutrientCode>();
      for (const sheet of mapping.sheets) {
        const header = file.sheets[sheet.sheet]?.rows[sheet.headerRow] ?? [];
        for (const [code, column] of Object.entries(sheet.nutrients) as [NutrientCode, { column: number }][]) {
          if (labelStrength(code, cellText(header[column.column])) === 'weak') weak.add(code);
        }
      }
      if (weak.size > 0) confirm.push({ kind: 'weak_columns', nutrients: [...weak] });
    }

    const assumed: { nutrient: NutrientCode; unit: SourceUnit }[] = [];
    for (const sheet of mapping.sheets) {
      for (const [code, column] of Object.entries(sheet.nutrients) as [NutrientCode, { unitAssumed: boolean; unit: SourceUnit }][]) {
        if (column.unitAssumed && !assumed.some((a) => a.nutrient === code)) assumed.push({ nutrient: code, unit: column.unit });
      }
    }
    if (assumed.length > 0) confirm.push({ kind: 'units_assumed', units: assumed });

    if (mapping.basisAssumed) confirm.push({ kind: 'basis_assumed' });
    else if (mapping.basis === 'ml100') confirm.push({ kind: 'basis_ml' });

    if (!preset) {
      for (const sheet of mapping.sheets) {
        const header = file.sheets[sheet.sheet]?.rows[sheet.headerRow] ?? [];
        if (sheet.nameColumn >= 0 && !isNameHeader(cellText(header[sheet.nameColumn]))) {
          confirm.push({ kind: 'name_guessed', column: sheet.nameColumn });
          break;
        }
      }
    }
  }

  const mismatch = preview.warnings.energyMismatch.count;
  if (mismatch >= ENERGY_MISMATCH_MIN_COUNT && preview.counts.foods > 0 && mismatch / preview.counts.foods >= ENERGY_MISMATCH_MIN_SHARE) {
    confirm.push({ kind: 'energy_mismatch', count: mismatch, total: preview.counts.foods });
  }
  const skipped = SKIP_REASONS.reduce((sum, reason) => sum + preview.counts.skipped[reason], 0);
  const considered = preview.counts.rowsRead - preview.counts.blankRows;
  if (skipped >= MANY_SKIPPED_MIN_COUNT && considered > 0 && skipped / considered >= MANY_SKIPPED_MIN_SHARE) {
    confirm.push({ kind: 'many_skipped', count: skipped, total: considered });
  }

  return {
    recognition: preset ? 'preset' : 'headers',
    presetName: preset,
    nutrients: preview.counts.nutrientsMapped,
    basis: mapping.basis,
    confirm,
    confident: confirm.length === 0,
  };
}

/** What the one-line summary of a recognised table needs (the screen words it in the person's language). */
export function recognitionLine(assessment: Assessment): { key: 'preset' | 'headers'; nutrients: number; basis: Basis; preset: string | null } {
  return { key: assessment.recognition, nutrients: assessment.nutrients, basis: assessment.basis, preset: assessment.presetName };
}
