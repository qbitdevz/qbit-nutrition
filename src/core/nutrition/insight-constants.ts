/**
 * Thresholds of the recommendation rules (docs/07-ai-pipeline.md section 7). One named constant each.
 *
 * Sourced (the guideline value; using it as a trigger is the implementer's choice):
 *  - FIBER_MIN_G_PER_1000_KCAL: Dietary Guidelines for Americans 2015-2020, Appendix 7, Table A7-1,
 *    "Dietary Fiber, g: 14 g/1,000 kcal" (Adequate Intake).
 *  - SODIUM_LIMIT_MG: same document, chapter 1: "limit sodium to less than 2,300 mg per day for adults".
 *
 * The implementer's own choices, not from any guideline (a product decision, to be reviewed by the owner):
 *  LATE_DAY_HOUR, PROTEIN_WELL_BELOW_FRACTION, EMPTY_SLOT_DUE_HOUR, MIN_REMAINING_KCAL_FOR_SLOT,
 *  RECENT_DAYS_WINDOW, TARGET_REACHED_KCAL_RANGE.
 */

/** Rule 1: from this local hour on (24 h clock) the day counts as "late". */
export const LATE_DAY_HOUR = 18;
/** Rule 1: protein below this fraction of its target is "well below". */
export const PROTEIN_WELL_BELOW_FRACTION = 0.6;
/** Rule 2: a main slot counts as due, and so as "still empty", from this local hour. Snacks are optional and never count. */
export const EMPTY_SLOT_DUE_HOUR = { breakfast: 11, lunch: 15, dinner: 20 } as const;
/** Rule 2: calories remaining must be at least this much, so the rule never points at a nearly spent target. */
export const MIN_REMAINING_KCAL_FOR_SLOT = 300;
/** Rules 3 and 4: how many calendar days before today are looked at. All of them must be logged. */
export const RECENT_DAYS_WINDOW = 3;
/** Rule 3: fiber below this many grams per 1,000 kcal eaten is low. Sourced. */
export const FIBER_MIN_G_PER_1000_KCAL = 14;
/** Rule 4: an average above this many mg of sodium a day is high. Sourced. */
export const SODIUM_LIMIT_MG = 2300;
/** Rule 5: calories eaten as a fraction of the target, inclusive at both ends, count as "reached". */
export const TARGET_REACHED_KCAL_RANGE = { min: 0.95, max: 1.05 } as const;
