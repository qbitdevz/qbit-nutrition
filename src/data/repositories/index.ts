import type { Catalog } from '../../core/catalog';
import type { AppDatabase } from '../database';
import { newId as defaultNewId } from '../ids';
import { createAiProviderRepository, type AiProviderRepository } from './aiProviders';
import { createCustomFoodRepository, type CustomFoodRepository } from './customFoods';
import { createFoodResolver } from './foodResolver';
import { createFoodUsageRepository, type FoodUsageRepository } from './foodUsage';
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
  foodUsage: FoodUsageRepository;
  matchMemory: MatchMemoryRepository;
  settings: SettingsRepository;
  aiProviders: AiProviderRepository;
  scans: ScanRepository;
}

export interface RepositoryOptions {
  db: AppDatabase;
  /** Source of catalog foods when an item's grams are edited (`createCatalog` from core). */
  catalog: Pick<Catalog, 'getFood'>;
  now?: () => Date;
  newId?: () => string;
}

/**
 * All repositories over one migrated `app.db` handle. Features and screens use these and never
 * run SQL themselves (docs/09 section 1.5).
 */
export function createRepositories(options: RepositoryOptions): Repositories {
  const context = { db: options.db, now: options.now ?? (() => new Date()), newId: options.newId ?? defaultNewId };
  return {
    profile: createProfileRepository(context),
    goals: createGoalRepository(context),
    meals: createMealRepository(context, createFoodResolver(context, options.catalog)),
    measurements: createMeasurementRepository(context),
    customFoods: createCustomFoodRepository(context),
    foodUsage: createFoodUsageRepository(context),
    matchMemory: createMatchMemoryRepository(context),
    settings: createSettingsRepository(context),
    aiProviders: createAiProviderRepository(context),
    scans: createScanRepository(context),
  };
}

export type { Profile, ProfileInput, ProfileRepository } from './profile';
export type { Goal, GoalInput, GoalRepository } from './goals';
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
export type { FoodUsageEntry, FoodUsageRepository } from './foodUsage';
export type { MatchMemoryEntry, MatchMemoryRepository } from './matchMemory';
export type { SettingsRepository } from './settings';
export type { RecordScanInput, Scan, ScanRepository } from './scans';
export { MAX_TIMEOUT_S, MIN_TIMEOUT_S } from './aiProviders';
export type { AiAdapterId, AiOutputMode, AiProvider, AiProviderInput, AiProviderRepository } from './aiProviders';
export type { FoodResolver } from './foodResolver';
export { createMatchMemoryRepository } from './matchMemory';
