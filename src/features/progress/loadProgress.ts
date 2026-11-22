import { periodRange, summarizePeriod, type GoalPeriod, type LoggedDay, type PeriodKind, type PeriodSummary } from '@/core/nutrition';
import type { Repositories } from '@/data';
import type { UnitSystem } from '../profile/units';
import { collapseByDate, type MeasureKind, type SeriesPoint } from './series';

/** Reads the period that contains `anchor` and summarizes it: the repositories are the only source (S10), the maths is in `core/nutrition`. */
export async function loadNutrition({
  repos,
  kind,
  anchor,
}: {
  repos: Pick<Repositories, 'meals' | 'goals'>;
  kind: PeriodKind;
  anchor: string;
}): Promise<PeriodSummary> {
  const range = periodRange(kind, anchor);
  const [totals, history] = await Promise.all([repos.meals.totalsByDay(range.from, range.to), repos.goals.history()]);
  const days: LoggedDay[] = totals.map((d) => ({
    localDate: d.localDate,
    kcal: d.totals.kcal ?? 0,
    proteinG: d.totals.protein ?? 0,
    carbsG: d.totals.carbs ?? 0,
    fatG: d.totals.fat ?? 0,
  }));
  const goals: GoalPeriod[] = history.map((g) => ({
    startDate: g.startDate,
    endDate: g.endDate,
    kcal: g.kcalTarget,
    proteinG: g.proteinGTarget,
    carbsG: g.carbsGTarget,
    fatG: g.fatGTarget,
  }));
  return summarizePeriod({ kind, range, days, goals });
}

export interface SeriesData {
  /** The profile's unit system: entries are typed and shown in it, stored in metric. */
  units: UnitSystem;
  /** Every entry of the kind, one per day, oldest first, in metric. */
  points: SeriesPoint[];
}

export async function loadSeries({ repos, kind }: { repos: Pick<Repositories, 'measurements' | 'profile'>; kind: MeasureKind }): Promise<SeriesData> {
  const [rows, profile] = await Promise.all([repos.measurements.list(kind), repos.profile.get()]);
  return { units: profile?.unitSystem ?? 'metric', points: collapseByDate(rows) };
}
