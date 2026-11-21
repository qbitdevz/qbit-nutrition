import { useCallback, useMemo, useState } from 'react';

import type { ActivityLevel, Sex, SpecialCondition } from '@/core/nutrition';
import { parseNumber, parseWhole, roundTo, type FieldError } from '../forms/numbers';
import {
  cmFromFeetInches,
  feetInchesFromCm,
  HEIGHT_CM,
  HEIGHT_FEET,
  kgFromPounds,
  MIN_BIRTH_AGE_YEARS,
  poundsFromKg,
  WEIGHT_KG,
  WEIGHT_LB,
  type UnitSystem,
} from './units';

/** What the profile form holds: text as typed, so errors never lose what the person wrote. */
export interface ProfileFormValues {
  unit: UnitSystem;
  sex: Sex | null;
  day: string;
  month: string;
  year: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weight: string;
  activity: ActivityLevel | null;
  /** `none` is the explicit "neither"; both it and null leave the profile without a condition. */
  condition: 'none' | SpecialCondition | null;
}

/** The profile as stored (metric), ready for the repositories. Every field is optional (FR-03). */
export interface ProfileResult {
  unitSystem: UnitSystem;
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  specialCondition: SpecialCondition | null;
}

export type ProfileField = 'birth' | 'height' | 'weight';
export type ProfileErrors = Partial<Record<ProfileField, FieldError>>;

export const emptyProfileValues = (unit: UnitSystem = 'metric'): ProfileFormValues => ({
  unit,
  sex: null,
  day: '',
  month: '',
  year: '',
  heightCm: '',
  heightFt: '',
  heightIn: '',
  weight: '',
  activity: null,
  condition: null,
});

interface StoredProfile {
  unitSystem: UnitSystem;
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  specialCondition: SpecialCondition | null;
}

/** Form values for a stored profile (metric) shown in its own units. */
export function valuesFromStored(profile: StoredProfile | null, weightKg: number | null, unit?: UnitSystem): ProfileFormValues {
  const system = unit ?? profile?.unitSystem ?? 'metric';
  const values = emptyProfileValues(system);
  if (profile) {
    values.sex = profile.sex;
    values.activity = profile.activityLevel;
    values.condition = profile.specialCondition ?? null;
    if (profile.birthDate) {
      const [y, m, d] = profile.birthDate.split('-');
      values.year = String(Number(y));
      values.month = String(Number(m));
      values.day = String(Number(d));
    }
    if (profile.heightCm != null) {
      if (system === 'metric') values.heightCm = String(profile.heightCm);
      else {
        const { feet, inches } = feetInchesFromCm(profile.heightCm);
        values.heightFt = String(feet);
        values.heightIn = String(inches);
      }
    }
  }
  if (weightKg != null) values.weight = system === 'metric' ? String(roundTo(weightKg, 1)) : String(poundsFromKg(weightKg));
  return values;
}

/** Switches units, converting what is already typed when it is a valid number (never discarding it). */
export function convertUnits(values: ProfileFormValues, unit: UnitSystem): ProfileFormValues {
  if (unit === values.unit) return values;
  const next = { ...values, unit };
  const weight = parseNumber(values.weight);
  if (weight.kind === 'number') {
    next.weight = String(unit === 'imperial' ? poundsFromKg(weight.value) : kgFromPounds(weight.value));
  }
  if (unit === 'imperial') {
    const cm = parseNumber(values.heightCm);
    if (cm.kind === 'number') {
      const { feet, inches } = feetInchesFromCm(cm.value);
      next.heightFt = String(feet);
      next.heightIn = String(inches);
    }
  } else {
    const feet = parseWhole(values.heightFt);
    const inches = values.heightIn.trim() === '' ? ({ kind: 'number', value: 0 } as const) : parseWhole(values.heightIn);
    if (feet.kind === 'number' && inches.kind === 'number') next.heightCm = String(cmFromFeetInches(feet.value, inches.value));
  }
  return next;
}

const isoDate = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function validateBirth(values: ProfileFormValues, today: string): { error: FieldError | null; date: string | null } {
  const { day, month, year } = values;
  if (day.trim() === '' && month.trim() === '' && year.trim() === '') return { error: null, date: null };
  if (day.trim() === '' || month.trim() === '' || year.trim() === '') return { error: { key: 'profile.errors.birthIncomplete' }, date: null };
  const d = parseWhole(day);
  const m = parseWhole(month);
  const y = parseWhole(year);
  if (d.kind !== 'number' || m.kind !== 'number' || y.kind !== 'number' || year.trim().length !== 4) {
    return { error: { key: 'profile.errors.birthInvalid' }, date: null };
  }
  const probe = new Date(Date.UTC(y.value, m.value - 1, d.value));
  if (probe.getUTCFullYear() !== y.value || probe.getUTCMonth() !== m.value - 1 || probe.getUTCDate() !== d.value) {
    return { error: { key: 'profile.errors.birthInvalid' }, date: null };
  }
  const iso = isoDate(y.value, m.value, d.value);
  if (iso > today) return { error: { key: 'profile.errors.birthFuture' }, date: null };
  const oldest = Number(today.slice(0, 4)) - MIN_BIRTH_AGE_YEARS;
  if (y.value < oldest) return { error: { key: 'profile.errors.birthOld', params: { year: oldest } }, date: null };
  return { error: null, date: iso };
}

