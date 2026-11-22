import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { dayBounds, requireDayInBounds } from '../dayBounds';
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

/** Why a goal change was refused (`GoalConflictError.reason`). */
export type GoalConflictReason =
  /** The open goal starts after the new start, on a day the app accepts: the phone's date looks earlier than it should. Nothing to replace. */
  | 'open_starts_later'
  /** The open goal starts after the latest day the app accepts today (a clock set behind it, or a date typed wrong). It can be replaced when the person confirms. */
  | 'open_starts_beyond_latest'
  /** The new period would share a day with a stored period that stays. */
  | 'history_overlap';

/**
 * A goal change that would rewrite or overlap stored periods. Nothing was changed. `openGoal` is the stored goal in the way (when there is one) so a
 * screen can show its dates and values; `canReplace` says whether `set(input, { replaceGoalId: openGoal.id })` is allowed.
 */
export class GoalConflictError extends DataError {
  constructor(
    readonly reason: GoalConflictReason,
    readonly newStart: string,
    readonly openGoal: Goal | null,
    readonly latestAccepted: string,
    readonly canReplace: boolean,
  ) {
    super(
      'goal_date_conflict',
      reason === 'history_overlap'
        ? `A goal starting on ${newStart} would overlap an earlier goal period.`
        : `The current goal started on ${openGoal?.startDate}; a change cannot start earlier (${newStart}).`,
    );
    this.name = 'GoalConflictError';
  }
}

export interface GoalSetOptions {
  /**
   * The id of the open goal the person agreed to replace. Only honoured when that goal starts after the latest day the app accepts today; otherwise
   * (and when the id is another goal's) the change is refused. The replaced goal comes back as `replaced`.
   */
  replaceGoalId?: string;
}

export interface GoalRepository {
  /** The open period, if any. */
  current(): Promise<Goal | null>;
  /** The goal that applies on a local date, from the periods stored, or null before the first. */
  on(localDate: string): Promise<Goal | null>;
  /** All periods, oldest first. */
  history(): Promise<Goal[]>;
  /**
   * Changes the goal from `startDate` on. A goal is never deleted by setting another one, with one confirmed exception below:
   * - the open period starts on or before `startDate` (whatever its date, even before 2000): it is closed the day before, so earlier days keep their
   *   targets; on the same day it is updated in place;
   * - the open period starts after `startDate`: a `GoalConflictError`, nothing changed. When it starts beyond the latest day the app accepts today
   *   (`dayBounds`), the error says `canReplace`, and `options.replaceGoalId` naming it deletes it and opens the new one (`replaced`);
   * - the new period must not share a day with a period that stays (`history_overlap`). One transaction.
   */
  set(input: GoalInput, options?: GoalSetOptions): Promise<Goal & { replaced?: Goal }>;
}

const toGoal = (row: GoalRow): Goal => ({ ...row, isCustom: row.isCustom === 1 });

export function createGoalRepository({ db, newId, dayClock }: RepositoryContext): GoalRepository {
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

    async set(input, options) {
      requireLocalDate(input.startDate, 'startDate');
      requireDayInBounds(input.startDate, 'startDate', dayClock());
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
        const latest = dayBounds(dayClock()).latest;
        let replaced: Goal | undefined;
        let closing: GoalRow | undefined;
        if (open && open.startDate === input.startDate) {
          tx.update(goal).set(values).where(eq(goal.id, open.id)).run();
          return toGoal(tx.select().from(goal).where(eq(goal.id, open.id)).get()!);
        }
        if (open && open.startDate > input.startDate) {
          const beyond = open.startDate > latest;
          if (!(beyond && options?.replaceGoalId === open.id)) {
            throw new GoalConflictError(beyond ? 'open_starts_beyond_latest' : 'open_starts_later', input.startDate, toGoal(open), latest, beyond);
          }
          replaced = toGoal(open);
        } else if (open) {
          closing = open;
        }
        // The new period runs from its start with no end: no stored period that stays may share a day with it.
        const stays = tx.select().from(goal).all().filter((g) => g.id !== open?.id);
        if (stays.some((g) => g.startDate >= input.startDate || (g.endDate ?? '9999-12-31') >= input.startDate)) {
          throw new GoalConflictError('history_overlap', input.startDate, open ? toGoal(open) : null, latest, false);
        }
        if (replaced && open) tx.delete(goal).where(eq(goal.id, open.id)).run();
        if (closing) {
          tx.update(goal)
            .set({ endDate: addDays(input.startDate, -1) })
            .where(eq(goal.id, closing.id))
            .run();
        }
        const id = newId();
        tx.insert(goal).values({ id, startDate: input.startDate, endDate: null, ...values }).run();
        return { ...toGoal(tx.select().from(goal).where(eq(goal.id, id)).get()!), ...(replaced ? { replaced } : {}) };
      });
    },
  };
}
