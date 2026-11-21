import { computeItemNutrients } from '@/core/nutrition';
import type { SaveMealItemInput } from '@/data';
import { isEdited, type DraftItem } from './draft';

/**
 * The items of a draft as the meal repository stores them. A scanned item keeps what the scan knew:
 * `ai` as detected, `ai_edited` once the person changed its grams or swapped its food, with the
 * model's confidences; an item whose numbers are the model's own is stored as `ai_estimate` and keeps
 * that source in every later view (US-2). Foods added by hand are `manual`.
 */
export function draftToSaveItems(items: readonly DraftItem[]): SaveMealItemInput[] {
  return items.map((item) => {
    if (item.per100g === null) throw new Error(`"${item.displayName}" has no nutrient values; it needs a match first.`);
    const nutrients = computeItemNutrients({ per100g: item.per100g }, item.grams);
    if (!item.scan) {
      return { displayName: item.displayName, grams: item.grams, foodSource: item.ref!.source, foodRef: item.ref!.id, origin: 'manual', nutrients };
    }
    return {
      displayName: item.displayName,
      grams: item.grams,
      foodSource: item.ref ? item.ref.source : 'ai_estimate',
      foodRef: item.ref ? item.ref.id : null,
      origin: isEdited(item) ? 'ai_edited' : 'ai',
      confidenceFood: item.scan.confidenceFood,
      confidencePortion: item.scan.confidencePortion,
      nutrients,
    };
  });
}
