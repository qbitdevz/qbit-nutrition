/** @jest-environment node */
import { createHarness, type Harness } from '@/data/testing/harness';
import type { SaveMealInput } from '@/data';
import { createFakeHealthPlatform, type FakeHealthPlatform } from '@/platform/fakeHealthPlatform';
import type { HealthAvailability } from '@/platform/healthPlatform';
import { isPortableSetting, keptSettings, portableSettings } from '../../data/settingsPolicy';
import { createHealthSync, HEALTH_ENABLED_KEY, HEALTH_PENDING_KEY, type HealthSync } from '../healthSync';
import { nutritionRecordForMeal } from '../record';
import { withHealthSync } from '../syncedRepos';

let h: Harness;
let platform: FakeHealthPlatform;
let health: HealthSync;
let repos: ReturnType<typeof withHealthSync>;
const NOW = new Date('2026-06-15T12:00:00.000Z');

beforeEach(async () => {
  h = await createHarness();
  platform = createFakeHealthPlatform();
  health = createHealthSync({ repos: h.repos, platform, now: () => new Date(NOW) });
  repos = withHealthSync(h.repos, health);
});
afterEach(() => h.close());

const lunch = (over: Partial<SaveMealInput> = {}): SaveMealInput => ({
  eatenAt: new Date('2026-06-15T10:30:00.000Z'),
  slot: 'lunch',
  source: 'manual',
  items: [
    { displayName: 'Rice', grams: 180, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 234, protein: 4.9, carbs: 51, fat: 0.5 } },
    { displayName: 'Chicken', grams: 120, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 198, protein: 37, carbs: 0, fat: 4.3 } },
  ],
  ...over,
});

const saveMeal = async (over: Partial<SaveMealInput> = {}) => {
  const meal = await repos.meals.save(lunch(over));
  await health.idle();
  return meal;
};

describe('while the integration is off', () => {
  it('calls nothing on the platform, whatever the app does', async () => {
    const meal = await saveMeal();
    h.setNow('2026-06-15T12:01:00.000Z');
    await repos.meals.updateMeal(meal.id, { slot: 'dinner' });
    await repos.meals.deleteMeal(meal.id);
    await health.idle();
    await health.retry();
    await health.syncWeight();
    await health.status();
    await health.sendExistingMeals();
    await health.isEnabled();
    expect(platform.state.calls).toEqual([]);
    expect(await h.repos.settings.get(HEALTH_PENDING_KEY)).toBeNull();
  });

  it('is off by default', async () => {
    expect(await health.isEnabled()).toBe(false);
    expect((await health.status()).enabled).toBe(false);
  });
});

describe('availability', () => {
  it.each<HealthAvailability>(['not_installed', 'needs_update', 'unavailable'])('stays off and asks for nothing when Health Connect is %s', async (availability) => {
    platform.state.availability = availability;
    const result = await health.turnOn();
    expect(result.outcome).toBe('unavailable');
    expect(result.status).toMatchObject({ enabled: false, availability });
    expect(platform.state.calls).toEqual(['availability']);
    expect(await h.repos.settings.get(HEALTH_ENABLED_KEY)).toBeNull();
  });

  it('turns on when it is available', async () => {
    const result = await health.turnOn();
    expect(result.outcome).toBe('on');
    expect(result.status).toMatchObject({ enabled: true, availability: 'available', grants: { writeNutrition: 'granted', readWeight: 'granted' } });
  });

  it('treats a platform that cannot even answer as unavailable', async () => {
    platform.availability = async () => {
      throw new Error('boom');
    };
    expect((await health.turnOn()).outcome).toBe('unavailable');
  });

  it('opens the store page and the system settings on request', () => {
    health.openInstall();
    health.openSettings();
    expect([platform.state.installOpened, platform.state.settingsOpened]).toEqual([1, 1]);
  });
});

