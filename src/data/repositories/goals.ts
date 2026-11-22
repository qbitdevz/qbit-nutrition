import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { DataError } from '../errors';
import { addDays } from '../localDate';
import { goal } from '../schema';
import { VALUE_LIMITS, requireWithin } from './limits';
import { requireFinite, requireLocalDate, type RepositoryContext } from './shared';

type GoalRow = typeof goal.$inferSelect;

/** One goal period. `endDate` is inclusive; null means the period is still open. */
export interface Goal extends Omit<GoalRow, 'isCustom'> {
  isCustom: boolean;
}

export interface GoalInput {
  type: GoalRow['type'];
  pace?: GoalRow['pace'];
  /** Local date the new targets apply from. */
  startDate: string;
  /** Null (or omitted) means the user tracks without that target. */
  kcalTarget?: number | null;
  proteinGTarget?: number | null;
  carbsGTarget?: number | null;
  fatGTarget?: number | null;
  /** True when the user overrode the proposal. */
  isCustom?: boolean;
  basisWeightKg?: number | null;
  formulaVersion?: string | null;
}

export interface GoalRepository {
  /** The open period, if any. */
  current(): Promise<Goal | null>;
  /** The goal that applies on a local date, from the periods stored, or null before the first. */
  on(localDate: string): Promise<Goal | null>;
  /** All periods, oldest first. */
  history(): Promise<Goal[]>;
  /**
   * Changes the goal from `startDate` on: the open period is closed the day before and a new one
   * is opened, so earlier days keep the targets they had. Changing on the start day of the open
   * period replaces it. A `startDate` before the open period's start is a `goal_date_conflict`.
   * One transaction.
   */
  set(input: GoalInput): Promise<Goal>;
}

const toGoal = (row: GoalRow): Goal => ({ ...row, isCustom: row.isCustom === 1 });

export function createGoalRepository({ db, newId }: RepositoryContext): GoalRepository {
  return {
    async current() {
      const row = db.select().from(goal).where(isNull(goal.endDate)).get();
      return row ? toGoal(row) : null;
    },

    async on(localDate) {
      requireLocalDate(localDate, 'localDate');
      const row = db
        .select()
        .from(goal)
        .where(and(lte(goal.startDate, localDate), or(isNull(goal.endDate), gte(goal.endDate, localDate))))
        .orderBy(desc(goal.startDate))
        .limit(1)
        .get();
      return row ? toGoal(row) : null;
    },

    async history() {
      return db.select().from(goal).orderBy(asc(goal.startDate)).all().map(toGoal);
    },

    async set(input) {
      requireLocalDate(input.startDate, 'startDate');
      for (const [label, value] of [
        ['kcalTarget', input.kcalTarget],
        ['proteinGTarget', input.proteinGTarget],
        ['carbsGTarget', input.carbsGTarget],
        ['fatGTarget', input.fatGTarget],
        ['basisWeightKg', input.basisWeightKg],
      ] as const) {
        if (value != null) requireFinite(value, label, { min: 0 });
      }
      if (input.kcalTarget != null) requireWithin(input.kcalTarget, VALUE_LIMITS.targets.kcal, 'kcalTarget');
      if (input.proteinGTarget != null) requireWithin(input.proteinGTarget, VALUE_LIMITS.targets.protein, 'proteinGTarget');
      if (input.carbsGTarget != null) requireWithin(input.carbsGTarget, VALUE_LIMITS.targets.carbs, 'carbsGTarget');
      if (input.fatGTarget != null) requireWithin(input.fatGTarget, VALUE_LIMITS.targets.fat, 'fatGTarget');
      if (input.basisWeightKg != null) requireWithin(input.basisWeightKg, VALUE_LIMITS.measurement.weight, 'basisWeightKg');

      const values = {
        type: input.type,
        pace: input.pace ?? null,
        kcalTarget: input.kcalTarget ?? null,
        proteinGTarget: input.proteinGTarget ?? null,
        carbsGTarget: input.carbsGTarget ?? null,
        fatGTarget: input.fatGTarget ?? null,
        isCustom: input.isCustom ? 1 : 0,
        basisWeightKg: input.basisWeightKg ?? null,
        formulaVersion: input.formulaVersion ?? null,
      };

      return db.transaction((tx) => {
        const open = tx.select().from(goal).where(isNull(goal.endDate)).get();
        if (open && open.startDate > input.startDate) {
          throw new DataError(
            'goal_date_conflict',
            `The current goal started on ${open.startDate}; a change cannot start earlier (${input.startDate}).`,
          );
        }
        if (open && open.startDate === input.startDate) {
          tx.update(goal).set(values).where(eq(goal.id, open.id)).run();
          return toGoal(tx.select().from(goal).where(eq(goal.id, open.id)).get()!);
        }
        if (open) {
          tx.update(goal)
            .set({ endDate: addDays(input.startDate, -1) })
            .where(eq(goal.id, open.id))
            .run();
        }
        const id = newId();
        tx.insert(goal).values({ id, startDate: input.startDate, endDate: null, ...values }).run();
        return toGoal(tx.select().from(goal).where(eq(goal.id, id)).get()!);
      });
    },
  };
}
