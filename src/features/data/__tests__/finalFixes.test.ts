/// <reference types="node" />
import { createHarness, type Harness } from '@/data/testing/harness';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, documentText, jpeg, lastShared, pickAndPrepare, type Device } from '../../testing/dataKit';

let a: Harness;
let b: Harness;
let from: Device;
let to: Device;
beforeEach(async () => {
  a = await createHarness();
  b = await createHarness();
  from = createDevice(a);
  to = createDevice(b);
  await seedEverything(a, { photoPath: 'photos/src-1.jpg' });
  from.platform.addPhoto('photos/src-1.jpg', jpeg(1));
});
afterEach(() => {
  jest.restoreAllMocks();
  from.services.close();
  to.services.close();
  a.close();
  b.close();
});

const exportIt = (withPhotos = false) => from.service.exportData({ withPhotos, shareTitle: 'Export' });
const docOf = () => JSON.parse(documentText(lastShared(from).bytes));
const today = () => new Date().toISOString().slice(0, 10);
const insertGoal = (h: Harness, id: string, start: string, end: string | null) =>
  h.client.exec(`INSERT INTO goal (id, type, start_date, end_date, kcal_target, is_custom) VALUES ('${id}', 'maintain', '${start}', ${end ? `'${end}'` : 'NULL'}, 2000, 0)`);

describe('item 3 — a damaged row or a non-JPEG photo never makes a backup the app refuses', () => {
  it('a barcode row with malformed raw_json is read as not edited; export and read still work', async () => {
    a.client.exec(`UPDATE barcode_product SET raw_json = '{oops' WHERE barcode = '12345670'`);
    await expect(a.repos.backup.read()).resolves.toBeDefined();
    await exportIt();
    expect(docOf().barcode_products.map((p: { barcode: string }) => p.barcode)).not.toContain('12345670');
  });

  it('a kept photo that is not a JPEG is left out and reported', async () => {
    from.platform.addPhoto('photos/src-1.jpg', Uint8Array.from([1, 2, 3, 4, 5, 6]));
    const result = await exportIt(true);
    expect(result.photos).toBe(0);
    expect(result.skippedPhotos).toEqual(['photos/src-1.jpg']);
    await expect(pickAndPrepare(to, lastShared(from).name, lastShared(from).bytes)).resolves.toBeDefined();
  });
});

describe('item 4 — a goal set while the clock was wrong can be repaired and never blocks an export', () => {
  it('setting a goal today refuses an open goal that starts in the future, and replaces it only when the person confirms', async () => {
    a.client.exec(`DELETE FROM goal`);
    insertGoal(a, 'bad-open', '2031-01-01', null);
    const input = { type: 'maintain', startDate: today(), kcalTarget: 1900, proteinGTarget: 100, carbsGTarget: 200, fatGTarget: 60 } as const;
    await expect(a.repos.goals.set(input)).rejects.toMatchObject({ code: 'goal_date_conflict', canReplace: true });
    expect((await a.repos.goals.history()).map((g) => g.id)).toEqual(['bad-open']);
    const set = await a.repos.goals.set(input, { replaceGoalId: 'bad-open' });
    expect((await a.repos.goals.history()).map((g) => [g.id === 'bad-open', g.startDate, g.endDate])).toEqual([[false, today(), null]]);
    expect(set).toMatchObject({ kcalTarget: 1900, replaced: { id: 'bad-open', startDate: '2031-01-01' } });
  });

  it('setting a goal today closes an open goal that starts before 2000 the day before; it is not deleted', async () => {
    a.client.exec(`DELETE FROM goal`);
    insertGoal(a, 'old-open', '1970-01-01', null);
    await a.repos.goals.set({ type: 'maintain', startDate: today(), kcalTarget: 1900 });
    expect((await a.repos.goals.history()).map((g) => [g.id, g.startDate, g.endDate]).slice(0, 1)).toEqual([['old-open', '1970-01-01', addDay(today(), -1)]]);
  });

  it('a normal open goal is still closed the day before, not replaced', async () => {
    await a.repos.goals.set({ type: 'maintain', startDate: today(), kcalTarget: 1900 });
    const history = await a.repos.goals.history();
    expect(history.some((g) => g.startDate === '2026-06-02' && g.endDate === addDay(today(), -1))).toBe(true);
  });

  it('the export leaves out a goal period whose dates are out of range, and says which', async () => {
    insertGoal(a, 'old-closed', '1999-01-01', '1999-12-31');
    const result = await exportIt();
    expect(result.skippedRows).toEqual([{ collection: 'goals', id: 'old-closed', detail: 'goal 1999-01-01 to 1999-12-31', goal: { from: '1999-01-01', to: '1999-12-31' } }]);
    expect(docOf().goals.map((g: { id: string }) => g.id)).not.toContain('old-closed');
    await expect(pickAndPrepare(to, lastShared(from).name, lastShared(from).bytes)).resolves.toBeDefined();
  });

  it('the export leaves out an open goal that starts in the future, and says so', async () => {
    a.client.exec(`UPDATE goal SET start_date = '2031-01-01' WHERE end_date IS NULL`);
    const result = await exportIt();
    expect(result.skippedRows.map((r) => [r.collection, r.detail])).toEqual([['goals', 'goal 2031-01-01 to now']]);
  });
});

function addDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('item 5 — restoring or editing a row that is already stored is not subject to the entry bound', () => {
  const meal = {
    eatenAt: new Date(),
    slot: 'lunch' as const,
    source: 'manual' as const,
    items: [{ displayName: 'Rice', grams: 100, foodSource: 'ai_estimate' as const, foodRef: null, origin: 'manual' as const, nutrients: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 } }],
  };

  it('Undo restores a meal whose stored date is out of range', async () => {
    const saved = await a.repos.meals.save(meal);
    a.client.exec(`UPDATE meal SET local_date = '2031-03-04', eaten_at = '2031-03-04T10:00:00.000Z' WHERE id = '${saved.id}'`);
    const stored = (await a.repos.meals.getMeal(saved.id))!;
    await a.repos.meals.deleteMeal(saved.id);
    await expect(a.repos.meals.restoreMeal(stored)).resolves.toMatchObject({ id: saved.id, localDate: '2031-03-04' });
  });

  it('editing only the value of a stored out-of-range measurement works; moving it to another bad day does not', async () => {
    a.client.exec(`INSERT INTO body_measurement (id, measured_on, kind, value, source) VALUES ('m-bad', '2031-03-04', 'weight', 70, 'manual')`);
    await expect(a.repos.measurements.update('m-bad', { measuredOn: '2031-03-04', value: 71 })).resolves.toMatchObject({ value: 71 });
    await expect(a.repos.measurements.update('m-bad', { measuredOn: '2032-01-01' })).rejects.toMatchObject({ code: 'date_out_of_range' });
    await expect(a.repos.measurements.update('m-bad', { measuredOn: '2026-06-10' })).resolves.toMatchObject({ measuredOn: '2026-06-10' });
  });
});

describe('item 6 — a stored file name with a path or control character is exported as its base name', () => {
  it('keeps the base name, or none', async () => {
    a.client.exec(`UPDATE food_collection SET file_name = 'C:\\folder\\sub/tabla.csv'`);
    await exportIt();
    expect(docOf().imported_collections[0].file_name).toBe('tabla.csv');
    a.client.exec(`UPDATE food_collection SET file_name = 'ta' || char(1) || 'bla.csv'`);
    await exportIt();
    expect(docOf().imported_collections[0].file_name).toBe('tabla.csv');
    a.client.exec(`UPDATE food_collection SET file_name = 'folder/'`);
    await exportIt();
    expect(docOf().imported_collections[0].file_name).toBeNull();
  });
});

describe('item 7 — only keys known to have existed are counted as removed', () => {
  it('a store that cannot say whether a key exists counts none of them', async () => {
    const [p1] = (await a.repos.aiProviders.list()).map((p) => p.id);
    await from.services.secrets.set(p1!, 'key-one-123456');
    jest.spyOn(from.services.secrets, 'list').mockRejectedValue(new Error('keystore broke'));
    jest.spyOn(from.services.secrets, 'has').mockRejectedValue(new Error('cannot tell'));
    const error = await from.service.deleteAll({ confirmation: 'DELETE' }).catch((e: unknown) => e as { keysDeleted: number });
    expect(error).toMatchObject({ code: 'delete_incomplete', keysDeleted: 0 });
  });
});
