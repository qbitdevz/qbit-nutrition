import { roundTo } from '../forms/numbers';

export type UnitSystem = 'metric' | 'imperial';

/** Storage is always metric (FR-04): these convert what is typed in imperial units. */
export const CM_PER_INCH = 2.54;
export const KG_PER_POUND = 0.45359237;

/** Plausible ranges. Anything outside is rejected with a message, never clamped. */
export const HEIGHT_CM = { min: 50, max: 260 } as const;
export const WEIGHT_KG = { min: 20, max: 500 } as const;
export const WEIGHT_LB = { min: 45, max: 1100 } as const;
export const HEIGHT_FEET = { min: 1, max: 8 } as const;
export const MIN_BIRTH_AGE_YEARS = 120;

export const cmFromFeetInches = (feet: number, inches: number): number => roundTo((feet * 12 + inches) * CM_PER_INCH, 1);
export const kgFromPounds = (pounds: number): number => roundTo(pounds * KG_PER_POUND, 1);
export const poundsFromKg = (kg: number): number => roundTo(kg / KG_PER_POUND, 0);

/** Feet and whole inches for a height in centimetres (inches rounded, carrying into feet). */
export function feetInchesFromCm(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}
