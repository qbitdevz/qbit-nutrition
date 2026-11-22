import {
  ACTIVITY_FACTORS,
  DEFAULT_MINIMUM_DAILY_KCAL,
  FAT_MIN_SHARE,
  FORMULA_VERSION,
  GOAL_ADJUSTMENT,
  KCAL_PER_GRAM,
  MIFFLIN_ST_JEOR,
  MINIMUM_AGE_YEARS,
  PROTEIN_G_PER_KG,
  PROTEIN_MAX_SHARE,
} from './target-constants';
import type { ActivityLevel, GoalType, Pace, Sex } from './target-constants';

export type SpecialCondition = 'pregnant' | 'breastfeeding';

/** What the person told the app. Every field is optional (docs/02 FR-03); null and undefined both mean "not given". */
export interface ProfileInput {
  sex?: Sex | null;
  /** Local date, `YYYY-MM-DD`. */
  birthDate?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: ActivityLevel | null;
  specialCondition?: SpecialCondition | null;
}

export interface GoalInput {
  type: GoalType;
  /** Required for `lose_fat` and `gain_muscle`, ignored for `maintain`. */
  pace?: Pace | null;
}

export interface ProposeOptions {
  /** Local date, `YYYY-MM-DD`, the age is computed at. Passed in so the function does no I/O and reads no clock. */
  referenceDate: string;
  /** The user's minimum daily energy (S3). Defaults to `DEFAULT_MINIMUM_DAILY_KCAL` for the person's sex. */
  minimumDailyKcal?: number;
}

export type MissingField = 'sex' | 'birthDate' | 'heightCm' | 'weightKg' | 'activityLevel' | 'pace';

export interface TargetProposal {
  kind: 'proposal';
  /** Which constants produced this proposal; store it on `goal.formula_version`. */
  formulaVersion: string;
  /** Whole kcal. */
  kcal: number;
  /** Whole grams. Carbohydrate is the remainder, so 4*protein + 4*carbs + 9*fat is within 2 kcal of `kcal`. */
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** The steps, for the "how this is calculated" screen. */
  restingKcal: number;
  maintenanceKcal: number;
  /** Fraction of maintenance added (positive) or removed (negative). */
  adjustment: number;
  ageYears: number;
}

/**
 * A proposal that was not made. It never carries targets; `minimumKcal` is the minimum that was applied,
 * not a target. A person under any of these can still log food (docs/02 section 4).
 */