describe('grants: write nutrition and read weight are separate', () => {
  const weights = [{ time: '2026-06-14T09:00:00.000Z', kg: 71.4 }];

  it('both granted: meals go out and weights come in', async () => {
    platform.state.weights = weights;
    await health.turnOn();
    const meal = await saveMeal();
    expect(platform.state.records.has(meal.id)).toBe(true);
    expect((await h.repos.measurements.list('weight')).map((m) => [m.measuredOn, m.value, m.source])).toEqual([['2026-06-14', 71.4, 'health_connect']]);
  });

  it('only nutrition granted: meals go out, weight is never read, and the screen says weight is not allowed', async () => {
    platform.state.willGrant = { writeNutrition: true, readWeight: false };
    platform.state.weights = weights;
    const result = await health.turnOn();
    expect(result.outcome).toBe('on');
    expect(result.status.grants).toEqual({ writeNutrition: 'granted', readWeight: 'not_granted' });
    const meal = await saveMeal();
    await health.syncWeight();
    expect(platform.state.records.has(meal.id)).toBe(true);
    expect(platform.state.calls).not.toContain('readWeights');
    expect(await h.repos.measurements.list('weight')).toEqual([]);
  });

  it('only weight granted: weights come in, meals are saved normally and nothing is written or queued', async () => {
    platform.state.willGrant = { writeNutrition: false, readWeight: true };
    platform.state.weights = weights;
    const result = await health.turnOn();
    expect(result.status.grants).toEqual({ writeNutrition: 'not_granted', readWeight: 'granted' });
    const meal = await saveMeal();
    expect(await h.repos.meals.getMeal(meal.id)).not.toBeNull();
    expect(platform.state.calls).not.toContain('writeNutrition');
    expect(platform.state.records.size).toBe(0);
    expect((await health.status()).pending).toBe(0);
    expect(await h.repos.measurements.list('weight')).toHaveLength(1);
  });

  it('neither granted: the integration stays off and nothing is stored', async () => {
    platform.state.willGrant = { writeNutrition: false, readWeight: false };
    const result = await health.turnOn();
    expect(result.outcome).toBe('declined');
    expect(await health.isEnabled()).toBe(false);
    await saveMeal();
    expect(platform.state.calls).not.toContain('writeNutrition');
  });

  it('can ask for the declined grant again, and then it works', async () => {
    platform.state.willGrant = { writeNutrition: true, readWeight: false };
    platform.state.weights = weights;
    await health.turnOn();
    platform.state.willGrant.readWeight = true;
    const status = await health.requestGrant('readWeight');
    expect(status.grants).toEqual({ writeNutrition: 'granted', readWeight: 'granted' });
    expect(await h.repos.measurements.list('weight')).toHaveLength(1);
  });

  it('detects a permission taken away in system settings and shows it as revoked, not as never given', async () => {
    await health.turnOn();
    platform.state.granted.writeNutrition = false;
    const status = await health.status();
    expect(status.grants).toEqual({ writeNutrition: 'revoked', readWeight: 'granted' });
  });

  it('keeps meals saved while a permission is revoked waiting, and writes them once it is allowed again', async () => {
    await health.turnOn();
    platform.state.granted.writeNutrition = false;
    const meal = await saveMeal();
    expect(await h.repos.meals.getMeal(meal.id)).not.toBeNull();
    expect(platform.state.records.size).toBe(0);
    const waiting = await health.status();
    expect(waiting.pending).toBe(1);
    expect(waiting.failing).toBe(true);

    const after = await health.requestGrant('writeNutrition');
    expect(after.grants?.writeNutrition).toBe('granted');
    expect(after.pending).toBe(0);
    expect(platform.state.records.has(meal.id)).toBe(true);
  });
});

