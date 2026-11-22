/// <reference types="node" />
import { createHarness, type Harness } from '@/data/testing/harness';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, documentText, lastShared, type Device } from '../../testing/dataKit';

/** S10, F3 and F5: what an export leaves out is reported with what it costs, and only an out-of-range goal date is left out. */
let a: Harness;
let device: Device;
beforeEach(async () => {
  a = await createHarness();
  device = createDevice(a);
  await seedEverything(a); // goals: 2026-01-01..2026-06-01, then 2026-06-02 open
});
afterEach(() => {
  device.services.close();
  a.close();
});

const exportIt = () => device.service.exportData({ withPhotos: false, shareTitle: 'Export' });
const docOf = () => JSON.parse(documentText(lastShared(device).bytes));
const insertGoal = (id: string, start: string, end: string | null) =>
  a.client.exec(`INSERT INTO goal (id, type, start_date, end_date, kcal_target, is_custom) VALUES ('${id}', 'maintain', '${start}', ${end ? `'${end}'` : 'NULL'}, 2000, 0)`);

describe('F3 — a goal period left out because of its dates', () => {
  it('is reported with its dates, so the screen can say what it costs', async () => {
    insertGoal('old', '1990-01-01', '1999-12-31');
    const result = await exportIt();
    expect(result.skippedRows).toEqual([{ collection: 'goals', id: 'old', detail: 'goal 1990-01-01 to 1999-12-31', goal: { from: '1990-01-01', to: '1999-12-31' } }]);
    expect(docOf().goals.map((g: { id: string }) => g.id)).not.toContain('old');
  });

  it('an open goal that starts beyond the accepted days is left out and reported as open', async () => {
    a.client.exec(`UPDATE goal SET start_date = '2031-01-01' WHERE end_date IS NULL`);
    const result = await exportIt();
    expect(result.skippedRows).toMatchObject([{ collection: 'goals', goal: { from: '2031-01-01', to: null } }]);
  });
});

describe('F3 — any other goal problem stops the export and names the goal', () => {
  it('two periods that overlap', async () => {
    a.client.exec(`UPDATE goal SET end_date = '2026-06-10' WHERE end_date = '2026-06-01'`);
    await expect(exportIt()).rejects.toMatchObject({ code: 'goal_invalid', where: 'goal 2026-06-02 to now', goal: { from: '2026-06-02', to: null } });
    expect(device.platform.state.shared).toHaveLength(0);
  });

  it('an open period that is not the latest', async () => {
    a.client.exec(`UPDATE goal SET end_date = '2026-12-31' WHERE start_date = '2026-06-02'`);
    a.client.exec(`UPDATE goal SET end_date = NULL WHERE end_date = '2026-06-01'`);
    await expect(exportIt()).rejects.toMatchObject({ code: 'goal_invalid', goal: { from: '2026-01-01', to: null } });
    expect(device.platform.state.shared).toHaveLength(0);
  });

  it('a goal out of range next to an overlap still stops: the overlap is not skipped', async () => {
    insertGoal('old', '1990-01-01', '1999-12-31');
    a.client.exec(`UPDATE goal SET end_date = '2026-06-10' WHERE end_date = '2026-06-01'`);
    await expect(exportIt()).rejects.toMatchObject({ code: 'goal_invalid' });
    expect(device.platform.state.shared).toHaveLength(0);
  });

  it('a stored goal is never changed by an export that stopped', async () => {
    a.client.exec(`UPDATE goal SET end_date = '2026-06-10' WHERE end_date = '2026-06-01'`);
    const before = await a.repos.goals.history();
    await exportIt().catch(() => undefined);
    expect(await a.repos.goals.history()).toEqual(before);
  });
});

describe('F5 — a barcode product with damaged stored metadata that nothing refers to', () => {
  it('is counted among the skipped rows instead of vanishing', async () => {
    a.client.exec(`UPDATE barcode_product SET raw_json = '{oops' WHERE barcode = '4006381333931'`); // the seed's cached product nothing refers to
    const result = await exportIt();
    expect(docOf().barcode_products.map((p: { barcode: string }) => p.barcode)).not.toContain('4006381333931');
    expect(result.skippedRows).toContainEqual({ collection: 'barcode_products', id: '4006381333931', detail: '4006381333931' });
  });

  it('a damaged product that a meal refers to is exported, not reported', async () => {
    a.client.exec(`UPDATE barcode_product SET raw_json = '{oops' WHERE barcode = '5449000000996'`);
    const result = await exportIt();
    expect(docOf().barcode_products.map((p: { barcode: string }) => p.barcode)).toContain('5449000000996');
    expect(result.skippedRows).toEqual([]);
  });

  it('a healthy cached product nothing refers to is not a skipped row (it is only a cache)', async () => {
    expect((await exportIt()).skippedRows).toEqual([]);
  });
});
