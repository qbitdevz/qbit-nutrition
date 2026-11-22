import { Platform } from 'react-native';

import { createExpoHealthPlatform, toNutritionRecord } from '../expoHealthPlatform';
import type { HealthNutritionRecord } from '../healthPlatform';

// The native module is replaced by recorders: what is checked is what this app sends to the library, in the library's own shapes.
const mockLib = {
  initialize: jest.fn(async () => true),
  getSdkStatus: jest.fn(async () => 3),
  getGrantedPermissions: jest.fn(async (): Promise<{ accessType: string; recordType: string }[]> => []),
  requestPermission: jest.fn(async () => []),
  insertRecords: jest.fn(async () => ['id']),
  deleteRecordsByUuids: jest.fn(async () => undefined),
  deleteRecordsByTimeRange: jest.fn(async () => undefined),
  readRecords: jest.fn(),
  openHealthConnectSettings: jest.fn(),
};
jest.mock('react-native-health-connect', () => ({
  ...mockLib,
  initialize: (...args: unknown[]) => (mockLib.initialize as jest.Mock)(...args),
  getSdkStatus: (...args: unknown[]) => (mockLib.getSdkStatus as jest.Mock)(...args),
  getGrantedPermissions: (...args: unknown[]) => (mockLib.getGrantedPermissions as jest.Mock)(...args),
  requestPermission: (...args: unknown[]) => (mockLib.requestPermission as jest.Mock)(...args),
  insertRecords: (...args: unknown[]) => (mockLib.insertRecords as jest.Mock)(...args),
  deleteRecordsByUuids: (...args: unknown[]) => (mockLib.deleteRecordsByUuids as jest.Mock)(...args),
  deleteRecordsByTimeRange: (...args: unknown[]) => (mockLib.deleteRecordsByTimeRange as jest.Mock)(...args),
  readRecords: (...args: unknown[]) => (mockLib.readRecords as jest.Mock)(...args),
  openHealthConnectSettings: (...args: unknown[]) => (mockLib.openHealthConnectSettings as jest.Mock)(...args),
  SdkAvailabilityStatus: { SDK_UNAVAILABLE: 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2, SDK_AVAILABLE: 3 },
  MealType: { BREAKFAST: 1, DINNER: 3, LUNCH: 2, SNACK: 4, UNKNOWN: 0 },
  RecordingMethod: { RECORDING_METHOD_MANUAL_ENTRY: 3 },
}));

const RECORD: HealthNutritionRecord = {
  clientRecordId: 'meal-1',
  clientRecordVersion: 1_781_000_000_000,
  startTime: '2026-06-15T18:29:00.000Z',
  endTime: '2026-06-15T18:30:00.000Z',
  mealType: 'dinner',
  name: 'Rice, Chicken',
  energyKcal: 432,
  grams: { protein: 41.9, totalCarbohydrate: 51, sodium: 0.081 },
};

