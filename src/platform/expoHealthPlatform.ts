import {
  deleteRecordsByTimeRange,
  deleteRecordsByUuids,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  MealType,
  openHealthConnectSettings,
  readRecords,
  RecordingMethod,
  SdkAvailabilityStatus,
  requestPermission,
  type NutritionRecord,
  type Permission,
} from 'react-native-health-connect';
import { Linking, Platform } from 'react-native';

import type {
  HealthAvailability,
  HealthGrant,
  HealthGrants,
  HealthMealType,
  HealthNutritionRecord,
  HealthPlatform,
  HealthWeightReading,
} from './healthPlatform';

/** The device implementation of `HealthPlatform`: `react-native-health-connect` (MIT), Android only. */

const PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';
const DEVICE_TYPE_PHONE = 2;

const PERMISSIONS: Record<HealthGrant, Permission> = {
  writeNutrition: { accessType: 'write', recordType: 'Nutrition' },
  readWeight: { accessType: 'read', recordType: 'Weight' },
};

const MEAL_TYPES: Record<HealthMealType, number> = {
  breakfast: MealType.BREAKFAST,
  lunch: MealType.LUNCH,
  dinner: MealType.DINNER,
  snack: MealType.SNACK,
};

/** A page is at most this many records; the loop below reads every page. */
const PAGE_SIZE = 500;
/** Far enough back for "every record this app wrote"; the delete has no end, so a record dated in the future is included too. */
const EPOCH = '2000-01-01T00:00:00.000Z';

/** The Health Connect record for a meal: energy in kilocalories, every other value in grams, entered by the person. */
export function toNutritionRecord(record: HealthNutritionRecord): NutritionRecord {
  const out: NutritionRecord = {
    recordType: 'Nutrition',
    startTime: record.startTime,
    endTime: record.endTime,
    mealType: MEAL_TYPES[record.mealType],
    energy: { value: record.energyKcal, unit: 'kilocalories' },
    metadata: {
      clientRecordId: record.clientRecordId,
      clientRecordVersion: record.clientRecordVersion,
      recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
      device: { type: DEVICE_TYPE_PHONE },
    },
  };
  if (record.name) out.name = record.name;
  for (const [field, grams] of Object.entries(record.grams)) {
    if (grams !== undefined) (out as unknown as Record<string, unknown>)[field] = { value: grams, unit: 'grams' };
  }
  return out;
}

export function createExpoHealthPlatform(): HealthPlatform {
  let initialized = false;
  const ready = async () => {
    if (!initialized) initialized = await initialize(PROVIDER_PACKAGE);
    if (!initialized) throw new Error('Health Connect could not be started.');
  };

  const grants = async (): Promise<HealthGrants> => {
    await ready();
    const granted = await getGrantedPermissions();
    const has = (want: Permission) => granted.some((g) => g.accessType === want.accessType && g.recordType === want.recordType);
    return { writeNutrition: has(PERMISSIONS.writeNutrition), readWeight: has(PERMISSIONS.readWeight) };
  };

  return {
    async availability(): Promise<HealthAvailability> {
      if (Platform.OS !== 'android') return 'unavailable';
      const status = await getSdkStatus(PROVIDER_PACKAGE);
      if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
      if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
        // Android 14 and later carry Health Connect in the system: "update" then means a system update, not the store.
        return Number(Platform.Version) >= 34 ? 'unavailable' : 'needs_update';
      }
      // Android 13 and lower can install it from the store; anything newer that reports "unavailable" cannot.
      return Number(Platform.Version) >= 34 || Number(Platform.Version) < 28 ? 'unavailable' : 'not_installed';
    },
    grantedPermissions: grants,
    async requestPermissions(wanted) {
      await ready();
      await requestPermission(wanted.map((w) => PERMISSIONS[w]));
      return grants();
    },
    async writeNutrition(record) {
      await ready();
      await insertRecords([toNutritionRecord(record)]);
    },
    async deleteNutrition(ids) {
      if (ids.length === 0) return;
      await ready();
      await deleteRecordsByUuids('Nutrition', [], [...ids]);
    },
    async deleteAllNutritionWritten() {
      await ready();
      await deleteRecordsByTimeRange('Nutrition', { operator: 'after', startTime: EPOCH });
    },
    async readWeights({ from, to }) {
      await ready();
      const out: HealthWeightReading[] = [];
      let pageToken: string | undefined;
      do {
        const page = await readRecords('Weight', {
          timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() },
          pageSize: PAGE_SIZE,
          pageToken,
        });
        for (const record of page.records) out.push({ time: record.time, kg: record.weight.inKilograms });
        pageToken = page.pageToken || undefined;
      } while (pageToken);
      return out;
    },
    openSettings() {
      openHealthConnectSettings();
    },
    openInstall() {
      void Linking.openURL(`market://details?id=${PROVIDER_PACKAGE}`).catch(() =>
        Linking.openURL(`https://play.google.com/store/apps/details?id=${PROVIDER_PACKAGE}`).catch(() => undefined),
      );
    },
  };
}