describe('writing meals', () => {
  beforeEach(async () => {
    await health.turnOn();
  });

  it('writes each saved meal once, with the meal id as the client record id and the content of its record', async () => {
    const meal = await saveMeal();
    const written = platform.state.records.get(meal.id)!;
    expect(written).toEqual(nutritionRecordForMeal(meal));
    // 234 + 198 kcal, 4.9 + 37 g protein, 51 + 0 g carbohydrate, 0.5 + 4.3 g fat.
    expect(written.energyKcal).toBeCloseTo(432, 9);
    expect(written.grams.protein).toBeCloseTo(41.9, 9);
    expect(written.grams.totalCarbohydrate).toBeCloseTo(51, 9);
    expect(written.grams.totalFat).toBeCloseTo(4.8, 9);
    expect(written.mealType).toBe('lunch');
    expect(platform.state.records.size).toBe(1);
  });

  it('updates the same record when the meal type, an item amount, or an item changes', async () => {
    const meal = await saveMeal();
    h.setNow('2026-06-15T12:00:10.000Z');
    await repos.meals.updateMeal(meal.id, { slot: 'dinner' });
    await health.idle();
    expect(platform.state.records.get(meal.id)?.mealType).toBe('dinner');

    h.setNow('2026-06-15T12:00:20.000Z');
    await repos.meals.updateItemGrams(meal.items[0]!.id, 90); // no source food: the snapshot scales by 90 / 180
    await health.idle();
    const halved = platform.state.records.get(meal.id)!;
    expect(halved.energyKcal).toBeCloseTo(117 + 198, 9);

    h.setNow('2026-06-15T12:00:30.000Z');
    await repos.meals.deleteItem(meal.items[1]!.id);
    await health.idle();
    expect(platform.state.records.get(meal.id)!.energyKcal).toBeCloseTo(117, 9);
    expect(platform.state.records.size).toBe(1); // one record, never duplicated
  });

  it('follows the undo of a removed item: the record loses the item, then gets it back, and stays one record (S4)', async () => {
    const meal = await saveMeal();
    const total = 234 + 198;
    h.setNow('2026-06-15T12:00:10.000Z');
    await repos.meals.deleteItem(meal.items[1]!.id);
    await health.idle();
    expect(platform.state.records.get(meal.id)!.energyKcal).toBeCloseTo(234, 9);

    h.setNow('2026-06-15T12:00:20.000Z');
    await repos.meals.restoreItem(meal.items[1]!);
    await health.idle();
    expect(platform.state.records.get(meal.id)!.energyKcal).toBeCloseTo(total, 9);
    expect(platform.state.records.size).toBe(1);
    expect((await health.status()).pending).toBe(0);
  });

  it('follows the undo of a removed meal: the record is deleted, then written again under the same id', async () => {
    const meal = await saveMeal();
    const original = (await repos.meals.getMeal(meal.id))!;
    await repos.meals.deleteMeal(meal.id);
    await health.idle();
    expect(platform.state.records.size).toBe(0);

    h.setNow('2026-06-15T12:00:30.000Z');
    await repos.meals.restoreMeal(original);
    await health.idle();
    expect(platform.state.records.get(meal.id)!.energyKcal).toBeCloseTo(234 + 198, 9);
    expect(platform.state.records.size).toBe(1);
  });

  it('deletes the record when the meal is deleted', async () => {
    const meal = await saveMeal();
    await repos.meals.deleteMeal(meal.id);
    await health.idle();
    expect(platform.state.records.size).toBe(0);
    expect((await health.status()).pending).toBe(0);
  });

  it('never writes a second record when the same meal is written again', async () => {
    const meal = await saveMeal();
    await health.mealChanged(meal.id);
    await health.mealChanged(meal.id);
    expect(platform.state.records.size).toBe(1);
  });
});

