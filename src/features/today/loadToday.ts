import { pickInsight, type DayTotals, type GoalType, type Insight, type MealSlot, type Targets } from '@/core/nutrition';
import { addDays, deriveMealTime, type Repositories } from '@/data';

export interface TodayMeal {
  id: string;
  /** The meal's own name, or its item names joined. */
  name: string;
  slot: MealSlot;
  /** When it was eaten. */
  eatenAt: Date;
  kcal: number;
}

export interface TodayTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Everything the Today screen shows for one local date. */
export interface TodayData {
  localDate: string;
  isToday: boolean;
  meals: TodayMeal[];
  totals: TodayTotals;
  /** The targets that applied on that date; every field is null when no goal applied. */
  targets: Targets;
  /** The type of the goal that applied on that date (lose fat, maintain, gain muscle); null when none did. */
  goalType: GoalType | null;
  /** At most one suggestion, for today only: its rules depend on the time of day. */
  insight: Insight | null;
}

export interface LoadTodayInput {
  repos: Pick<Repositories, 'meals' | 'goals'>;
  /** The local date to read, `YYYY-MM-DD`. */
  localDate: string;
  now: Date;
}

const NO_TARGETS: Targets = { kcal: null, proteinG: null, carbsG: null, fatG: null };

/**
 * Reads one day through the repositories (screens never run SQL, S10): the meals with their
 * totals, the goal that applied on that date, and the day's insight. It is the only place that
 * turns repository rows into what Today shows.
 */
export async function loadToday({ repos, localDate, now }: LoadTodayInput): Promise<TodayData> {
  const isToday = deriveMealTime(now).localDate === localDate;
  const [day, goal] = await Promise.all([repos.meals.getDay(localDate), repos.goals.on(localDate)]);

  const targets: Targets = goal
    ? { kcal: goal.kcalTarget, proteinG: goal.proteinGTarget, carbsG: goal.carbsGTarget, fatG: goal.fatGTarget }
    : NO_TARGETS;

  let insight: Insight | null = null;
  if (isToday && day.meals.length > 0) {
    const recent = await repos.meals.totalsByDay(addDays(localDate, -3), addDays(localDate, -1));
    const recentDays: DayTotals[] = recent.map((d) => ({ localDate: d.localDate, totals: d.totals, filledSlots: [] }));
    const filledSlots = [...new Set(day.meals.map((m) => m.slot))];
    insight = pickInsight({ localDate, totals: day.totals, filledSlots }, targets, recentDays, now);
  }

  return {
    localDate,
    isToday,
    meals: day.meals.map((m) => ({
      id: m.id,
      name: m.name?.trim() || m.items.map((i) => i.displayName).join(', '),
      slot: m.slot,
      eatenAt: new Date(m.eatenAt),
      kcal: m.items.reduce((sum, i) => sum + i.kcal, 0),
    })),
    totals: {
      kcal: day.totals.kcal ?? 0,
      proteinG: day.totals.protein ?? 0,
      carbsG: day.totals.carbs ?? 0,
      fatG: day.totals.fat ?? 0,
    },
    targets,
    goalType: goal?.type ?? null,
    insight,
  };
}
