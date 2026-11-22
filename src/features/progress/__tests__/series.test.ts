import {
  collapseByDate,
  displayUnit,
  fromMetric,
  niceScale,
  parseEntry,
  rangeStart,
  summarizeSeries,
} from '../series';

const row = (id: string, measuredOn: string, value: number, source: 'manual' | 'health_connect' = 'manual') => ({
  id,
  measuredOn,
  value,
  source,
});

describe('collapseByDate', () => {
  it('keeps one point per day, oldest first, preferring the manual entry', () => {
    const points = collapseByDate([
      row('c', '2026-06-03', 81.5),
      row('a', '2026-06-01', 82),
      row('b', '2026-06-01', 83, 'health_connect'),
      row('d', '2026-06-03', 80, 'health_connect'),
    ]);
    expect(points).toEqual([
      { id: 'a', date: '2026-06-01', value: 82 },
      { id: 'c', date: '2026-06-03', value: 81.5 },
    ]);
  });

  it('is empty for no rows', () => {
    expect(collapseByDate([])).toEqual([]);
  });
});

describe('rangeStart', () => {
  it('counts back from today: 30 days includes today and the 29 before it', () => {
    expect(rangeStart('30d', '2026-06-30')).toBe('2026-06-01');
    expect(rangeStart('90d', '2026-06-30')).toBe('2026-04-02');
    expect(rangeStart('1y', '2026-06-30')).toBe('2025-07-01');
  });

  it('all has no start', () => {
    expect(rangeStart('all', '2026-06-30')).toBeNull();
  });
});

describe('summarizeSeries', () => {
  it('reports the first and last values, the extremes and the change', () => {
    const summary = summarizeSeries([
      { id: 'a', date: '2026-06-01', value: 82 },
      { id: 'b', date: '2026-06-08', value: 83.5 },
      { id: 'c', date: '2026-06-15', value: 81 },
    ]);
    expect(summary).toEqual({
      count: 3,
      first: { date: '2026-06-01', value: 82 },
      last: { date: '2026-06-15', value: 81 },
      min: 81,
      max: 83.5,
      change: -1,
    });
  });

  it('one point has no change', () => {
    expect(summarizeSeries([{ id: 'a', date: '2026-06-01', value: 82 }])).toMatchObject({ count: 1, change: null, min: 82, max: 82 });
  });

  it('nothing is null', () => {
    expect(summarizeSeries([])).toBeNull();
  });

  it('rounds the change to the display precision so 0.1 + 0.2 does not show 0.30000000000000004', () => {
    const s = summarizeSeries([
      { id: 'a', date: '2026-06-01', value: 80.1 },
      { id: 'b', date: '2026-06-02', value: 80.4 },
    ]);
    expect(s?.change).toBe(0.3);
  });
});

describe('niceScale', () => {
  it('rounds the axis outward to tidy steps', () => {
    expect(niceScale(80.5, 83.5)).toEqual({ min: 80, max: 84, ticks: [80, 82, 84] });
    expect(niceScale(0, 100)).toEqual({ min: 0, max: 100, ticks: [0, 50, 100] });
    expect(niceScale(62, 94)).toEqual({ min: 60, max: 100, ticks: [60, 80, 100] });
  });

  it('gives a flat series a visible range around its value', () => {
    const scale = niceScale(82, 82);
    expect(scale.min).toBeLessThan(82);
    expect(scale.max).toBeGreaterThan(82);
    expect(scale.ticks).toContain(82);
  });

  it('keeps fractional steps for small spans', () => {
    expect(niceScale(18.2, 18.9)).toEqual({ min: 18, max: 19, ticks: [18, 18.5, 19] });
  });
});

describe('units', () => {
  it('shows weight in the unit of the profile and lengths in cm or inches', () => {
    expect(displayUnit('weight', 'metric')).toBe('kg');
    expect(displayUnit('weight', 'imperial')).toBe('lb');
    expect(displayUnit('waist', 'metric')).toBe('cm');
    expect(displayUnit('hips', 'imperial')).toBe('in');
    expect(displayUnit('body_fat_pct', 'imperial')).toBe('%');
  });

  it('converts stored metric values for display with one decimal', () => {
    expect(fromMetric('weight', 82, 'metric')).toBe(82);
    expect(fromMetric('weight', 81.65, 'imperial')).toBe(180); // 81.65 / 0.45359237 = 180.0
    expect(fromMetric('waist', 91.44, 'imperial')).toBe(36);
    expect(fromMetric('body_fat_pct', 18.4, 'imperial')).toBe(18.4);
  });
});

describe('parseEntry', () => {
  it('reads a typed number (decimal point or comma) and stores it in metric', () => {
    expect(parseEntry('weight', '82,4', 'metric')).toEqual({ ok: true, value: 82.4 });
    expect(parseEntry('weight', '180.5', 'imperial')).toEqual({ ok: true, value: 81.873 });
    expect(parseEntry('waist', '36', 'imperial')).toEqual({ ok: true, value: 91.44 });
    expect(parseEntry('body_fat_pct', '18.4', 'metric')).toEqual({ ok: true, value: 18.4 });
  });

  it('what is typed comes back unchanged after the round trip', () => {
    const parsed = parseEntry('weight', '180.5', 'imperial');
    expect(parsed.ok && fromMetric('weight', parsed.value, 'imperial')).toBe(180.5);
  });

  it('says what is wrong instead of clamping', () => {
    expect(parseEntry('weight', '', 'metric')).toEqual({ ok: false, error: { key: 'progress.entry.required' } });
    expect(parseEntry('weight', 'abc', 'metric')).toEqual({ ok: false, error: { key: 'progress.entry.notNumber' } });
    expect(parseEntry('weight', '10', 'metric')).toEqual({
      ok: false,
      error: { key: 'progress.entry.range', params: { min: 20, max: 500, unit: 'kg' } },
    });
    expect(parseEntry('weight', '2000', 'imperial')).toEqual({
      ok: false,
      error: { key: 'progress.entry.range', params: { min: 45, max: 1100, unit: 'lb' } },
    });
    expect(parseEntry('body_fat_pct', '90', 'metric')).toMatchObject({ ok: false });
    expect(parseEntry('waist', '-5', 'metric')).toMatchObject({ ok: false });
  });
});
