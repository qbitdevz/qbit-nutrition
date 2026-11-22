/// <reference types="node" />
/**
 * Test-only: fills every table of a harness database with a small but complete history, so the backup
 * tests can check that nothing is left out. Never import this from app code.
 */
import type { Harness } from '@/data/testing/harness';

export const DISTINCTIVE_KEY = 'sk-test-Zx9+/Q=q7!AbC_distinct_key_0123456789';

export interface Seeded {
  /** Ids of the two AI provider profiles (one active, one not). */
  providerIds: string[];
  customFoodIds: string[];
  /** The meal that has a kept photo, and that photo's relative path. */
  photoMealId: string;
  photoPath: string;
}

/** Every table gets at least one row. Meals are on three local days in June 2026. */
export async function seedEverything(h: Harness, options: { photoPath?: string } = {}): Promise<Seeded> {
  const { repos } = h;
  const photoPath = options.photoPath ?? 'photos/old-1.jpg';

  await repos.profile.save({
    sex: 'female',
    birthDate: '1990-05-14',
    heightCm: 168.5,
    activityLevel: 'moderate',
    unitSystem: 'imperial',
    locale: 'es',
    disclaimerAcceptedAt: '2026-01-02T10:00:00.000Z',
    disclaimerVersion: '2026-01-01',
  });
  await repos.goals.set({ type: 'maintain', startDate: '2026-01-01', kcalTarget: 2000, proteinGTarget: 100, carbsGTarget: 250, fatGTarget: 67, isCustom: false, basisWeightKg: 70, formulaVersion: 'f1' });
  await repos.goals.set({ type: 'lose_fat', pace: 'gentle', startDate: '2026-06-02', kcalTarget: 1800, proteinGTarget: 120, carbsGTarget: 200, fatGTarget: 60, isCustom: true });

  await repos.measurements.record({ measuredOn: '2026-06-01', kind: 'weight', value: 70.4 });
  await repos.measurements.record({ measuredOn: '2026-06-02', kind: 'weight', value: 70.1 });
  await repos.measurements.record({ measuredOn: '2026-06-02', kind: 'weight', value: 70.3, source: 'health_connect' });
  await repos.measurements.record({ measuredOn: '2026-06-02', kind: 'waist', value: 78 });
  await repos.measurements.record({ measuredOn: '2026-06-03', kind: 'body_fat_pct', value: 24.5 });

  const oats = await repos.customFoods.create({ name: 'House oats', kcal100g: 380, protein100g: 13, carbs100g: 66, fat100g: 7, otherNutrients: { fiber: 10, sodium: 5 }, defaultPortionG: 40 });
  const soup = await repos.customFoods.create({ name: 'Grandma soup', kcal100g: 60, protein100g: 3, carbs100g: 8, fat100g: 2 });

  const meal1 = await repos.meals.save({
    eatenAt: new Date('2026-06-01T08:00:00.000Z'),
    timeZone: 'UTC',
    slot: 'breakfast',
    source: 'manual',
    name: 'Oats',
    note: 'with berries',
    items: [{ displayName: 'House oats', grams: 50, foodSource: 'custom', foodRef: oats.id, origin: 'manual', nutrients: { kcal: 190, protein: 6.5, carbs: 33, fat: 3.5, fiber: 5, sodium: 2.5 } }],
  });
  void meal1;
  const scanRow = await repos.scans.record({ providerId: null, providerLabel: 'Test', model: 'm', promptVersion: 1, status: 'ok', resultJson: '{"items":[]}' });
  const photoMeal = await repos.meals.save({
    eatenAt: new Date('2026-06-02T12:30:00.000Z'),
    timeZone: 'UTC',
    slot: 'lunch',
    source: 'scan',
    scanId: scanRow.id,
    photoPath,
    items: [
      { displayName: 'Grandma soup', grams: 300, foodSource: 'custom', foodRef: soup.id, origin: 'ai_edited', confidenceFood: 'high', confidencePortion: 'low', nutrients: { kcal: 180, protein: 9, carbs: 24, fat: 6, sodium: 700 } },
      { displayName: 'Bread, estimated', grams: 60, foodSource: 'ai_estimate', foodRef: null, origin: 'ai', nutrients: { kcal: 150, protein: 5, carbs: 28, fat: 2 } },
    ],
  });
  await repos.meals.save({
    eatenAt: new Date('2026-06-03T19:00:00.000Z'),
    timeZone: 'UTC',
    slot: 'dinner',
    source: 'copy',
    items: [{ displayName: 'House oats', grams: 80, foodSource: 'custom', foodRef: oats.id, origin: 'manual', nutrients: { kcal: 304, protein: 10.4, carbs: 52.8, fat: 5.6, fiber: 8 } }],
  });

  await repos.foodUsage.setFavorite({ source: 'custom', id: soup.id }, true);
  await repos.matchMemory.remember('soup', { source: 'custom', id: soup.id });
  await repos.matchMemory.remember('soup', { source: 'custom', id: soup.id });

  const p1 = await repos.aiProviders.create({ label: 'Main', preset: 'openai', adapter: 'openai_compatible', baseUrl: 'https://api.example.com/v1', model: 'gpt-x', timeoutS: 60, outputMode: 'schema' });
  const p2 = await repos.aiProviders.create({ label: 'Local', preset: null, adapter: 'gemini', baseUrl: 'http://192.168.1.5:11434/v1', model: 'local-1', timeoutS: 90 });
  await repos.aiProviders.recordTest(p1.id, { result: 'ok', outputMode: 'schema' });

  await repos.settings.set('locale', 'es');
  await repos.settings.set('keep_photos', 'true');
  await repos.settings.set('minimum_daily_kcal', '1400');
  await repos.settings.set('scan_tip_count', '2');
  await repos.settings.set('onboarding_completed_at', '2026-01-02T10:05:00.000Z');
  await repos.settings.set('catalog_asset_hash', 'abc123');
  await repos.settings.set(`ai_notice_ack.${p1.id}`, '2026-06-01T09:00:00.000Z');

  return { providerIds: [p1.id, p2.id], customFoodIds: [oats.id, soup.id], photoMealId: photoMeal.id, photoPath };
}
