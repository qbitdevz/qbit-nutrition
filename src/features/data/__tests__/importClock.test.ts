import { strToU8 } from 'fflate';

import { createHarness, type Harness } from '@/data/testing/harness';
import { createDevice, pickAndPrepare, type Device } from '../../testing/dataKit';
import { validDocument } from '../../testing/validDocument';
import { parseExportDocument } from '../exportFormat';

/** The device clock: the one thing a file cannot lie about. */
const DEVICE_NOW = new Date('2026-11-21T12:00:00.000Z');
const clock = () => new Date(DEVICE_NOW);
const doc = (): any => JSON.parse(JSON.stringify(validDocument()));
const parse = (raw: unknown) => parseExportDocument(raw, clock);

describe('dates are bounded by the device clock, not by what the file says about itself (S3)', () => {
  it('refuses a file that claims to be from the year 3000, with every date in it in the year 3000', () => {
    const d = doc();
    d.exported_at = '3000-01-01T00:00:00.000Z';
    d.meals[0].local_date = '3000-01-01';
    d.meals[0].eaten_at = '3000-01-01T10:00:00.000Z';
    d.meals[0].created_at = '3000-01-01T10:00:00.000Z';
    d.meals[0].updated_at = '3000-01-01T10:00:00.000Z';
    d.body_measurements[0].measured_on = '3000-01-01';
    expect(parse(d)).toEqual({ ok: false, code: 'invalid', where: 'exported_at' });
  });

  it('allows a little clock skew: a file exported up to two days "ahead" of this device', () => {
    const d = doc();
    d.exported_at = '2026-11-23T11:00:00.000Z';
    expect(parse(d).ok).toBe(true);
  });

  it('refuses an export date more than the skew ahead', () => {
    const d = doc();
    d.exported_at = '2026-11-25T00:00:00.000Z';
    expect(parse(d)).toEqual({ ok: false, code: 'invalid', where: 'exported_at' });
  });

  it('refuses meals and weights dated after the device clock plus the skew, even when exported_at is honest', () => {
    const meal = doc();
    meal.meals[0].local_date = '2026-12-01';
    meal.meals[0].eaten_at = '2026-12-01T10:00:00.000Z';
    expect(parse(meal)).toMatchObject({ ok: false, where: 'meals[0].local_date' });
    const weight = doc();
    weight.body_measurements[0].measured_on = '2026-12-01';
    expect(parse(weight)).toEqual({ ok: false, code: 'invalid', where: 'body_measurements[0].measured_on' });
  });

  it('bounds a birth date by the device year, not the file’s', () => {
    const d = doc();
    d.profile.birth_date = '2026-11-22'; // tomorrow, on this device
    expect(parse(d)).toEqual({ ok: false, code: 'invalid', where: 'profile.birth_date' });
    const old = doc();
    old.profile.birth_date = '1900-01-01'; // more than 120 years before the device year
    expect(parse(old)).toEqual({ ok: false, code: 'invalid', where: 'profile.birth_date' });
  });

  it('keeps accepting what the same device could have written a moment ago', () => {
    expect(parse(doc()).ok).toBe(true);
  });
});

describe('through the importer', () => {
  let b: Harness;
  let to: Device;
  beforeEach(async () => {
    b = await createHarness();
    to = createDevice(b); // its clock is 2026-11-21
  });
  afterEach(() => {
    to.services.close();
    b.close();
  });

  it('a file claiming year 3000 is refused with the place, and nothing is read into the app', async () => {
    const d = doc();
    d.exported_at = '3000-01-01T00:00:00.000Z';
    d.meals[0].local_date = '3000-01-01';
    await expect(pickAndPrepare(to, 'x.json', strToU8(JSON.stringify(d)))).rejects.toMatchObject({ code: 'invalid', where: 'exported_at' });
  });
});
