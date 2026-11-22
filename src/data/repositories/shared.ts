import type { AppDatabase } from '../database';
import { DataError } from '../errors';
import { isLocalDate } from '../localDate';
import { NUTRIENT_CODES, type NutrientAmounts, type NutrientCode } from '../../core/nutrition';

export interface RepositoryContext {
  db: AppDatabase;
  /** Clock for `created_at` / `updated_at` style columns. */
  now: () => Date;
  newId: () => string;
}

export const invalid = (message: string): DataError => new DataError('invalid_input', message);

/**
 * Longest text each kind of value may hold. The export format (`features/data/exportFormat.ts`) uses the same numbers, so
 * whatever the app accepts can always be exported, and the importer refuses nothing the app itself would have written.
 */
export const TEXT_LIMITS = { name: 500, label: 200, model: 500, url: 2000, mealName: 2000, note: 20_000, id: 200 } as const;

/** Meal photos live at `photos/<plain name>.jpg`; no path can leave the folder. One rule for the repositories, the export file and the importer. */
export const PHOTO_PATH_PATTERN = /^photos\/[A-Za-z0-9._-]{1,120}\.jpg$/;

export function requireMaxLength(value: string | null | undefined, max: number, label: string): void {
  if (value != null && value.length > max) throw invalid(`${label} must be at most ${max} characters, got ${value.length}`);
}

export function requireFinite(value: number, label: string, { min }: { min?: number } = {}): void {
  if (!Number.isFinite(value) || (min !== undefined && value < min)) {
    throw invalid(`${label} must be a finite number${min !== undefined ? ` >= ${min}` : ''}, got ${value}`);
  }
}

export function requireLocalDate(value: string, label: string): void {
  if (!isLocalDate(value)) throw invalid(`${label} must be a YYYY-MM-DD date, got "${value}"`);
}

/** The four headline nutrients live in `meal_item` columns; everything else in the side table. */
export const HEADLINE_CODES = ['kcal', 'protein', 'carbs', 'fat'] as const;
export type HeadlineCode = (typeof HEADLINE_CODES)[number];

const NUTRIENT_SET: ReadonlySet<string> = new Set(NUTRIENT_CODES);
const HEADLINE_SET: ReadonlySet<string> = new Set(HEADLINE_CODES);
export const isHeadline = (code: string): boolean => HEADLINE_SET.has(code);

/** Entries of `amounts` as `[code, value]`, validating codes and values. */
export function nutrientEntries(amounts: NutrientAmounts, label: string): [NutrientCode, number][] {
  const out: [NutrientCode, number][] = [];
  for (const [code, value] of Object.entries(amounts)) {
    if (value === undefined) continue;
    if (!NUTRIENT_SET.has(code)) throw invalid(`${label}: unknown nutrient code "${code}"`);
    requireFinite(value, `${label}.${code}`, { min: 0 });
    out.push([code as NutrientCode, value]);
  }
  return out;
}