let version: jest.SpyInstance<number | string>;
beforeEach(() => {
  jest.clearAllMocks();
  version = jest.spyOn(Platform, 'Version', 'get');
  jest.replaceProperty(Platform, 'OS', 'android');
  version.mockReturnValue(35);
  mockLib.getSdkStatus.mockResolvedValue(3);
  mockLib.getGrantedPermissions.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('the record sent to Health Connect', () => {
  it('uses the meal id as the client record id, kilocalories and grams, a meal type, and manual entry', () => {
    expect(toNutritionRecord(RECORD)).toEqual({
      recordType: 'Nutrition',
      startTime: '2026-06-15T18:29:00.000Z',
      endTime: '2026-06-15T18:30:00.000Z',
      mealType: 3,
      name: 'Rice, Chicken',
      energy: { value: 432, unit: 'kilocalories' },
      protein: { value: 41.9, unit: 'grams' },
      totalCarbohydrate: { value: 51, unit: 'grams' },
      sodium: { value: 0.081, unit: 'grams' },
      metadata: { clientRecordId: 'meal-1', clientRecordVersion: 1_781_000_000_000, recordingMethod: 3, device: { type: 2 } },
    });
  });

  it('maps every meal type and leaves the name out when there is none', () => {
    const types = (['breakfast', 'lunch', 'dinner', 'snack'] as const).map((mealType) => toNutritionRecord({ ...RECORD, mealType, name: undefined }).mealType);
    expect(types).toEqual([1, 2, 3, 4]);
    expect(toNutritionRecord({ ...RECORD, name: undefined })).not.toHaveProperty('name');
  });
});

describe('the device implementation', () => {
  it('starts the client once and inserts the record', async () => {
    const platform = createExpoHealthPlatform();
    await platform.writeNutrition(RECORD);
    await platform.writeNutrition(RECORD);
    expect(mockLib.initialize).toHaveBeenCalledTimes(1);
    expect(mockLib.insertRecords).toHaveBeenCalledTimes(2);
    expect(mockLib.insertRecords).toHaveBeenCalledWith([toNutritionRecord(RECORD)]);
  });

  it('deletes by client record id, and by time range for "everything this app wrote"', async () => {
    const platform = createExpoHealthPlatform();
    await platform.deleteNutrition(['a', 'b']);
    expect(mockLib.deleteRecordsByUuids).toHaveBeenCalledWith('Nutrition', [], ['a', 'b']);
    await platform.deleteNutrition([]);
    expect(mockLib.deleteRecordsByUuids).toHaveBeenCalledTimes(1);
    await platform.deleteAllNutritionWritten();
    // Every record this app wrote: from the start of time, with no end (a record dated in the future is included).
    expect(mockLib.deleteRecordsByTimeRange).toHaveBeenCalledWith('Nutrition', { operator: 'after', startTime: '2000-01-01T00:00:00.000Z' });
  });

  it('maps the two grants separately, and asks only for what was requested', async () => {
    const platform = createExpoHealthPlatform();
    mockLib.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'Weight' }]);
    expect(await platform.grantedPermissions()).toEqual({ writeNutrition: false, readWeight: true });
    mockLib.getGrantedPermissions.mockResolvedValue([{ accessType: 'write', recordType: 'Nutrition' }]);
    expect(await platform.grantedPermissions()).toEqual({ writeNutrition: true, readWeight: false });
    // A read grant on nutrition is not the write grant.
    mockLib.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'Nutrition' }]);
    expect(await platform.grantedPermissions()).toEqual({ writeNutrition: false, readWeight: false });

    await platform.requestPermissions(['readWeight']);
    expect(mockLib.requestPermission).toHaveBeenCalledWith([{ accessType: 'read', recordType: 'Weight' }]);
    await platform.requestPermissions(['writeNutrition', 'readWeight']);
    expect(mockLib.requestPermission).toHaveBeenLastCalledWith([
      { accessType: 'write', recordType: 'Nutrition' },
      { accessType: 'read', recordType: 'Weight' },
    ]);
  });

  it('reads weights across pages, in kilograms', async () => {
    const platform = createExpoHealthPlatform();
    mockLib.readRecords
      .mockResolvedValueOnce({ records: [{ time: '2026-06-14T09:00:00.000Z', weight: { inKilograms: 71.4 } }], pageToken: 'next' })
      .mockResolvedValueOnce({ records: [{ time: '2026-06-13T09:00:00.000Z', weight: { inKilograms: 71.9 } }] });
    const out = await platform.readWeights({ from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-06-15T00:00:00Z') });
    expect(out).toEqual([
      { time: '2026-06-14T09:00:00.000Z', kg: 71.4 },
      { time: '2026-06-13T09:00:00.000Z', kg: 71.9 },
    ]);
    expect(mockLib.readRecords).toHaveBeenCalledTimes(2);
    expect(mockLib.readRecords.mock.calls[0]![0]).toBe('Weight');
  });

  it('reports the availability states', async () => {
    const platform = createExpoHealthPlatform();
    mockLib.getSdkStatus.mockResolvedValue(3);
    expect(await platform.availability()).toBe('available');

    // Android 14 and later: Health Connect is part of the system, so there is nothing to install.
    mockLib.getSdkStatus.mockResolvedValue(1);
    expect(await platform.availability()).toBe('unavailable');

    // Android 13 and lower: the store app is missing, or too old.
    version.mockReturnValue(33);
    expect(await platform.availability()).toBe('not_installed');
    mockLib.getSdkStatus.mockResolvedValue(2);
    expect(await platform.availability()).toBe('needs_update');

    // Android 8 cannot run the Health Connect app at all (it needs Android 9).
    version.mockReturnValue(26);
    mockLib.getSdkStatus.mockResolvedValue(1);
    expect(await platform.availability()).toBe('unavailable');
  });

  it('is unavailable off Android, without touching the native module', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const platform = createExpoHealthPlatform();
    expect(await platform.availability()).toBe('unavailable');
    expect(mockLib.getSdkStatus).not.toHaveBeenCalled();
  });

  it('fails when the client cannot start, instead of pretending to write', async () => {
    mockLib.initialize.mockResolvedValueOnce(false);
    await expect(createExpoHealthPlatform().writeNutrition(RECORD)).rejects.toThrow(/could not be started/);
    expect(mockLib.insertRecords).not.toHaveBeenCalled();
  });
});
