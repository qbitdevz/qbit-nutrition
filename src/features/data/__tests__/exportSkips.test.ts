/// <reference types="node" />
import { strFromU8 } from 'fflate';

import { createHarness, type Harness } from '@/data/testing/harness';
import { seedEverything } from '../../testing/backupSeed';
import { createDevice, fullState, lastShared, type Device } from '../../testing/dataKit';

let a: Harness;
let device: Device;
beforeEach(async () => {
  a = await createHarness();
  device = createDevice(a);
  await seedEverything(a);
});
afterEach(() => {
  device.services.close();
  a.close();
});

const exportIt = () => device.service.exportData({ withPhotos: false, shareTitle: 'Export' });
const docOf = () => JSON.parse(strFromU8(lastShared(device).bytes));

describe('one stored value outside the format never stops an export of everything else', () => {
  it('skips a body measurement the app would no longer accept, and reports exactly what was left out', async () => {
    a.client.exec(`INSERT INTO body_measurement (id, measured_on, kind, value, source) VALUES ('hc-bad', '2026-06-04', 'weight', 12.5, 'health_connect')`);
    const result = await exportIt();
    const doc = docOf();
    expect(doc.body_measurements.some((m: { id: string }) => m.id === 'hc-bad')).toBe(false);
    expect(doc.body_measurements).toHaveLength(5); // the seed's own five are all there
    expect(result.skippedRows).toEqual([{ collection: 'body_measurements', id: 'hc-bad', detail: 'weight 2026-06-04' }]);
  });

  it('skips several bad rows of several kinds, each reported once', async () => {
    a.client.exec(`INSERT INTO body_measurement (id, measured_on, kind, value, source) VALUES ('bad-1', '2026-06-04', 'weight', 12.5, 'health_connect'), ('bad-2', '2026-06-05', 'waist', 4000, 'manual')`);
    a.client.exec(`UPDATE food_usage SET use_count = 2000000000`);
    const result = await exportIt();
    expect(result.skippedRows.map((r) => r.collection).sort()).toEqual(['body_measurements', 'body_measurements', 'food_usage', 'food_usage', 'food_usage']);
    const doc = docOf();
    expect(doc.food_usage).toEqual([]);
  });

  it('leaves out a meal with no items (it holds nothing) and says so', async () => {
    a.client.exec(`INSERT INTO meal (id, local_date, eaten_at, slot, source, created_at, updated_at) VALUES ('empty-meal', '2026-06-06', '2026-06-06T10:00:00.000Z', 'snack', 'manual', '2026-06-06T10:00:00.000Z', '2026-06-06T10:00:00.000Z')`);
    const result = await exportIt();
    expect(docOf().meals.some((m: { id: string }) => m.id === 'empty-meal')).toBe(false);
    expect(result.skippedRows).toEqual([{ collection: 'meals', id: 'empty-meal', detail: 'meal 2026-06-06 snack (no items)' }]);
  });

  it('reports nothing when nothing was left out', async () => {
    expect((await exportIt()).skippedRows).toEqual([]);
  });

  it('still stops, naming the field, for a value whose omission would change what the rest means (a meal item)', async () => {
    a.client.exec(`UPDATE meal_item SET grams = 90000 WHERE display_name = 'Bread, estimated'`);
    const before = await fullState(device);
    // The field and the meal (its date and name), never an array position the person cannot act on; the meal comes with its id.
    await expect(exportIt()).rejects.toMatchObject({ code: 'invalid_value', where: 'items.grams of meal 2026-06-02 lunch', meal: { date: '2026-06-02', slot: 'lunch' } });
    expect(device.platform.state.shared).toHaveLength(0);
    expect(await fullState(device)).toEqual(before);
  });
});
