import type { Catalog } from '../../core/catalog';
import type { AppDatabase } from '../database';
import { newId as defaultNewId } from '../ids';
import { createBackupRepository, type BackupRepository } from './backup';
import { createAiProviderRepository, type AiProviderRepository } from './aiProviders';
import { createBarcodeProductRepository, type BarcodeProductRepository } from './barcodeProducts';
import { createCustomFoodRepository, type CustomFoodRepository } from './customFoods';
import { createFoodResolver } from './foodResolver';
import { createFoodUsageRepository, type FoodUsageRepository } from './foodUsage';
import { createImportedFoodRepository, type ImportedFoodRepository } from './importedFoods';
import { createGoalRepository, type GoalRepository } from './goals';
import { createMatchMemoryRepository, type MatchMemoryRepository } from './matchMemory';
import { createMealRepository, type MealRepository } from './meals';
import { createMeasurementRepository, type MeasurementRepository } from './measurements';
import { createProfileRepository, type ProfileRepository } from './profile';
import { createScanRepository, type ScanRepository } from './scans';
import { createSettingsRepository, type SettingsRepository } from './settings';

export interface Repositories {
  profile: ProfileRepository;
  goals: GoalRepository;
  meals: MealRepository;
  measurements: MeasurementRepository;
  customFoods: CustomFoodRepository;
  /** The cache of Open Food Facts lookups (docs/08 `barcode_product`). */
  barcodeProducts: BarcodeProductRepository;
  foodUsage: FoodUsageRepository;
  /** Food composition tables the person imported from a file: collections, their foods, and the name search over them. */
  importedFoods: ImportedFoodRepository;
  matchMemory: MatchMemoryRepository;
  settings: SettingsRepository;
  aiProviders: AiProviderRepository;
  scans: ScanRepository;
  /** Export, replace-all (import) and delete-all, each in one transaction. */
  backup: BackupRepository;
}

export interface RepositoryOptions {
  db: AppDatabase;
  /** Source of catalog foods when an item's grams are edited (`createCatalog` from core). */
  catalog: Pick<Catalog, 'getFood'>;
  now?: () => Date;
  /** The clock dates are bounded against (`dayBounds`); default `now`. */
  dayClock?: () => Date;
  newId?: () => string;
}

/**
 * All repositories over one migrated `app.db` handle. Features and screens use these and never
 * run SQL themselves (docs/09 section 1.5).
 */
export function createRepositories(options: RepositoryOptions): Repositories {
  const now = options.now ?? (() => new Date());
  const context = { db: options.db, now, dayClock: options.dayClock ?? now, newId: options.newId ?? defaultNewId };
  return {
    profile: createProfileRepository(context),
    goals: createGoalRepository(context),
    meals: createMealRepository(context, createFoodResolver(context, options.catalog)),
    measurements: createMeasurementRepository(context),
    customFoods: createCustomFoodRepository(context),
    barcodeProducts: createBarcodeProductRepository(context),
    foodUsage: createFoodUsageRepository(context),
    importedFoods: createImportedFoodRepository(context),
    matchMemory: createMatchMemoryRepository(context),
    settings: createSettingsRepository(context),
    aiProviders: createAiProviderRepository(context),
    scans: createScanRepository(context),
    backup: createBackupRepository(context),
  };
}

export type { BackupCounts, BackupRepository, BackupSnapshot } from './backup';
export type { Profile, ProfileInput, ProfileRepository } from './profile';
export { GoalConflictError } from './goals';
export type { Goal, GoalConflictReason, GoalInput, GoalRepository, GoalSetOptions } from './goals';
export type {
  DayLog,
  DayTotals,
  Meal,
  MealItem,
  MealRepository,
  MealWithItems,
  SaveMealInput,
  SaveMealItemInput,
} from './meals';
export type { Measurement, MeasurementInput, MeasurementRepository } from './measurements';
export type { CustomFood, CustomFoodInput, CustomFoodRepository } from './customFoods';
export type { BarcodeProductRecord, BarcodeProductRepository } from './barcodeProducts';
export type { FoodUsageEntry, FoodUsageRepository } from './foodUsage';
export type {
  CollectionBasis,
  DuplicateCandidate,
  ImportCollectionInput,
  ImportedCollection,
  ImportedCollectionWithFoods,
  ImportedFood,
  ImportedFoodHit,
  ImportedFoodRepository,
  NewImportedFood,
} from './importedFoods';
export type { MatchMemoryEntry, MatchMemoryRepository } from './matchMemory';
export type { SettingsRepository } from './settings';
export type { RecordScanInput, Scan, ScanRepository } from './scans';
export { MAX_TIMEOUT_S, MIN_TIMEOUT_S } from './aiProviders';
export type { AiAdapterId, AiOutputMode, AiProvider, AiProviderInput, AiProviderRepository } from './aiProviders';
export type { FoodResolver } from './foodResolver';
export { createMatchMemoryRepository } from './matchMemory';
export { PHOTO_PATH_PATTERN, TEXT_LIMITS, isBlankText, isPlainFileName, plainFileName } from './shared';
export { IMPORT_LIMITS, VALUE_LIMITS, importedPer100gMax, requireImportedPer100g } from './limits';
export { canonicalFood, contentFingerprint, sampleIndexes } from './fingerprint';
