/**
 * What the Health Connect integration needs from the device (docs/09 section 2.7), as plain interfaces. The app wires the real
 * module in `expoHealthPlatform.ts`; tests and the development preview use `fakeHealthPlatform.ts`. Importing this file
 * pulls in no native module.
 */

/**
 * - `not_installed`: Android 13 or lower without the Health Connect app.
 * - `needs_update`: Health Connect is there but too old for this app's library.
 * - `unavailable`: this device cannot run it at all (Android 8, no Play services, a work profile, a non-Android platform).
 * - `available`: ready to use.
 */
export type HealthAvailability = 'not_installed' | 'needs_update' | 'unavailable' | 'available';

/** The two grants the integration asks for. They are separate: either can be missing while the other works. */
export interface HealthGrants {
  /** `android.permission.health.WRITE_NUTRITION`: saved meals become nutrition records. */
  writeNutrition: boolean;
  /** `android.permission.health.READ_WEIGHT`: weight records are read into the weight log. */
  readWeight: boolean;
}

export type HealthGrant = keyof HealthGrants;

export type HealthMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** The nutrient fields of a Health Connect nutrition record that the tracked nutrients map onto. All values are grams. */
export const HEALTH_NUTRIENT_FIELDS = [
  'protein',
  'totalCarbohydrate',
  'totalFat',
  'dietaryFiber',
  'sugar',
  'saturatedFat',
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'magnesium',
  'zinc',
  'vitaminA',
  'vitaminC',
  'vitaminD',
  'vitaminB12',
  'folate',
] as const;

export type HealthNutrientField = (typeof HEALTH_NUTRIENT_FIELDS)[number];

/** One meal as a Health Connect nutrition record, in plain units: energy in kcal, every nutrient in grams. */
export interface HealthNutritionRecord {
  /** The meal id: writing it again replaces the record, deleting it removes the record. */
  clientRecordId: string;
  /**
   * Health Connect applies a write to an existing client record id only when this is higher than the stored one, so it goes up
   * with every edit (the meal's last-modified time in milliseconds).
   */
  clientRecordVersion: number;
  /** ISO 8601 instants; the record ends when the meal was eaten and starts a minute before, as Google's own example does. */
  startTime: string;
  endTime: string;
  mealType: HealthMealType;
  name?: string;
  energyKcal: number;
  grams: Partial<Record<HealthNutrientField, number>>;
}

/** A weight read from Health Connect. */
export interface HealthWeightReading {
  /** ISO 8601 instant. */
  time: string;
  kg: number;
}

export interface HealthPlatform {
  availability(): Promise<HealthAvailability>;
  /** The grants this app holds right now. Rejects when Health Connect cannot be reached. */
  grantedPermissions(): Promise<HealthGrants>;
  /** Shows the system permission screen for the given grants and returns what is granted afterwards. */
  requestPermissions(wanted: readonly HealthGrant[]): Promise<HealthGrants>;
  /** Inserts or replaces the record with this client record id. Rejects on failure. */
  writeNutrition(record: HealthNutritionRecord): Promise<void>;
  /** Deletes this app's records with these client record ids. Ids that do not exist are not an error. */
  deleteNutrition(clientRecordIds: readonly string[]): Promise<void>;
  /** Deletes every nutrition record this app wrote (Health Connect only lets an app delete its own). */
  deleteAllNutritionWritten(): Promise<void>;
  /** Weights between two instants, all pages. */
  readWeights(range: { from: Date; to: Date }): Promise<HealthWeightReading[]>;
  /** Opens the system Health Connect screen where the person manages this app's access. */
  openSettings(): void;
  /** Opens the store page to install or update Health Connect. */
  openInstall(): void;
}
