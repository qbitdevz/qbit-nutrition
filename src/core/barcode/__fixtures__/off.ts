// Open Food Facts answers, shaped like the live API (checked 2026-11-21 against world.openfoodfacts.org):
// found = 200 {code, product, status: 1, status_verbose: "product found"};
// not found = 404 {code, status: 0, status_verbose: "product not found"}.
// The values below are invented for tests; the nutriments keys are the ones the service uses.
import { res } from '@/core/ai/__fixtures__/fixtures';

export const NUTELLA_CODE = '3017624010701';

export const nutellaNutriments = {
  carbohydrates_100g: 57.5,
  'energy-kcal_100g': 539,
  'energy-kj_100g': 2228,
  energy_100g: 2228,
  energy_unit: 'kJ',
  fat_100g: 30.9,
  proteins_100g: 6.3,
  salt_100g: 0.1075,
  'saturated-fat_100g': 10.6,
  sodium_100g: 0.043,
  sugars_100g: 56.3,
};

export const foundProduct = (product: Record<string, unknown>, code = NUTELLA_CODE) =>
  res(200, { code, product: { code, ...product }, status: 1, status_verbose: 'product found' });

export const nutellaResponse = () =>
  foundProduct({ product_name: 'Nutella', product_name_en: 'Nutella', brands: 'Ferrero', nutrition_data_per: '100g', nutriments: nutellaNutriments });

export const notFoundResponse = (code = NUTELLA_CODE) => res(404, { code, status: 0, status_verbose: 'product not found' });
