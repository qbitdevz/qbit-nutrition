import { unitRule, toNutrientUnit, type NutrientAmounts, type NutrientCode, type SourceUnit } from '@/core/nutrition';
import { TEXT_LIMITS, importedPer100gMax, IMPORT_LIMITS } from '@/data';
import { parseValue } from './values';
import { throwIfCancelled, yieldToUi, type CancelToken, type Cell, type TableFile } from './readTypes';

/**
 * What the person confirms before anything is written: which sheet and rows hold foods, which column is the name, the group and each
 * nutrient (with the unit that column is written in), what the values are "per" and how decimals are written. A preset (presets.ts)
 * is nothing but a way to fill this in; the generic path fills it from the header labels (headers.ts).
 */
/**
 * `g100`: per 100 g, taken as it is. `ml100`: per 100 ml, taken as it is and flagged (no density is applied: the app counts the
 * amount a person eats in grams, so 100 ml is treated as 100 g, and the table is marked "per 100 ml"). `kg1`: per 1 kg, divided by 10.
 * `other` (per portion, per 100 kcal, per unit...) cannot be brought to 100 g without inventing a weight: refused.
 */
export type Basis = 'g100' | 'ml100' | 'kg1' | 'other';

export interface NutrientColumn {
  column: number;
  unit: SourceUnit;
  /** The header did not state the unit: the nutrient's own unit was assumed, and the screen says so. */
  unitAssumed: boolean;
}

export interface SheetMapping {
  /** Index in `TableFile.sheets`. */
  sheet: number;
  headerRow: number;
  firstDataRow: number;
  /** -1: none chosen. */
  nameColumn: number;
  groupColumn: number | null;
  /** The sheet's name is the food group (workbooks with one group per sheet). */
  groupFromSheetName: boolean;
  /** One food group for every food of the sheet, read from the sheet's own title (a table published as one file per group). */
  groupText?: string | null;
  nutrients: Partial<Record<NutrientCode, NutrientColumn>>;
}

export interface ImportMapping {
  sheets: SheetMapping[];
  basis: Basis;
  basisAssumed: boolean;
  decimal: ',' | '.';
  /** Set when a preset filled the mapping. */
  presetId: string | null;
}

export type SkipReason = 'no_name' | 'no_values' | 'out_of_range' | 'name_too_long';

export interface ImportedFoodDraft {
  name: string;
  group: string | null;
  /** Per 100 g (or 100 ml: see `basis`), in the units the app stores. A nutrient the table has no number for is absent. */
  per100g: NutrientAmounts;
  sheet: string;
  /** Row index in the sheet, from 0 (a spreadsheet shows it plus one). */
  row: number;
}

export interface SkippedExample {
  sheet: string;
  row: number;
  reason: SkipReason;
  nutrient?: NutrientCode;
  name?: string;
}

export type Blocking =
  | { kind: 'basis_refused' }
  | { kind: 'unit_refused'; nutrient: NutrientCode; unit: SourceUnit; reason: 'iu_ambiguous' | 'incompatible' }
  | { kind: 'no_name_column' }
  | { kind: 'no_nutrients' }
  | { kind: 'no_foods' }
  | { kind: 'too_many_foods'; limit: number };

export interface EnergyMismatch {
  name: string;
  kcal: number;
  /** 4 kcal per g of protein and of carbohydrate, 9 per g of fat. */
  estimated: number;
}

export interface ImportPreview {
  foods: ImportedFoodDraft[];
  basis: Basis;
  counts: {
    foods: number;
    nutrientsMapped: number;
    rowsRead: number;
    blankRows: number;
    skipped: Record<SkipReason, number>;
    /** Cells of a mapped nutrient with a missing-value marker or nothing in them, in the foods kept: stored as unknown. */
    unknownCells: number;
    /** Cells that were neither a number nor a marker: stored as unknown, never guessed. */
    unreadableCells: number;
  };
  skippedExamples: SkippedExample[];
  warnings: { energyMismatch: { count: number; examples: EnergyMismatch[] } };
  /** The first foods, exactly as they will be stored. */
  sample: ImportedFoodDraft[];
  /** Why the import cannot go ahead as mapped; empty when it can. */
  blocking: Blocking[];
}

