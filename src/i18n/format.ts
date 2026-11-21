import type { Locale } from './locale';

/** Numbers and dates follow the app language (docs/05 section 8). */
export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

/** "Sat 21 Nov" for a `YYYY-MM-DD` calendar date; no time zone is involved. */
export function formatDayDate(locale: Locale, localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

/** Clock time of an instant in the device's time zone, e.g. "08:05". */
export function formatClock(locale: Locale, instant: Date): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(instant);
}

/** A decimal number with at most `maxFractionDigits` digits ("46.5", "5.4", "62"). */
export function formatDecimal(locale: Locale, value: number, maxFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** "Oct 1, 2026" for a `YYYY-MM-DD` calendar date; no time zone is involved. */
export function formatLongDate(locale: Locale, localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

/** The calendar date of an instant in the device's time zone, e.g. "Nov 1, 2026". */
export function formatInstantDate(locale: Locale, instant: Date): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(instant);
}

/** "21 Nov" for a `YYYY-MM-DD` calendar date: the label on a chart axis and in a range. */
export function formatShortDate(locale: Locale, localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "November 2026" for any `YYYY-MM-DD` date inside the month. */
export function formatMonthYear(locale: Locale, localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** A decimal with an explicit sign for anything but zero ("+1.5", "−0.4"). */
export function formatSigned(locale: Locale, value: number, maxFractionDigits = 1): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits, signDisplay: 'exceptZero' }).format(value);
}
