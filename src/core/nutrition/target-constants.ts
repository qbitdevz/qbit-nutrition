/**
 * Constants of the daily target calculation (docs/02-prd.md section 4, S4).
 *
 * Every value below was checked against the source named next to it, read on 2026-11-21. The same
 * facts, with URLs and the sentence or table each value comes from, are exported in
 * `TARGET_SOURCES` (target-sources.ts) for the "how this is calculated" screen. A value that has no
 * citable source says so (status `unsourced` there) and is the most conservative reasonable choice.
 * Change a value here and update its entry in `target-sources.ts` in the same commit, and bump
 * `FORMULA_VERSION` so stored proposals say which constants produced them.
 */

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type GoalType = 'lose_fat' | 'maintain' | 'gain_muscle';
export type Pace = 'gentle' | 'moderate';

/** Stored on `goal.formula_version`. Bump when any constant or step of the calculation changes. */
export const FORMULA_VERSION = 'ms-fao-2026.1';

/**
 * Mifflin-St Jeor resting energy equation, kcal/day (docs/02 section 4).
 * Source: Mifflin et al. 1990, Am J Clin Nutr 51(2):241-247, abstract: "REE (males) = 10 x weight (kg)
 * + 6.25 x height (cm) - 5 x age (y) + 5; REE (females) = 10 x weight (kg) + 6.25 x height (cm) - 5 x
 * age (y) - 161".
 */
export const MIFFLIN_ST_JEOR = {
  perKg: 10,
  perCm: 6.25,
  perYear: -5,
  male: 5,
  female: -161,
} as const;

/**
 * Physical activity level (PAL): multiple of resting energy. Source: FAO/WHO/UNU, Human energy
 * requirements (2001), chapter 5, Table 5.3: sedentary or light 1.40-1.69, active or moderately active
 * 1.70-1.99, vigorous 2.00-2.40.
 *  - sedentary 1.40: "the lower limit of the sedentary lifestyle range shown in Table 5.3".
 *  - light 1.55: "from 1.55 (corresponding to the sedentary category)".
 *  - moderate 1.75: "to 1.75 (the moderately active category)".
 *  - active 1.90: inside the 1.70-1.99 range; the point is the implementer's choice (the source gives a
 *    range, not a value).
 *  - very_active 2.00: lower limit of the vigorous range 2.00-2.40.
 */
export const ACTIVITY_FACTORS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.4,
  light: 1.55,
  moderate: 1.75,
  active: 1.9,
  very_active: 2.0,
};

/**
 * Change from maintenance energy, as a fraction. One place, per docs/02 section 4.
 *  - lose_fat moderate -0.19: Garthe et al. 2011, Int J Sport Nutr Exerc Metab 21(2):97-104, abstract:
 *    "Energy intake was reduced by 19% +/- 2% ... in SR" (0.7% of body weight lost per week).
 *  - lose_fat gentle -0.10: UNSOURCED. Conservative choice, smaller than every deficit read.
 *  - gain_muscle gentle +0.10 and moderate +0.20: Iraki et al. 2019, Sports 7(7):154, Table 1,
 *    "Calories +10-20% above maintenance" (novice/intermediate bodybuilders; advanced: +5-10%).
 *  - maintain: 0 by definition.
 * Pace does not apply to `maintain`.
 */
export const GOAL_ADJUSTMENT = {
  lose_fat: { gentle: -0.1, moderate: -0.19 },
  maintain: { gentle: 0, moderate: 0 },
  gain_muscle: { gentle: 0.1, moderate: 0.2 },
} as const satisfies Record<GoalType, Record<Pace, number>>;

/**
 * Protein, g per kg of body weight, by goal.
 *  - maintain 1.4: Jager et al. 2017, ISSN position stand on protein and exercise, J Int Soc Sports Nutr
 *    14:20: "an overall daily protein intake in the range of 1.4-2.0 g/kg/d is sufficient for most
 *    exercising individuals" (lower bound).
 *  - gain_muscle 1.6: Morton et al. 2018, Br J Sports Med 52(6):376-384: "protein intakes at amounts
 *    greater than ~1.6 g/kg/day do not further contribute RET-induced gains in FFM".
 *  - lose_fat 1.8: Roberts et al. 2020, J Hum Kinet 71:79-108: "we recommend 1.8-2.7 g/kg/day"
 *    (physique athletes in a calorie deficit; lower bound).
 */
export const PROTEIN_G_PER_KG: Readonly<Record<GoalType, number>> = {
  maintain: 1.4,
  gain_muscle: 1.6,
  lose_fat: 1.8,
};

/**
 * Acceptable Macronutrient Distribution Range (AMDR), share of energy. Source: Dietary Guidelines for
 * Americans 2015-2020, Appendix 7, Table A7-1 (AMDR set by the Institute of Medicine):
 *  - Total fat 20-35 % kcal for ages 19+, 25-35 % for ages 14-18.
 *  - Protein 10-35 % kcal for ages 19+, 10-30 % for ages 14-18.
 * The fat minimum is the share fat gets; the protein maximum caps the protein default. Ages 14-18 only
 * matter for users who are exactly 18 (proposals are never made under 18).
 */
export const FAT_MIN_SHARE = { adult: 0.2, age18: 0.25 } as const;
export const PROTEIN_MAX_SHARE = { adult: 0.35, age18: 0.3 } as const;

/** Energy per gram. Source: Dietary Guidelines 2015-2020, chapter 1: "carbohydrates and protein contain 4 calories per gram, fats contain 9". */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

/**
 * Default minimum daily energy by sex, kcal. NOT YET APPROVED BY THE OWNER (RN-14 is "A confirmar").
 * Source: Dietary Guidelines for Americans 2015-2020, chapter 1: "Eating patterns that contain 1,200 to
 * 1,500 calories each day can help most women lose weight safely, and eating patterns that contain
 * 1,500 to 1,800 calories each day are suitable for most men for weight loss." The lower bounds are
 * the floors. The user can change the value (S3); see `ProposeOptions.minimumDailyKcal`.
 */
export const DEFAULT_MINIMUM_DAILY_KCAL: Readonly<Record<Sex, number>> = {
  female: 1200,
  male: 1500,
};

/** Age at which proposals start (RN-08). */
export const MINIMUM_AGE_YEARS = 18;