export interface PreviewOptions {
  cancel?: CancelToken;
  onProgress?: (fraction: number) => void;
}

const EXAMPLES = 10;
const SAMPLE = 5;
const CHECK_EVERY = 2000;

/** The Atwater check: only a warning. Fibre, alcohol and rounding explain small gaps, so only a large one is flagged. */
const ENERGY_MIN_GAP_KCAL = 40;
const ENERGY_MIN_GAP_SHARE = 0.25;

const text = (cell: Cell | undefined): string | null => {
  if (cell === null || cell === undefined) return null;
  const t = String(cell).trim();
  return t === '' ? null : t;
};

/** The blocking problems that come from the mapping alone, before any row is read. */
export function mappingProblems(mapping: ImportMapping): Blocking[] {
  const problems: Blocking[] = [];
  if (mapping.basis === 'other') problems.push({ kind: 'basis_refused' });
  if (mapping.sheets.length === 0 || mapping.sheets.some((s) => s.nameColumn < 0)) problems.push({ kind: 'no_name_column' });
  const mapped = mapping.sheets.flatMap((s) => Object.entries(s.nutrients) as [NutrientCode, NutrientColumn][]);
  if (mapped.length === 0) problems.push({ kind: 'no_nutrients' });
  const seen = new Set<string>();
  for (const [code, column] of mapped) {
    const rule = unitRule(column.unit, code);
    const key = `${code}|${column.unit}`;
    if (rule.kind === 'refused' && !seen.has(key)) {
      seen.add(key);
      problems.push({ kind: 'unit_refused', nutrient: code, unit: column.unit, reason: rule.reason });
    }
  }
  return problems;
}

