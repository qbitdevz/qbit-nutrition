/** @jest-environment node */
import { addDays, deriveMealTime } from '../localDate';

describe('deriveMealTime', () => {
  it('returns the UTC timestamp as ISO text and the local calendar date', () => {
    const t = deriveMealTime(new Date('2026-06-15T18:30:00.000Z'), 'America/Bogota');
    expect(t).toEqual({ eatenAt: '2026-06-15T18:30:00.000Z', localDate: '2026-06-15' });
  });

  it('is correct on both sides of local midnight', () => {
    // Bogota is UTC-5 all year: local midnight is 05:00 UTC.
    expect(deriveMealTime(new Date('2026-06-15T04:59:59.999Z'), 'America/Bogota').localDate).toBe('2026-06-14');
    expect(deriveMealTime(new Date('2026-06-15T05:00:00.000Z'), 'America/Bogota').localDate).toBe('2026-06-15');
  });

  it('gives a different local date for the same instant in another time zone', () => {
    const instant = new Date('2026-06-15T02:30:00.000Z');
    expect(deriveMealTime(instant, 'America/Bogota').localDate).toBe('2026-06-14');
    expect(deriveMealTime(instant, 'Asia/Tokyo').localDate).toBe('2026-06-15');
    expect(deriveMealTime(instant, 'Pacific/Kiritimati').localDate).toBe('2026-06-15'); // UTC+14
    expect(deriveMealTime(instant, 'Pacific/Pago_Pago').localDate).toBe('2026-06-14'); // UTC-11
    // The UTC timestamp never depends on the zone.
    expect(deriveMealTime(instant, 'Asia/Tokyo').eatenAt).toBe(deriveMealTime(instant, 'America/Bogota').eatenAt);
  });

  it('follows daylight saving changes', () => {
    // New York falls back on 2026-11-01 (EDT UTC-4 until 06:00 UTC, then EST UTC-5).
    expect(deriveMealTime(new Date('2026-11-01T03:59:59.000Z'), 'America/New_York').localDate).toBe('2026-10-31');
    expect(deriveMealTime(new Date('2026-11-01T04:00:00.000Z'), 'America/New_York').localDate).toBe('2026-11-01');
    expect(deriveMealTime(new Date('2026-11-02T04:59:59.000Z'), 'America/New_York').localDate).toBe('2026-11-01');
    expect(deriveMealTime(new Date('2026-11-02T05:00:00.000Z'), 'America/New_York').localDate).toBe('2026-11-02');
  });

  it('handles leap day and year end', () => {
    expect(deriveMealTime(new Date('2028-02-29T12:00:00Z'), 'UTC').localDate).toBe('2028-02-29');
    expect(deriveMealTime(new Date('2026-12-31T23:59:59Z'), 'UTC').localDate).toBe('2026-12-31');
    expect(deriveMealTime(new Date('2027-01-01T00:00:00Z'), 'UTC').localDate).toBe('2027-01-01');
  });

  it('uses the device time zone when none is given', () => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const instant = new Date('2026-03-01T01:00:00Z');
    expect(deriveMealTime(instant)).toEqual(deriveMealTime(instant, device));
  });

  it('rejects an invalid date or time zone', () => {
    expect(() => deriveMealTime(new Date('nope'), 'UTC')).toThrow(RangeError);
    expect(() => deriveMealTime(new Date(), 'Not/AZone')).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('moves a calendar date across months, years and leap days', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15');
  });
});
