/**
 * Local date handling (docs/08 section 2): a meal stores its UTC timestamp AND its local date
 * (`YYYY-MM-DD`), because "which day did I eat this" must not change when the user travels
 * across time zones. `deriveMealTime` is the only place that derives them.
 */

export interface MealTime {
  /** UTC instant, ISO 8601 (`2026-06-15T18:30:00.000Z`). */
  eatenAt: string;
  /** Calendar date in the time zone the meal was logged in (`2026-06-15`). */
  localDate: string;
}

/** IANA zone of the device (e.g. `America/Bogota`). */
export function deviceTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    // Throws RangeError for an unknown zone. Parts are read by type, so the locale only
    // needs to use Latin digits; `en-CA` does.
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

/**
 * The UTC timestamp and local date of `instant`. `timeZone` is the zone the user is in when
 * logging (default: the device's). Stored values never change afterwards, so a later change of
 * zone does not move a meal to another day.
 */
export function deriveMealTime(instant: Date, timeZone: string = deviceTimeZone()): MealTime {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid date');
  const parts = dateFormatter(timeZone).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    eatenAt: instant.toISOString(),
    localDate: `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`,
  };
}

export const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Moves a `YYYY-MM-DD` calendar date by whole days (no time zone involved). */
export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
