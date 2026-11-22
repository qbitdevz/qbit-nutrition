import { DataError } from './errors';
import { addDays, isLocalDate } from './localDate';

/**
 * Which days a record may have: the ONE definition. The repositories enforce it where a date enters (a meal, a measurement, a goal),
 * the date steppers stop at it, and the export format validates with it. A day that could be stored can always be exported, and a day
 * the export would refuse can no longer be stored.
 *
 * The earliest day is a fixed date (the app did not exist before). The latest is the device's date plus a little slack (time zones, a
 * clock a few hours off). The device clock is the one thing a file cannot lie about, so a file is bounded by it too.
 */
export const EARLIEST_DAY = '2000-01-01';
/** A record may be dated up to this many days after the device's date. */
export const FUTURE_SLACK_DAYS = 2;

export interface DayBounds {
  earliest: string;
  latest: string;
}

/** The UTC calendar date of `now` (the same reading the export has always used). */
export const deviceDay = (now: Date): string => now.toISOString().slice(0, 10);

export function dayBounds(now: Date): DayBounds {
  return { earliest: EARLIEST_DAY, latest: addDays(deviceDay(now), FUTURE_SLACK_DAYS) };
}

export function isDayInBounds(day: string, now: Date): boolean {
  const { earliest, latest } = dayBounds(now);
  return isLocalDate(day) && day >= earliest && day <= latest;
}

/** True when the device's own date is before the earliest day anything can have: a clock that was reset. */
export const deviceDateLooksWrong = (now: Date): boolean => deviceDay(now) < EARLIEST_DAY;

/**
 * Thrown when a date is outside `dayBounds`. `deviceDateLooksWrong` is true when the phone's own date is before 2000 (a reset clock):
 * then the likely cause is the phone's date, not what the person chose, and the screens say so.
 */
export class DateOutOfRangeError extends DataError {
  readonly bounds: DayBounds;
  readonly deviceDateLooksWrong: boolean;
  constructor(label: string, day: string, now: Date) {
    const bounds = dayBounds(now);
    super('date_out_of_range', `${label} must be between ${bounds.earliest} and ${bounds.latest}, got "${day}"`);
    this.name = 'DateOutOfRangeError';
    this.bounds = bounds;
    this.deviceDateLooksWrong = deviceDateLooksWrong(now);
  }
}

export function requireDayInBounds(day: string, label: string, now: Date): void {
  if (!isDayInBounds(day, now)) throw new DateOutOfRangeError(label, day, now);
}
