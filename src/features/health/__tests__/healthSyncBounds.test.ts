/** @jest-environment node */
import { createHarness, type Harness } from '@/data/testing/harness';
import { createFakeHealthPlatform, type FakeHealthPlatform } from '@/platform/fakeHealthPlatform';
import { createHealthSync, type HealthSync } from '../healthSync';

let h: Harness;
let platform: FakeHealthPlatform;
let health: HealthSync;
const NOW = new Date('2026-06-15T12:00:00.000Z');
beforeEach(async () => {
  h = await createHarness();
  platform = createFakeHealthPlatform();
  health = createHealthSync({ repos: h.repos, platform, now: () => new Date(NOW) });
});
afterEach(() => h.close());

const reading = (time: string, kg: number) => ({ time, kg });
const rows = async () => (await h.repos.measurements.list('weight')).map((r) => [r.measuredOn, r.value, r.source]);

describe('weights from Health Connect are bounded where they enter', () => {
  it('ignores readings outside the weight range the forms use, counts them, and imports the rest', async () => {
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 12.5), reading('2026-06-13T09:00:00.000Z', 700), reading('2026-06-12T09:00:00.000Z', 71.5)];
    await health.turnOn();
    expect(await rows()).toEqual([['2026-06-12', 71.5, 'health_connect']]);
    expect((await health.status()).weightsIgnored).toBe(2);
  });

  it('does not bring the reading back at the next sync, whatever the person deletes', async () => {
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 12.5)];
    await health.turnOn();
    await health.syncWeight();
    await health.syncWeight();
    expect(await rows()).toEqual([]);
  });

  it('a bad reading never hides a good one from the same day', async () => {
    platform.state.weights = [reading('2026-06-14T07:00:00.000Z', 71.5), reading('2026-06-14T20:00:00.000Z', 12.5)];
    await health.turnOn();
    expect(await rows()).toEqual([['2026-06-14', 71.5, 'health_connect']]);
  });

  it('counts only what the last sync ignored', async () => {
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 12.5)];
    await health.turnOn();
    expect((await health.status()).weightsIgnored).toBe(1);
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 71)];
    await health.syncWeight();
    expect((await health.status()).weightsIgnored).toBe(0);
  });

  it('removes an out-of-range Health Connect row stored before the bound existed, wherever it is dated, and never a manual one', async () => {
    h.client.exec(`INSERT INTO body_measurement (id, measured_on, kind, value, source) VALUES ('old-bad', '2026-01-10', 'weight', 12.5, 'health_connect')`);
    h.client.exec(`INSERT INTO body_measurement (id, measured_on, kind, value, source) VALUES ('manual-odd', '2026-01-11', 'weight', 15, 'manual')`);
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 71)];
    await health.turnOn();
    expect(await rows()).toEqual([
      ['2026-01-11', 15, 'manual'],
      ['2026-06-14', 71, 'health_connect'],
    ]);
  });
});

describe('wiping all data while Health Connect work is under way (S3, S7)', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };

  it('a weight sync in flight finishes before the wipe, and nothing is added after it', async () => {
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 71)];
    await health.turnOn();
    const gate = deferred<void>();
    const readWeights = platform.readWeights.bind(platform);
    platform.readWeights = async (range) => {
      await gate.promise;
      return readWeights(range);
    };
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 70), reading('2026-06-13T09:00:00.000Z', 69)];

    const sync = health.syncWeight(); // in flight: it has read the settings and is waiting for Health Connect
    const wipe = health.wipe(false, () => h.repos.backup.deleteAll());
    gate.resolve();
    await Promise.all([sync, wipe]);

    expect(await h.repos.measurements.list('weight')).toEqual([]);
    expect(await h.repos.settings.getAll()).toEqual({});
    await health.syncWeight(); // and it stays off: the integration's setting went with the data
    expect(await h.repos.measurements.list('weight')).toEqual([]);
  });

  it('removes the records this app wrote first, and reports that it did when the wipe then fails', async () => {
    platform.state.weights = [];
    await health.turnOn();
    platform.state.records.set('meal-1', { clientRecordId: 'meal-1' } as never);
    const result = await health.wipe(true, async () => {
      throw new Error('database locked');
    }).then(() => null, (error: unknown) => error as { code: string; recordsRemoved: boolean });
    expect(result).toMatchObject({ code: 'wipe_failed', recordsRemoved: true });
    expect(platform.state.records.size).toBe(0);
  });

  it('does not run the wipe when Health Connect refuses to remove its records (nothing deleted yet)', async () => {
    await health.turnOn();
    platform.state.failDeletes = 1;
    const task = jest.fn(async () => undefined);
    await expect(health.wipe(true, task)).rejects.toMatchObject({ code: 'records_not_removed' });
    expect(task).not.toHaveBeenCalled();
  });

  it('runs the wipe alone when the person keeps the records', async () => {
    await health.turnOn();
    const task = jest.fn(async () => undefined);
    await health.wipe(false, task);
    expect(task).toHaveBeenCalledTimes(1);
    expect(platform.state.calls).not.toContain('deleteAllNutritionWritten');
  });
});