function validateHeight(values: ProfileFormValues): { error: FieldError | null; cm: number | null } {
  if (values.unit === 'metric') {
    const parsed = parseNumber(values.heightCm);
    if (parsed.kind === 'empty') return { error: null, cm: null };
    if (parsed.kind === 'invalid') return { error: { key: 'profile.errors.number' }, cm: null };
    if (parsed.value < HEIGHT_CM.min || parsed.value > HEIGHT_CM.max) {
      return { error: { key: 'profile.errors.height', params: { min: HEIGHT_CM.min, max: HEIGHT_CM.max, unit: 'cm' } }, cm: null };
    }
    return { error: null, cm: roundTo(parsed.value, 1) };
  }
  const feetText = values.heightFt.trim();
  const inchText = values.heightIn.trim();
  if (feetText === '' && inchText === '') return { error: null, cm: null };
  if (feetText === '') return { error: { key: 'profile.errors.heightIncomplete' }, cm: null };
  const feet = parseWhole(feetText);
  if (feet.kind !== 'number' || feet.value < HEIGHT_FEET.min || feet.value > HEIGHT_FEET.max) {
    return { error: { key: 'profile.errors.feet', params: { ...HEIGHT_FEET } }, cm: null };
  }
  const inches = inchText === '' ? ({ kind: 'number', value: 0 } as const) : parseWhole(inchText);
  if (inches.kind !== 'number' || inches.value > 11) return { error: { key: 'profile.errors.inches' }, cm: null };
  const cm = cmFromFeetInches(feet.value, inches.value);
  if (cm < HEIGHT_CM.min || cm > HEIGHT_CM.max) return { error: { key: 'profile.errors.heightImperial' }, cm: null };
  return { error: null, cm };
}

function validateWeight(values: ProfileFormValues): { error: FieldError | null; kg: number | null } {
  const parsed = parseNumber(values.weight);
  if (parsed.kind === 'empty') return { error: null, kg: null };
  if (parsed.kind === 'invalid') return { error: { key: 'profile.errors.number' }, kg: null };
  const range = values.unit === 'metric' ? WEIGHT_KG : WEIGHT_LB;
  if (parsed.value < range.min || parsed.value > range.max) {
    return { error: { key: 'profile.errors.weight', params: { min: range.min, max: range.max, unit: values.unit === 'metric' ? 'kg' : 'lb' } }, kg: null };
  }
  return { error: null, kg: values.unit === 'metric' ? roundTo(parsed.value, 1) : kgFromPounds(parsed.value) };
}

/** Validates every field. `today` is a `YYYY-MM-DD` date. Returns the errors, and the stored form of the profile when there are none. */
export function validateProfile(values: ProfileFormValues, today: string): { errors: ProfileErrors; result: ProfileResult | null } {
  const birth = validateBirth(values, today);
  const height = validateHeight(values);
  const weight = validateWeight(values);
  const errors: ProfileErrors = {};
  if (birth.error) errors.birth = birth.error;
  if (height.error) errors.height = height.error;
  if (weight.error) errors.weight = weight.error;
  if (Object.keys(errors).length > 0) return { errors, result: null };
  return {
    errors,
    result: {
      unitSystem: values.unit,
      sex: values.sex,
      birthDate: birth.date,
      heightCm: height.cm,
      weightKg: weight.kg,
      activityLevel: values.activity,
      specialCondition: values.condition === 'pregnant' || values.condition === 'breastfeeding' ? values.condition : null,
    },
  };
}

export interface ProfileForm {
  values: ProfileFormValues;
  errors: ProfileErrors;
  set: <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void;
  setUnit: (unit: UnitSystem) => void;
  /** Validates one field when the person leaves it. */
  blur: (field: ProfileField) => void;
  /** Validates everything; returns the profile to store, or null with the errors shown. */
  submit: () => ProfileResult | null;
}

/** State and validation of the profile form, shared by onboarding and Settings (`ProfileFields` draws it). */
export function useProfileForm(initial: ProfileFormValues, today: string): ProfileForm {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<ProfileErrors>({});

  const set = useCallback(<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const setUnit = useCallback((unit: UnitSystem) => {
    setValues((current) => convertUnits(current, unit));
    setErrors((current) => ({ ...current, height: undefined, weight: undefined }));
  }, []);

  const blur = useCallback(
    (field: ProfileField) => {
      const { errors: found } = validateProfile(values, today);
      setErrors((current) => ({ ...current, [field]: found[field] }));
    },
    [values, today],
  );

  const submit = useCallback(() => {
    const { errors: found, result } = validateProfile(values, today);
    setErrors(found);
    return result;
  }, [values, today]);

  return useMemo(() => ({ values, errors, set, setUnit, blur, submit }), [values, errors, set, setUnit, blur, submit]);
}
