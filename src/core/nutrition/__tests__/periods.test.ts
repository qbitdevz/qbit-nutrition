import { MIN_LOGGED_DAYS_FOR_AVERAGE, periodRange, shiftPeriod, summarizePeriod, targetsOn } from '..';
import type { GoalPeriod, LoggedDay } from '..';

const day = (localDate: string, kcal: number, proteinG: number, carbsG: number, fatG: number): LoggedDay => ({
  localDate,
  kcal,
  proteinG,
  carbsG,
  fatG,
});

describe('periodRange', () => {
  it('a week runs Monday to Sunday, whichever day inside it is given', () => {
    // 2026-04-01 is a Wednesday.
    expect(periodRange('week', '2026-04-01')).toEqual({ from: '2026-03-30', to: '2026-04-05' });
    expect(periodRange('week', '2026-03-30')).toEqual({ from: '2026-03-30', to: '2026-04-05' });
    expect(periodRange('week', '2026-04-05')).toEqual({ from: '2026-03-30', to: '2026-04-05' });
    expect(periodRange('week', '2026-04-06')).toEqual({ from: '2026-04-06', to: '2026-04-12' });
  });

  it('a week can span two years', () => {
    expect(periodRange('week', '2026-01-01')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
  });

  it('a month is the calendar month, with its real length', () => {
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('shiftPeriod', () => {
  it('moves a week by seven days and a month by calendar months', () => {
    expect(shiftPeriod('week', '2026-04-01', -1)).toBe('2026-03-25');
    expect(shiftPeriod('week', '2026-04-01', 1)).toBe('2026-04-08');
    expect(shiftPeriod('month', '2026-03-31', 1)).toBe('2026-04-01');
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01');
    expect(shiftPeriod('month', '2026-01-15', 13)).toBe('2027-02-01');
  });
});

describe('targetsOn', () => {
  const periods: GoalPeriod[] = [
    { startDate: '2026-01-01', endDate: '2026-03-31', kcal: 2000, proteinG: 100, carbsG: 250, fatG: 67 },
    { startDate: '2026-04-01', endDate: null, kcal: 1800, proteinG: 120, carbsG: null, fatG: 60 },
  ];

  it('picks the period whose start and inclusive end contain the date', () => {
    expect(targetsOn('2026-03-31', periods)).toEqual({ kcal: 2000, proteinG: 100, carbsG: 250, fatG: 67 });
    expect(targetsOn('2026-04-01', periods)).toEqual({ kcal: 1800, proteinG: 120, carbsG: null, fatG: 60 });
    expect(targetsOn('2030-01-01', periods).kcal).toBe(1800);
  });

  it('has no targets before the first period or with no periods', () => {
    const none = { kcal: null, proteinG: null, carbsG: null, fatG: null };
    expect(targetsOn('2025-12-31', periods)).toEqual(none);
    expect(targetsOn('2026-04-01', [])).toEqual(none);
  });
});

describe('summarizePeriod', () => {
  const periods: GoalPeriod[] = [
    { startDate: '2026-01-01', endDate: '2026-03-31', kcal: 2000, proteinG: 100, carbsG: 250, fatG: 67 },
    { startDate: '2026-04-01', endDate: null, kcal: 1800, proteinG: 120, carbsG: 200, fatG: 60 },
  ];
  // The week of Mon 2026-03-30 to Sun 2026-04-05 spans two months and two goal periods.
  const week = periodRange('week', '2026-04-01');
  const days = [
    day('2026-03-30', 1900, 90, 200, 60),
    day('2026-03-31', 2100, 110, 210, 70),
    day('2026-04-02', 1700, 130, 150, 50),
    day('2026-04-03', 1800, 125, 160, 55),
  ];

  it('averages only the logged days, against the targets that applied on each of them', () => {
    const summary = summarizePeriod({ kind: 'week', range: week, days, goals: periods });
    expect(summary.status).toBe('average');
    expect(summary.totalDays).toBe(7);
    expect(summary.loggedDays).toBe(4); // three days had no meals and do not pull the average down
    // (1900 + 2100 + 1700 + 1800) / 4
    expect(summary.average).toEqual({ kcal: 1875, proteinG: 113.75, carbsG: 180, fatG: 58.75 });
    // Targets: two days under the first period (2000/100/250/67) and two under the second (1800/120/200/60).
    expect(summary.targets).toEqual({ kcal: 1900, proteinG: 110, carbsG: 225, fatG: 63.5 });
    expect(summary.targetsChanged).toBe(true);
  });

  it('keeps each day with the targets of its own goal period', () => {
    const summary = summarizePeriod({ kind: 'week', range: week, days, goals: periods });
    expect(summary.days.map((d) => [d.localDate, d.targets.kcal])).toEqual([
      ['2026-03-30', 2000],
      ['2026-03-31', 2000],
      ['2026-04-02', 1800],
      ['2026-04-03', 1800],
    ]);
  });

  it('does not flag a change when every day had the same targets', () => {
    const summary = summarizePeriod({ kind: 'week', range: periodRange('week', '2026-04-08'), days: [], goals: periods });
    expect(summary.targetsChanged).toBe(false);
    const same = summarizePeriod({
      kind: 'week',
      range: week,
      days: [day('2026-04-01', 1800, 100, 190, 60), ...days.slice(2), day('2026-04-04', 1600, 100, 150, 50)],
      goals: periods,
    });
    expect(same.targetsChanged).toBe(false);
    expect(same.targets?.kcal).toBe(1800);
  });

  it('a month counts only the days that fall inside it, even when the input has more', () => {
    const march = summarizePeriod({ kind: 'month', range: periodRange('month', '2026-03-15'), days, goals: periods });
    expect(march.loggedDays).toBe(2); // 30 and 31 March; the April days belong to April
    const april = summarizePeriod({ kind: 'month', range: periodRange('month', '2026-04-15'), days, goals: periods });
    expect(april.loggedDays).toBe(2);
    expect(april.totalDays).toBe(30);
    expect(march.totalDays).toBe(31);
  });

  it('with fewer logged days than needed it lists what exists and gives no average', () => {
    const few = days.slice(0, MIN_LOGGED_DAYS_FOR_AVERAGE.week - 1);
    const summary = summarizePeriod({ kind: 'week', range: week, days: few, goals: periods });
    expect(summary.status).toBe('partial');
    expect(summary.loggedDays).toBe(3);
    expect(summary.average).toBeNull();
    expect(summary.targets).toBeNull();
    expect(summary.days).toHaveLength(3);
  });

  it('a month needs more logged days than a week before it shows an average', () => {
    expect(MIN_LOGGED_DAYS_FOR_AVERAGE.month).toBeGreaterThan(MIN_LOGGED_DAYS_FOR_AVERAGE.week);
    const march = Array.from({ length: 6 }, (_, i) => day(`2026-03-${String(i + 1).padStart(2, '0')}`, 2000, 100, 200, 60));
    const six = summarizePeriod({ kind: 'month', range: periodRange('month', '2026-03-10'), days: march, goals: periods });
    expect(six.status).toBe('partial');
    const seven = summarizePeriod({
      kind: 'month',
      range: periodRange('month', '2026-03-10'),
      days: [...march, day('2026-03-07', 2000, 100, 200, 60)],
      goals: periods,
    });
    expect(seven.status).toBe('average');
    expect(seven.average?.kcal).toBe(2000);
  });

  it('is empty when nothing was logged', () => {
    const summary = summarizePeriod({ kind: 'week', range: week, days: [], goals: periods });
    expect(summary.status).toBe('empty');
    expect(summary.loggedDays).toBe(0);
    expect(summary.average).toBeNull();
  });

  it('averages a target only over the days that had one', () => {
    const noCarbTarget: GoalPeriod[] = [
      { startDate: '2026-03-30', endDate: '2026-03-31', kcal: 2000, proteinG: null, carbsG: null, fatG: null },
      { startDate: '2026-04-01', endDate: null, kcal: 1800, proteinG: 120, carbsG: 200, fatG: null },
    ];
    const summary = summarizePeriod({ kind: 'week', range: week, days, goals: noCarbTarget });
    expect(summary.targets).toEqual({ kcal: 1900, proteinG: 120, carbsG: 200, fatG: null });
  });

  it('days before the first goal have no target and still count toward the average', () => {
    const late: GoalPeriod[] = [{ startDate: '2026-04-02', endDate: null, kcal: 1800, proteinG: 120, carbsG: 200, fatG: 60 }];
    const summary = summarizePeriod({ kind: 'week', range: week, days, goals: late });
    expect(summary.average?.kcal).toBe(1875);
    expect(summary.targets?.kcal).toBe(1800); // only the two days a goal applied to
    expect(summary.days[0]!.targets.kcal).toBeNull();
  });

  it('ignores a repeated date by keeping the first entry', () => {
    const summary = summarizePeriod({
      kind: 'week',
      range: week,
      days: [...days, day('2026-04-03', 99999, 0, 0, 0)],
      goals: periods,
    });
    expect(summary.loggedDays).toBe(4);
    expect(summary.average?.kcal).toBe(1875);
  });
});
