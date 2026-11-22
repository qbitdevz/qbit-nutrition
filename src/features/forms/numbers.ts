/**
 * Reading numbers people type. Forms never clamp: a value that is not a number, or is outside its
 * range, is reported with a specific message and the typed text stays as it is.
 */

export type ParsedNumber = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'number'; value: number };

const NUMBER = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;

/** "70", "70.5" and "70,5" (decimal comma) are numbers; anything else, including "1e3", is not. */
export function parseNumber(text: string): ParsedNumber {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  if (!NUMBER.test(trimmed)) return { kind: 'invalid' };
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'invalid' };
}

/** A whole number made only of digits ("14", not "14.5" or "-1"). */
export function parseWhole(text: string): ParsedNumber {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'empty' };
  return /^\d{1,9}$/.test(trimmed) ? { kind: 'number', value: Number(trimmed) } : { kind: 'invalid' };
}

/** A message the screen translates: `key` is an i18n key, `params` its interpolation values. */
export interface FieldError {
  key: string;
  params?: Record<string, string | number>;
}

export const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
