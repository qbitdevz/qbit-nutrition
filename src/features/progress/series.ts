/**
 * Pure helpers behind the weight and measurement charts: one point per day, the selectable ranges,
 * a tidy axis, and entry in the units of the profile with metric storage (FR-04).
 */
import { addDays, type Measurement } from '@/data';
import { parseNumber, roundTo, type FieldError } from '../forms/numbers';
import { KG_PER_POUND, CM_PER_INCH, WEIGHT_KG, WEIGHT_LB, type UnitSystem } from '../profile/units';

export type MeasureKind = Measurement['kind'];

/** The kinds, in the order the Progress screen offers them. */
export const MEASURE_KINDS = ['waist', 'hips', 'chest', 'body_fat_pct'] as const satisfies readonly MeasureKind[];

export interface SeriesPoint {
  /** Id of the stored entry, so a tapped point opens that entry. */
  id: string;
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  /** Metric (kg, cm or percent). */
  value: number;
}

/** One point per day, oldest first. When a day has a manual entry and one from Health Connect, the manual one is shown. */
export function collapseByDate(rows: readonly Pick<Measurement, 'id' | 'measuredOn' | 'value' | 'source'>[]): SeriesPoint[] {
  const byDate = new Map<string, Pick<Measurement, 'id' | 'measuredOn' | 'value' | 'source'>>();
  for (const row of rows) {
    const existing = byDate.get(row.measuredOn);
    if (!existing || (existing.source !== 'manual' && row.source === 'manual')) byDate.set(row.measuredOn, row);
  }
  return [...byDate.values()]
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((row) => ({ id: row.id, date: row.measuredOn, value: row.value }));
}

export const CHART_RANGES = ['30d', '90d', '1y', 'all'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

const RANGE_DAYS: Record<Exclude<ChartRange, 'all'>, number> = { '30d': 30, '90d': 90, '1y': 365 };

/** First day of a range that ends today (today included), or null for "all". */
export function rangeStart(range: ChartRange, today: string): string | null {
  return range === 'all' ? null : addDays(today, -(RANGE_DAYS[range] - 1));
}

export interface SeriesSummary {
  count: number;
  first: { date: string; value: number };
  last: { date: string; value: number };
  min: number;
  max: number;
  /** Last minus first, to one decimal; null with a single point. */
  change: number | null;
}

export function summarizeSeries(points: readonly SeriesPoint[]): SeriesSummary | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  const values = points.map((p) => p.value);
  return {
    count: points.length,
    first: { date: first.date, value: first.value },
    last: { date: last.date, value: last.value },
    min: Math.min(...values),
    max: Math.max(...values),
    change: points.length > 1 ? roundTo(last.value - first.value, 1) : null,
  };
}

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

const STEPS = [1, 2, 5, 10];

/** An axis that contains [min, max] with round bounds and about three labelled ticks. */
export function niceScale(min: number, max: number): Scale {
  let low = min;
  let high = max;
  if (high - low < 1e-9) {
    const pad = Math.max(Math.abs(low) * 0.02, 0.5);
    low -= pad;
    high += pad;
  }
  const rough = (high - low) / 2;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = (STEPS.find((s) => s * magnitude >= rough - 1e-12) ?? 10) * magnitude;
  const bottom = roundTo(Math.floor(low / step + 1e-9) * step, 6);
  const top = roundTo(Math.ceil(high / step - 1e-9) * step, 6);
  const ticks: number[] = [];
  for (let value = bottom; value <= top + step / 1e6; value += step) ticks.push(roundTo(value, 6));
  return { min: bottom, max: top, ticks };
}

export type DisplayUnit = 'kg' | 'lb' | 'cm' | 'in' | '%';

export function displayUnit(kind: MeasureKind, units: UnitSystem): DisplayUnit {
  if (kind === 'body_fat_pct') return '%';
  if (kind === 'weight') return units === 'imperial' ? 'lb' : 'kg';
  return units === 'imperial' ? 'in' : 'cm';
}

/** A stored metric value in the profile's unit, to one decimal. */
export function fromMetric(kind: MeasureKind, value: number, units: UnitSystem): number {
  if (units === 'imperial' && kind === 'weight') return roundTo(value / KG_PER_POUND, 1);
  if (units === 'imperial' && kind !== 'body_fat_pct') return roundTo(value / CM_PER_INCH, 1);
  return roundTo(value, 1);
}

/** Plausible entry ranges in the unit typed. Anything outside is rejected with a message, never clamped. */
const LIMITS: Record<MeasureKind, Record<UnitSystem, { min: number; max: number }>> = {
  weight: { metric: WEIGHT_KG, imperial: WEIGHT_LB },
  waist: { metric: { min: 20, max: 300 }, imperial: { min: 8, max: 120 } },
  hips: { metric: { min: 20, max: 300 }, imperial: { min: 8, max: 120 } },
  chest: { metric: { min: 20, max: 300 }, imperial: { min: 8, max: 120 } },
  body_fat_pct: { metric: { min: 2, max: 70 }, imperial: { min: 2, max: 70 } },
};

export type EntryResult = { ok: true; value: number } | { ok: false; error: FieldError };

/** Reads a typed value in the profile's unit and returns it in metric (kg, cm or percent), or the specific problem. */
export function parseEntry(kind: MeasureKind, text: string, units: UnitSystem): EntryResult {
  const parsed = parseNumber(text);
  if (parsed.kind === 'empty') return { ok: false, error: { key: 'progress.entry.required' } };
  if (parsed.kind === 'invalid') return { ok: false, error: { key: 'progress.entry.notNumber' } };
  const limits = LIMITS[kind][units];
  if (parsed.value < limits.min || parsed.value > limits.max) {
    return { ok: false, error: { key: 'progress.entry.range', params: { min: limits.min, max: limits.max, unit: displayUnit(kind, units) } } };
  }
  if (units === 'imperial' && kind === 'weight') return { ok: true, value: roundTo(parsed.value * KG_PER_POUND, 3) };
  if (units === 'imperial' && kind !== 'body_fat_pct') return { ok: true, value: roundTo(parsed.value * CM_PER_INCH, 3) };
  return { ok: true, value: roundTo(parsed.value, 3) };
}
