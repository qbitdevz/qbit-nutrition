import type { Repositories } from '@/data';
import type { HealthSync } from './healthSync';

/**
 * The repositories with the meal writes watched: after a meal is saved, edited, or deleted, its Health Connect record is queued
 * (S7). The meal change has already been committed when the queue is told, the queue's work is not awaited, and its failures
 * stay inside it: saving a meal is never slowed down, blocked, or failed by Health Connect. Every screen gets these repositories,
 * so no save path can forget to tell the integration.
 */
export function withHealthSync(repos: Repositories, health: Pick<HealthSync, 'mealChanged' | 'mealDeleted'>): Repositories {
  const { meals } = repos;
  const changed = (id: string) => void health.mealChanged(id).catch(() => undefined);
  return {
    ...repos,
    meals: {
      ...meals,
      async save(input) {
        const saved = await meals.save(input);
        changed(saved.id);
        return saved;
      },
      async updateMeal(id, patch) {
        const updated = await meals.updateMeal(id, patch);
        changed(id);
        return updated;
      },
      async updateItemGrams(itemId, grams) {
        const item = await meals.updateItemGrams(itemId, grams);
        changed(item.mealId);
        return item;
      },
      async deleteItem(itemId) {
        const mealId = await meals.deleteItem(itemId);
        changed(mealId);
        return mealId;
      },
      async restoreItem(item) {
        const restored = await meals.restoreItem(item);
        changed(restored.mealId);
        return restored;
      },
      async restoreMeal(saved) {
        const restored = await meals.restoreMeal(saved);
        changed(restored.id);
        return restored;
      },
      async deleteMeal(mealId) {
        await meals.deleteMeal(mealId);
        void health.mealDeleted(mealId).catch(() => undefined);
      },
    },
  };
}
