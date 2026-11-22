export { computeItemNutrients, sumNutrients } from './nutrients';
export { convert } from './units';
export { NUTRIENT_CODES } from './types';
export type { FoodNutrition, NutrientAmounts, NutrientCode, Unit } from './types';

export { proposeTargets } from './targets';
export type {
  GoalInput,
  MissingField,
  NoProposal,
  ProfileInput,
  ProposeOptions,
  SpecialCondition,
  TargetProposal,
} from './targets';
export {
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
export type { ActivityLevel, GoalType, Pace, Sex } from './target-constants';
export { TARGET_SOURCES } from './target-sources';
export type { TargetConstantId, TargetSource, TargetSourceEntry } from './target-sources';

export { pickInsight } from './insights';
export type { DayTotals, Insight, MealSlot, Targets } from './insights';
export {
  EMPTY_SLOT_DUE_HOUR,
  FIBER_MIN_G_PER_1000_KCAL,
  LATE_DAY_HOUR,
  MIN_REMAINING_KCAL_FOR_SLOT,
  PROTEIN_WELL_BELOW_FRACTION,
  RECENT_DAYS_WINDOW,
  SODIUM_LIMIT_MG,
  TARGET_REACHED_KCAL_RANGE,
} from './insight-constants';

export { MIN_LOGGED_DAYS_FOR_AVERAGE, periodRange, shiftPeriod, summarizePeriod, targetsOn } from './periods';
export type { Averages, DateRange, DaySummary, GoalPeriod, LoggedDay, PeriodKind, PeriodSummary, SummarizeInput } from './periods';