export type NoProposal =
  | { kind: 'no_proposal'; reason: 'missing_data'; missing: MissingField[] }
  | { kind: 'no_proposal'; reason: 'under_18' }
  | { kind: 'no_proposal'; reason: 'special_condition'; condition: SpecialCondition }
  | { kind: 'no_proposal'; reason: 'below_minimum'; minimumKcal: number };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string | null | undefined): [number, number, number] | null {
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/**
 * Completed years at `reference`. The birthday counts from its own date: someone born on 15 March is 18
 * on 15 March, 17 the day before. Born on 29 February: the birthday counts from 1 March in other years.
 */
function ageOn(birth: [number, number, number], reference: [number, number, number]): number {
  let age = reference[0] - birth[0];
  if (reference[1] < birth[1] || (reference[1] === birth[1] && reference[2] < birth[2])) age -= 1;
  return age;
}

const usable = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Daily energy and macronutrient targets (docs/02 section 4), or the reason none is proposed (RN-08).
 *
 * Checks, in this order, so the most protective reason wins and the person is not asked for data that
 * would not change the outcome:
 *  1. pregnancy or breastfeeding;
 *  2. under 18 (when the birth date is usable);
 *  3. missing or unusable data (a non-positive or non-finite number, a malformed date, counts as missing);
 *  4. the result below the minimum daily energy.
 *
 * Below the minimum (S3): the proposal is refused (`below_minimum`), never raised to the minimum. A
 * clamped number would hide that the chosen goal and pace do not fit this person, and it would still be
 * a target the app invented for them. The caller offers manual targets, a gentler pace, or a different
 * minimum. The check runs on the final rounded target, so exactly the minimum is allowed, and it applies
 * to `maintain` too.
 *
 * Macros: protein = grams per kg by goal, capped at the protein AMDR maximum; fat = the AMDR minimum
 * share of energy; carbohydrate = the remaining energy. Whole grams; carbohydrate is computed from the
 * rounded protein and fat so the split adds up to the target within 2 kcal.
 */
export function proposeTargets(profile: ProfileInput, goal: GoalInput, options: ProposeOptions): TargetProposal | NoProposal {
  const { minimumDailyKcal } = options;
  if (minimumDailyKcal !== undefined && !(Number.isFinite(minimumDailyKcal) && minimumDailyKcal > 0)) {
    throw new RangeError(`minimumDailyKcal must be a finite number > 0, got ${minimumDailyKcal}`);
  }
  const reference = parseDate(options.referenceDate);
  if (!reference) throw new RangeError(`referenceDate must be YYYY-MM-DD, got ${options.referenceDate}`);

  if (profile.specialCondition) {
    return { kind: 'no_proposal', reason: 'special_condition', condition: profile.specialCondition };
  }

  const birth = parseDate(profile.birthDate);
  const ageYears = birth ? ageOn(birth, reference) : null;
  if (ageYears !== null && ageYears < MINIMUM_AGE_YEARS) return { kind: 'no_proposal', reason: 'under_18' };

  const missing: MissingField[] = [];
  if (profile.sex !== 'male' && profile.sex !== 'female') missing.push('sex');
  if (ageYears === null) missing.push('birthDate');
  if (!usable(profile.heightCm)) missing.push('heightCm');
  if (!usable(profile.weightKg)) missing.push('weightKg');
  if (!profile.activityLevel || !(profile.activityLevel in ACTIVITY_FACTORS)) missing.push('activityLevel');
  if (goal.type !== 'maintain' && !(goal.pace === 'gentle' || goal.pace === 'moderate')) missing.push('pace');
  if (missing.length > 0) return { kind: 'no_proposal', reason: 'missing_data', missing };

  // Everything is present: the checks above narrowed it, the casts only tell TypeScript so.
  const sex = profile.sex as Sex;
  const weightKg = profile.weightKg as number;
  const heightCm = profile.heightCm as number;
  const age = ageYears as number;

  const resting =
    MIFFLIN_ST_JEOR.perKg * weightKg +
    MIFFLIN_ST_JEOR.perCm * heightCm +
    MIFFLIN_ST_JEOR.perYear * age +
    MIFFLIN_ST_JEOR.female * (sex === 'female' ? 1 : 0) +
    MIFFLIN_ST_JEOR.male * (sex === 'male' ? 1 : 0);
  const maintenance = resting * ACTIVITY_FACTORS[profile.activityLevel as ActivityLevel];
  const adjustment = GOAL_ADJUSTMENT[goal.type][goal.type === 'maintain' ? 'gentle' : (goal.pace as Pace)];
  const kcal = Math.round(maintenance * (1 + adjustment));

  const minimumKcal = minimumDailyKcal ?? DEFAULT_MINIMUM_DAILY_KCAL[sex];
  if (kcal < minimumKcal) return { kind: 'no_proposal', reason: 'below_minimum', minimumKcal };

  const band = age === MINIMUM_AGE_YEARS ? 'age18' : 'adult';
  const proteinKcal = Math.min(
    PROTEIN_G_PER_KG[goal.type] * weightKg * KCAL_PER_GRAM.protein,
    PROTEIN_MAX_SHARE[band] * kcal,
  );
  const proteinG = Math.round(proteinKcal / KCAL_PER_GRAM.protein);
  const fatG = Math.round((FAT_MIN_SHARE[band] * kcal) / KCAL_PER_GRAM.fat);
  const carbsG = Math.round((kcal - proteinG * KCAL_PER_GRAM.protein - fatG * KCAL_PER_GRAM.fat) / KCAL_PER_GRAM.carbs);

  return {
    kind: 'proposal',
    formulaVersion: FORMULA_VERSION,
    kcal,
    proteinG,
    carbsG,
    fatG,
    restingKcal: Math.round(resting),
    maintenanceKcal: Math.round(maintenance),
    adjustment,
    ageYears: age,
  };
}
