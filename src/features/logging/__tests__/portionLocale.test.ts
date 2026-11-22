import type { FoodDetail, FoodRef } from '@/core/catalog';
import type { AppServices } from '../../startup/types';
import { loadFoodView } from '../foods';

/** The portion sheet shows household measures in the app language, with English as the fallback (catalog food_portion.locale). */
const ref: FoodRef = { source: 'catalog', id: '1' };
const detail = (portions: FoodDetail['portions']): FoodDetail =>
  ({ ref, name: 'Rice, cooked', names: [{ locale: 'en', name: 'Rice, cooked', isAlias: false }], per100g: { kcal: 130 }, portions }) as unknown as FoodDetail;
const servicesWith = (d: FoodDetail) => ({ catalog: { getFood: async () => d } }) as unknown as AppServices;

describe('portion labels by locale', () => {
  const both = detail([
    { locale: 'en', label: '1 cup', grams: 158 },
    { locale: 'es', label: '1 taza', grams: 158 },
  ]);

  it('uses the Spanish labels in Spanish and the English ones in English', async () => {
    expect((await loadFoodView(servicesWith(both), ref, 'es'))?.portions).toEqual([{ label: '1 taza', grams: 158 }]);
    expect((await loadFoodView(servicesWith(both), ref, 'en'))?.portions).toEqual([{ label: '1 cup', grams: 158 }]);
  });

  it('falls back to English when a food has no Spanish labels', async () => {
    const onlyEnglish = detail([{ locale: 'en', label: '1 cup', grams: 158 }]);
    expect((await loadFoodView(servicesWith(onlyEnglish), ref, 'es'))?.portions).toEqual([{ label: '1 cup', grams: 158 }]);
  });
});
