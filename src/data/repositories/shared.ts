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
