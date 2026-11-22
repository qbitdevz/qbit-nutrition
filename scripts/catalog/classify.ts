import type { FoodState } from '../../src/core/catalog/types';
import type { SourceFood } from './types';

const RAW = /\b(raw|unprepared|uncooked)\b/i;
const COOKED =
  /\b(cooked|boiled|steamed|grilled|broiled|baked|roasted|fried|pan-fried|deep-fried|stewed|braised|sauteed|simmered|poached|toasted|microwaved|scrambled|pan-broiled)\b/i;
const PROCESSED =
  /\b(canned|dried|dehydrated|frozen|pickled|smoked|cured|powder|powdered|instant|concentrate|prepared|ready-to-eat|ready-to-heat|ready-to-drink|bottled|juice|jelly|jam|sauce|sweetened)\b/i;

/** Raw / cooked / processed, read from the USDA description. A cooking word beats "raw" ("Apples, raw, ..., boiled"). */
export function deriveState(description: string): FoodState {
  if (COOKED.test(description)) return 'cooked';
  if (RAW.test(description)) return 'raw';
  if (PROCESSED.test(description)) return 'processed';
  return 'unknown';
}

const BRANDED_CATEGORIES = new Set(['Fast Foods', 'Restaurant Foods']);
const ALLCAPS_ALLOWED = new Set(['USDA', 'USA', 'BBQ', 'NFS', 'RTE', 'UPC', 'DHA', 'ARA', 'MSG']);
/** Brand names SR Legacy writes in ordinary capitalization. */
const BRANDS =
  /\b(Pillsbury|Kraft|Kellogg'?s?|Nabisco|Campbell'?s?|Gerber|Nestle|General Mills|Quaker|Heinz|Hershey'?s?|Archway|Vitasoy|Goya|Gamesa|George Weston|Pepperidge|Oscar Mayer|Hormel)\b/;

/** Branded or restaurant entries, which matching ranks below generic ones. */
export function isBranded(food: Pick<SourceFood, 'description' | 'category'>): boolean {
  if (food.category && BRANDED_CATEGORIES.has(food.category)) return true;
  if (BRANDS.test(food.description)) return true;
  return food.description
    .split(/[^A-Za-z']+/)
    .some((w) => /^[A-Z]{3,}$/.test(w) && !ALLCAPS_ALLOWED.has(w));
}

const DISTRIBUTION_NOTE = /\s*\(Includes foods for USDA's Food Distribution Program\)/g;

/** USDA description without annotations that only add noise to names and search. */
export function cleanDescription(description: string): string {
  return description.replace(DISTRIBUTION_NOTE, '').trim();
}
