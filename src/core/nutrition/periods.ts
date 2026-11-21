/**
 * Weekly and monthly averages for the Progress screen (docs/02 FR-43, docs/04 section 9).
 *
 * Pure functions over plain data: the caller reads the days that have meals and the goal periods
 * from the repositories and hands them in. Dates are `YYYY-MM-DD` calendar dates; no time zone is
 * involved. An average counts only days with logged meals, and each day is compared with the
 * targets of the goal period that applied on that day, so a goal change in the middle of a week or
 * a month never rewrites the days before it.
 */
import type { Targets } from './insights';

export type PeriodKind = 'week' | 'month';

export interface DateRange {
  /** First day, inclusive. */
  from: string;
  /** Last day, inclusive. */
  to: string;
}

/**
 * Logged days a period needs before an average is shown (docs/04 section 9, "Partial": with too
 * few days, show what exists and no averages). docs/04 says "fewer than 7 days"; a week has exactly
 * seven, so requiring all of them would hide the average of a week with one day missed. A week
 * needs 4 (more than half of it) and a month needs the 7 the document names.
 */
export const MIN_LOGGED_DAYS_FOR_AVERAGE: Readonly<Record<PeriodKind, number>> = { week: 4, month: 7 };

/** One day that has at least one meal, with its summed headline nutrients. */
export interface LoggedDay {
  localDate: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** A goal period as stored: `endDate` is inclusive and null while it is still open. */
export interface GoalPeriod {
  startDate: string;
  endDate: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface DaySummary extends LoggedDay {
  /** The targets that applied on this day; every field is null when no goal applied. */
  targets: Targets;
}

export interface Averages {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface PeriodSummary {
  kind: PeriodKind;
  range: DateRange;
  /** Calendar days in the range, logged or not. */
  totalDays: number;
  /** Days in the range that have meals. */
  loggedDays: number;
  /** The logged days, oldest first. */
  days: DaySummary[];
  /** `empty`: nothing logged. `partial`: too few days for an average. `average`: enough days. */
  status: 'empty' | 'partial' | 'average';
  /** Mean over the logged days; null unless `status` is `average`. */
  average: Averages | null;
  /** Mean of the targets of those same days, per nutrient over the days that had one; null unless `status` is `average`. */
  targets: Targets | null;
  /** True when the logged days did not all have the same targets (the goal changed during the period). */
  targetsChanged: boolean;
}

const NO_TARGETS: Targets = { kcal: null, proteinG: null, carbsG: null, fatG: null };

function parse(localDate: string): Date {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

const format = (date: Date): string => date.toISOString().slice(0, 10);

function addDays(localDate: string, days: number): string {
  const date = parse(localDate);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

/** The Monday-to-Sunday week or the calendar month that contains `anchor`. */
export function periodRange(kind: PeriodKind, anchor: string): DateRange {
  const date = parse(anchor);
  if (kind === 'week') {
    const sinceMonday = (date.getUTCDay() + 6) % 7;
    const from = addDays(anchor, -sinceMonday);
    return { from, to: addDays(from, 6) };
  }
  const from = format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
  const to = format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  return { from, to };
}

/** A date inside the period `steps` weeks or months away (the first of the month for months). */
export function shiftPeriod(kind: PeriodKind, anchor: string, steps: number): string {
  if (kind === 'week') return addDays(anchor, steps * 7);
  const date = parse(anchor);
  return format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + steps, 1)));
}

const daysBetween = (range: DateRange): number => Math.round((parse(range.to).getTime() - parse(range.from).getTime()) / 86_400_000) + 1;

/** The targets of the goal period that contains `localDate`; the one that started last wins. All null when none applies. */
export function targetsOn(localDate: string, periods: readonly GoalPeriod[]): Targets {
  let found: GoalPeriod | null = null;
  for (const period of periods) {
    if (period.startDate > localDate) continue;
    if (period.endDate !== null && period.endDate < localDate) continue;
    if (!found || period.startDate > found.startDate) found = period;
  }
  return found ? { kcal: found.kcal, proteinG: found.proteinG, carbsG: found.carbsG, fatG: found.fatG } : { ...NO_TARGETS };
}

const mean = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

function meanTarget(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length > 0 ? mean(present) : null;
}

export interface SummarizeInput {
  kind: PeriodKind;
  range: DateRange;
  /** Days that have meals. Days outside the range are ignored; a repeated date counts once (the first). */
  days: readonly LoggedDay[];
  goals: readonly GoalPeriod[];
}

export function summarizePeriod({ kind, range, days, goals }: SummarizeInput): PeriodSummary {
  const seen = new Set<string>();
  const logged: DaySummary[] = [];
  for (const d of [...days].sort((a, b) => a.localDate.localeCompare(b.localDate))) {
    if (d.localDate < range.from || d.localDate > range.to || seen.has(d.localDate)) continue;
    seen.add(d.localDate);
    logged.push({ ...d, targets: targetsOn(d.localDate, goals) });
  }

  const base = { kind, range, totalDays: daysBetween(range), loggedDays: logged.length, days: logged };
  if (logged.length === 0) return { ...base, status: 'empty', average: null, targets: null, targetsChanged: false };
  if (logged.length < MIN_LOGGED_DAYS_FOR_AVERAGE[kind]) {
    return { ...base, status: 'partial', average: null, targets: null, targetsChanged: false };
  }

  const targetOf = (pick: (t: Targets) => number | null) => meanTarget(logged.map((d) => pick(d.targets)));
  const signature = (t: Targets) => `${t.kcal}|${t.proteinG}|${t.carbsG}|${t.fatG}`;
  return {
    ...base,
    status: 'average',
    average: {
      kcal: mean(logged.map((d) => d.kcal)),
      proteinG: mean(logged.map((d) => d.proteinG)),
      carbsG: mean(logged.map((d) => d.carbsG)),
      fatG: mean(logged.map((d) => d.fatG)),
    },
    targets: {
      kcal: targetOf((t) => t.kcal),
      proteinG: targetOf((t) => t.proteinG),
      carbsG: targetOf((t) => t.carbsG),
      fatG: targetOf((t) => t.fatG),
    },
    targetsChanged: new Set(logged.map((d) => signature(d.targets))).size > 1,
  };
}
