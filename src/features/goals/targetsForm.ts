import { useCallback, useMemo, useState } from 'react';

import { VALUE_LIMITS } from '@/data';
import { parseWhole, type FieldError } from '../forms/numbers';

export type TargetField = 'kcal' | 'protein' | 'carbs' | 'fat';
export type TargetValues = Record<TargetField, string>;
/** The targets as stored: null means "track without this target". */
export type TargetNumbers = Record<TargetField, number | null>;

/** Typo guards for targets typed by hand. Values outside are rejected with a message, never clamped. */
export const TARGET_RANGES: Record<TargetField, { min: number; max: number }> = VALUE_LIMITS.targets;

export const TARGET_FIELDS: readonly TargetField[] = ['kcal', 'protein', 'carbs', 'fat'];

export const emptyTargetValues = (): TargetValues => ({ kcal: '', protein: '', carbs: '', fat: '' });

export const targetValuesFrom = (numbers: Partial<TargetNumbers>): TargetValues => ({
  kcal: numbers.kcal != null ? String(numbers.kcal) : '',
  protein: numbers.protein != null ? String(numbers.protein) : '',
  carbs: numbers.carbs != null ? String(numbers.carbs) : '',
  fat: numbers.fat != null ? String(numbers.fat) : '',
});

/** Empty is allowed (no target); anything else must be a whole number inside the range. */
export function validateTarget(field: TargetField, text: string): { error: FieldError | null; value: number | null } {
  const parsed = parseWhole(text);
  if (parsed.kind === 'empty') return { error: null, value: null };
  if (parsed.kind === 'invalid') return { error: { key: 'targets.errors.whole' }, value: null };
  const { min, max } = TARGET_RANGES[field];
  if (parsed.value < min || parsed.value > max) return { error: { key: 'targets.errors.range', params: { min, max } }, value: null };
  return { error: null, value: parsed.value };
}

export interface TargetsForm {
  values: TargetValues;
  errors: Partial<Record<TargetField, FieldError>>;
  /** True when some value differs from the one the form started with (an edited proposal). */
  edited: boolean;
  set: (field: TargetField, text: string) => void;
  blur: (field: TargetField) => void;
  /** Validates every field; returns the numbers to store, or null with the errors shown. */
  submit: () => TargetNumbers | null;
}

export function useTargetsForm(initial: TargetValues): TargetsForm {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<TargetField, FieldError>>>({});

  const set = useCallback((field: TargetField, text: string) => setValues((current) => ({ ...current, [field]: text })), []);

  const blur = useCallback(
    (field: TargetField) => setErrors((current) => ({ ...current, [field]: validateTarget(field, values[field]).error ?? undefined })),
    [values],
  );

  const submit = useCallback((): TargetNumbers | null => {
    const found: Partial<Record<TargetField, FieldError>> = {};
    const numbers = { kcal: null, protein: null, carbs: null, fat: null } as TargetNumbers;
    for (const field of TARGET_FIELDS) {
      const { error, value } = validateTarget(field, values[field]);
      if (error) found[field] = error;
      numbers[field] = value;
    }
    setErrors(found);
    return Object.keys(found).length > 0 ? null : numbers;
  }, [values]);

  const edited = TARGET_FIELDS.some((field) => values[field].trim() !== initial[field].trim());
  return useMemo(() => ({ values, errors, edited, set, blur, submit }), [values, errors, edited, set, blur, submit]);
}