function* run(file: TableFile, mapping: ImportMapping): Generator<number, ImportPreview, void> {
  const problems = mappingProblems(mapping);
  const refusedUnits = new Set(problems.flatMap((p) => (p.kind === 'unit_refused' ? [`${p.nutrient}|${p.unit}`] : [])));
  const usable = problems.length === 0 || problems.every((p) => p.kind === 'no_foods');

  const foods: ImportedFoodDraft[] = [];
  const skipped: Record<SkipReason, number> = { no_name: 0, no_values: 0, out_of_range: 0, name_too_long: 0 };
  const examples: SkippedExample[] = [];
  const mismatches: EnergyMismatch[] = [];
  let mismatchCount = 0;
  let rowsRead = 0;
  let blankRows = 0;
  let unknownCells = 0;
  let unreadableCells = 0;
  const mappedCodes = new Set<NutrientCode>();
  for (const s of mapping.sheets) for (const code of Object.keys(s.nutrients) as NutrientCode[]) mappedCodes.add(code);

  const total = mapping.sheets.reduce((sum, s) => sum + Math.max(0, (file.sheets[s.sheet]?.rows.length ?? 0) - s.firstDataRow), 0) || 1;
  const factor = mapping.basis === 'kg1' ? 10 : 1;
  const skip = (reason: SkipReason, sheet: string, row: number, extra: Partial<SkippedExample> = {}) => {
    skipped[reason] += 1;
    if (examples.length < EXAMPLES) examples.push({ sheet, row, reason, ...extra });
  };

  let done = 0;
  if (usable) {
    for (const sheetMapping of mapping.sheets) {
      const sheet = file.sheets[sheetMapping.sheet];
      if (!sheet) continue;
      const entries = Object.entries(sheetMapping.nutrients) as [NutrientCode, NutrientColumn][];
      for (let r = sheetMapping.firstDataRow; r < sheet.rows.length; r++) {
        done += 1;
        if (done % CHECK_EVERY === 0) yield done / total;
        const row = sheet.rows[r]!;
        rowsRead += 1;
        if (row.every((c) => c === null || c === undefined)) {
          blankRows += 1;
          continue;
        }
        const name = text(row[sheetMapping.nameColumn]);
        if (name === null) {
          skip('no_name', sheet.name, r);
          continue;
        }
        if (name.length > TEXT_LIMITS.name) {
          skip('name_too_long', sheet.name, r, { name: `${name.slice(0, 40)}…` });
          continue;
        }

        const per100g: NutrientAmounts = {};
        let unknown = 0;
        let unreadable = 0;
        let outOfRange: NutrientCode | null = null;
        for (const [code, column] of entries) {
          if (refusedUnits.has(`${code}|${column.unit}`)) continue;
          const parsed = parseValue(row[column.column] ?? null, mapping.decimal);
          if (parsed.kind === 'missing') {
            unknown += 1;
            continue;
          }
          if (parsed.kind === 'invalid') {
            unknown += 1;
            unreadable += 1;
            continue;
          }
          const converted = toNutrientUnit(parsed.value, column.unit, code);
          if (converted === null) continue;
          const value = factor === 1 ? converted : converted / factor;
          if (!(value >= 0 && value <= importedPer100gMax(code))) {
            outOfRange ??= code;
            continue;
          }
          per100g[code] = value;
        }
        if (outOfRange) {
          skip('out_of_range', sheet.name, r, { nutrient: outOfRange, name });
          continue;
        }
        if (Object.keys(per100g).length === 0) {
          skip('no_values', sheet.name, r, { name });
          continue;
        }
        unknownCells += unknown;
        unreadableCells += unreadable;

        const group = sheetMapping.groupFromSheetName ? sheet.name : sheetMapping.groupText ? sheetMapping.groupText : sheetMapping.groupColumn !== null ? text(row[sheetMapping.groupColumn]) : null;
        foods.push({ name, group, per100g, sheet: sheet.name, row: r });

        const { kcal, protein, carbs, fat } = per100g;
        if (kcal !== undefined && protein !== undefined && carbs !== undefined && fat !== undefined) {
          const estimated = 4 * protein + 4 * carbs + 9 * fat;
          const gap = Math.abs(kcal - estimated);
          if (gap > ENERGY_MIN_GAP_KCAL && gap / Math.max(estimated, 1) > ENERGY_MIN_GAP_SHARE) {
            mismatchCount += 1;
            if (mismatches.length < EXAMPLES) mismatches.push({ name, kcal, estimated });
          }
        }
      }
    }
  }

  const blocking = [...problems];
  if (foods.length > IMPORT_LIMITS.foodsPerCollection) blocking.push({ kind: 'too_many_foods', limit: IMPORT_LIMITS.foodsPerCollection });
  if (usable && foods.length === 0) blocking.push({ kind: 'no_foods' });

  return {
    foods,
    basis: mapping.basis,
    counts: { foods: foods.length, nutrientsMapped: mappedCodes.size, rowsRead, blankRows, skipped, unknownCells, unreadableCells },
    skippedExamples: examples,
    warnings: { energyMismatch: { count: mismatchCount, examples: mismatches } },
    sample: foods.slice(0, SAMPLE),
    blocking,
  };
}

/** The preview in one go. Fine for tests and small tables; the screen uses `buildPreviewAsync`. */
export function buildPreview(file: TableFile, mapping: ImportMapping): ImportPreview {
  const steps = run(file, mapping);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/** The same, giving the UI a turn every few thousand rows, reporting progress, and stopping when cancelled. */
export async function buildPreviewAsync(file: TableFile, mapping: ImportMapping, options: PreviewOptions = {}): Promise<ImportPreview> {
  const steps = run(file, mapping);
  for (;;) {
    throwIfCancelled(options.cancel);
    const next = steps.next();
    if (next.done) {
      options.onProgress?.(1);
      return next.value;
    }
    options.onProgress?.(next.value);
    await yieldToUi();
  }
}