describe('a failing write', () => {
  beforeEach(async () => {
    await health.turnOn();
  });

  it('never blocks or fails saving the meal; the record waits, is shown as pending, and is written on retry', async () => {
    platform.state.failWrites = 1;
    const meal = await saveMeal();

    expect(await h.repos.meals.getMeal(meal.id)).not.toBeNull(); // saved
    const waiting = await health.status();
    expect(waiting).toMatchObject({ pending: 1, failing: true });
    expect(platform.state.records.size).toBe(0);

    const after = await health.retry();
    expect(after).toMatchObject({ pending: 0, failing: false });
    expect(platform.state.records.get(meal.id)).toEqual(nutritionRecordForMeal(meal));
  });

  it('is retried by the next meal that is saved, in order, without losing the first', async () => {
    platform.state.failWrites = 1;
    const first = await saveMeal();
    const second = await saveMeal({ slot: 'dinner' });
    expect([...platform.state.records.keys()].sort()).toEqual([first.id, second.id].sort());
    expect((await health.status()).pending).toBe(0);
  });

  it('keeps a delete that failed and sends it later', async () => {
    const meal = await saveMeal();
    platform.state.failDeletes = 1;
    await repos.meals.deleteMeal(meal.id);
    await health.idle();
    expect(await h.repos.meals.getMeal(meal.id)).toBeNull();
    expect(platform.state.records.has(meal.id)).toBe(true);
    expect((await health.status()).pending).toBe(1);
    await health.retry();
    expect(platform.state.records.size).toBe(0);
  });

  it('removes the record of a meal that was deleted while its write was still waiting, and writes nothing for it', async () => {
    platform.state.failWrites = 1;
    const meal = await saveMeal();
    await repos.meals.deleteMeal(meal.id);
    await health.idle();
    expect(platform.state.records.size).toBe(0);
    expect((await health.status()).pending).toBe(0);
  });

  it('reports a Health Connect that cannot be reached as failing, with the queue intact', async () => {
    const meal = await saveMeal();
    platform.state.failGrantCheck = true;
    h.setNow('2026-06-15T12:05:00.000Z');
    await repos.meals.updateMeal(meal.id, { note: 'x' });
    await health.idle();
    expect((await health.status()).pending).toBe(1);
    platform.state.failGrantCheck = false;
    expect((await health.retry()).pending).toBe(0);
  });
});

describe('reading weight', () => {
  const reading = (time: string, kg: number) => ({ time, kg });

  it('imports one entry per day with source health_connect, the latest reading of the day', async () => {
    platform.state.weights = [reading('2026-06-14T07:00:00.000Z', 72.04), reading('2026-06-14T20:00:00.000Z', 71.5), reading('2026-06-10T12:00:00.000Z', 73)];
    await health.turnOn();
    const rows = await h.repos.measurements.list('weight');
    expect(rows.map((r) => [r.measuredOn, r.value, r.source])).toEqual([
      ['2026-06-10', 73, 'health_connect'],
      ['2026-06-14', 71.5, 'health_connect'],
    ]);
  });

  it('is idempotent: syncing again adds, duplicates, or changes nothing', async () => {
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 71.4), reading('2026-06-12T09:00:00.000Z', 72)];
    await health.turnOn();
    const before = await h.repos.measurements.list('weight');
    expect(await health.syncWeight()).toBe(0);
    expect(await health.syncWeight()).toBe(0);
    expect(await h.repos.measurements.list('weight')).toEqual(before); // same ids too: nothing was rewritten
  });

  it('picks up a changed value and a new day, and drops a day the person deleted in Health Connect', async () => {
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 71.4), reading('2026-06-12T09:00:00.000Z', 72)];
    await health.turnOn();
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 71.0), reading('2026-06-15T08:00:00.000Z', 70.8)];
    expect(await health.syncWeight()).toBe(3); // one changed, one added, one removed
    expect((await h.repos.measurements.list('weight')).map((r) => [r.measuredOn, r.value])).toEqual([
      ['2026-06-14', 71],
      ['2026-06-15', 70.8],
    ]);
  });

  it('never touches manual entries: not on a day Health Connect also has, and not when Health Connect has nothing', async () => {
    await h.repos.measurements.record({ measuredOn: '2026-06-14', kind: 'weight', value: 80 });
    await h.repos.measurements.record({ measuredOn: '2026-06-13', kind: 'weight', value: 79 });
    platform.state.weights = [reading('2026-06-14T09:00:00.000Z', 71.4)];
    await health.turnOn();
    let rows = await h.repos.measurements.list('weight');
    expect(rows.filter((r) => r.source === 'manual').map((r) => [r.measuredOn, r.value])).toEqual([
      ['2026-06-13', 79],
      ['2026-06-14', 80],
    ]);
    expect(rows.filter((r) => r.source === 'health_connect')).toHaveLength(1);

    platform.state.weights = [];
    await health.syncWeight();
    rows = await h.repos.measurements.list('weight');
    expect(rows.map((r) => r.source)).toEqual(['manual', 'manual']);
  });

  it('ignores readings that are not a usable weight', async () => {
    platform.state.weights = [reading('not a date', 70), reading('2026-06-14T09:00:00.000Z', 0), reading('2026-06-14T10:00:00.000Z', -3), reading('2026-06-13T10:00:00.000Z', 69.9)];
    await health.turnOn();
    expect((await h.repos.measurements.list('weight')).map((r) => r.measuredOn)).toEqual(['2026-06-13']);
  });

  it('reads only the last 30 days, and a failed read changes nothing and says so', async () => {
    platform.state.weights = [reading('2026-04-01T09:00:00.000Z', 90)];
    await health.turnOn();
    expect(await h.repos.measurements.list('weight')).toEqual([]);
    platform.state.failReads = true;
    expect(await health.syncWeight()).toBe(0);
    expect((await health.status()).failing).toBe(true);
  });
});

