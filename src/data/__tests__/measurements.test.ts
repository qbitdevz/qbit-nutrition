/** @jest-environment node */
import { sql } from 'drizzle-orm';
import { expectDataError } from '../testing/expectations';
import { createHarness, type Harness } from '../testing/harness';

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

const rows = () => h.db.all<{ n: number }>(sql`SELECT count(*) AS n FROM body_measurement`)[0]?.n;

describe('MeasurementRepository', () => {
  it('records a measurement and reads it back', async () => {
    const m = await h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82.4 });
    expect(m).toMatchObject({ measuredOn: '2026-06-01', kind: 'weight', value: 82.4, source: 'manual' });
    expect((await h.repos.measurements.latest('weight'))?.value).toBe(82.4);
  });

  it('is unique per (day, kind, source): recording again the same day replaces the value', async () => {
    const first = await h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82.4 });
    const second = await h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: 81.9 });
    expect(rows()).toBe(1);
    expect(second.id).toBe(first.id);
    expect(second.value).toBe(81.9);
  });

  it('keeps different kinds, days and sources apart', async () => {
    const r = h.repos.measurements;
    await r.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82 });
    await r.record({ measuredOn: '2026-06-01', kind: 'waist', value: 90 });
    await r.record({ measuredOn: '2026-06-02', kind: 'weight', value: 81.8 });
    await r.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82.1, source: 'health_connect' });
    expect(rows()).toBe(4);
  });

  it('refuses a duplicate that bypasses the repository', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82 });
    expect(() =>
      h.db.run(
        sql`INSERT INTO body_measurement (id, measured_on, kind, value, source) VALUES ('x', '2026-06-01', 'weight', 80, 'manual')`,
      ),
    ).toThrow();
  });

  it('lists a kind oldest first within a date range, and deletes by id', async () => {
    const r = h.repos.measurements;
    await r.record({ measuredOn: '2026-06-03', kind: 'weight', value: 81.5 });
    await r.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82 });
    const mid = await r.record({ measuredOn: '2026-06-02', kind: 'weight', value: 81.8 });
    await r.record({ measuredOn: '2026-06-02', kind: 'waist', value: 90 });

    expect((await r.list('weight')).map((m) => m.measuredOn)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect((await r.list('weight', { from: '2026-06-02', to: '2026-06-02' })).map((m) => m.value)).toEqual([81.8]);
    expect((await r.latest('weight'))?.measuredOn).toBe('2026-06-03');
    expect(await r.latest('hips')).toBeNull();

    await r.delete(mid.id);
    expect((await r.list('weight')).map((m) => m.measuredOn)).toEqual(['2026-06-01', '2026-06-03']);
    await expectDataError(r.delete(mid.id), 'not_found');
  });

  it('rejects values that are not positive finite numbers', async () => {
    for (const value of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expectDataError(h.repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value }), 'invalid_input');
    }
    expect(rows()).toBe(0);
  });
});

describe('MeasurementRepository.update', () => {
  it('changes the value and keeps the id, date, kind and source', async () => {
    const r = h.repos.measurements;
    const m = await r.record({ measuredOn: '2026-06-01', kind: 'waist', value: 90 });
    const updated = await r.update(m.id, { value: 89.5 });
    expect(updated).toEqual({ ...m, value: 89.5 });
    expect(rows()).toBe(1);
  });

  it('moves the entry to another day', async () => {
    const r = h.repos.measurements;
    const m = await r.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82 });
    const updated = await r.update(m.id, { measuredOn: '2026-05-30', value: 82.2 });
    expect(updated).toMatchObject({ id: m.id, measuredOn: '2026-05-30', value: 82.2 });
    expect((await r.list('weight')).map((x) => x.measuredOn)).toEqual(['2026-05-30']);
  });

  it('refuses a move onto a day that already has that measurement and leaves both entries alone', async () => {
    const r = h.repos.measurements;
    const a = await r.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82 });
    const b = await r.record({ measuredOn: '2026-06-02', kind: 'weight', value: 81 });
    await expectDataError(r.update(b.id, { measuredOn: '2026-06-01' }), 'measurement_conflict');
    expect(await r.list('weight')).toEqual([a, b]);
  });

  it('allows the same day for a different kind', async () => {
    const r = h.repos.measurements;
    await r.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82 });
    const waist = await r.record({ measuredOn: '2026-06-02', kind: 'waist', value: 90 });
    await expect(r.update(waist.id, { measuredOn: '2026-06-01' })).resolves.toMatchObject({ measuredOn: '2026-06-01' });
  });

  it('rejects an unknown id, a bad value and a bad date', async () => {
    const r = h.repos.measurements;
    const m = await r.record({ measuredOn: '2026-06-01', kind: 'weight', value: 82 });
    await expectDataError(r.update('missing', { value: 80 }), 'not_found');
    await expectDataError(r.update(m.id, { value: 0 }), 'invalid_input');
    await expectDataError(r.update(m.id, { value: Number.NaN }), 'invalid_input');
    await expectDataError(r.update(m.id, { measuredOn: '2026-13-01' }), 'invalid_input');
    expect((await r.list('weight'))[0]).toEqual(m);
  });
});