describe('meals logged before, and turning it off', () => {
  it('does not write meals that existed before it was turned on, until the person asks', async () => {
    const a = await h.repos.meals.save(lunch());
    const b = await h.repos.meals.save(lunch({ slot: 'dinner' }));
    await health.turnOn();
    await health.retry();
    expect(platform.state.records.size).toBe(0);

    expect(await health.sendExistingMeals()).toBe(2);
    expect([...platform.state.records.keys()].sort()).toEqual([a.id, b.id].sort());
  });

  it('turning it off forgets the queue and stops all calls; records already written stay in Health Connect', async () => {
    await health.turnOn();
    const meal = await saveMeal();
    platform.state.failWrites = 1;
    await saveMeal({ slot: 'dinner' });
    expect((await health.status()).pending).toBe(1);

    await health.turnOff();
    const calls = platform.state.calls.length;
    await saveMeal({ slot: 'snack' });
    await health.retry();
    expect(platform.state.calls).toHaveLength(calls);
    expect(platform.state.records.has(meal.id)).toBe(true);
    expect(await h.repos.settings.get(HEALTH_PENDING_KEY)).toBeNull();
    expect(await health.isEnabled()).toBe(false);
  });

  it('removes the records this app wrote when asked, and reports a refusal without forgetting anything', async () => {
    await health.turnOn();
    await saveMeal();
    platform.state.failDeletes = 1;
    await expect(health.removeWrittenRecords()).rejects.toThrow();
    expect(platform.state.records.size).toBe(1);
    await health.removeWrittenRecords();
    expect(platform.state.records.size).toBe(0);
  });
});

describe('the integration state', () => {
  it('belongs to this installation: never exported, kept by an import, so importing a file does not switch the integration off', () => {
    const all = { [HEALTH_ENABLED_KEY]: 'true', [HEALTH_PENDING_KEY]: '{"upsert":[],"remove":[]}', 'health_connect.granted': '{}', 'health_connect.weight_synced_at': 'x' };
    for (const key of Object.keys(all)) expect(isPortableSetting(key)).toBe(false);
    expect(portableSettings(all)).toEqual({});
    expect(keptSettings(all)).toEqual(all);
  });
});
