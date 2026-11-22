import type { FetchLike, HttpResponse } from '@/core/ai/types';

/**
 * DEVELOPMENT ONLY (QN_DEV_ONLY_FAKE_OFF). A fake Open Food Facts for the browser preview, so the barcode screens can be
 * looked at without a network: the barcode itself picks the answer. Nothing in the app imports this module except behind
 * `__DEV__`, so release bundles do not contain it.
 */
export const DEV_OFF_MARKER = 'QN_DEV_ONLY_FAKE_OFF';

export const DEV_BARCODES = {
  found: { code: '3017624010701', label: 'Found' },
  foundDrink: { code: '5449000000996', label: 'Found, drink' },
  incomplete: { code: '8076800195057', label: 'Incomplete' },
  implausible: { code: '4006381333931', label: 'Odd values' },
  notFound: { code: '5900000000015', label: 'Not found' },
  offline: { code: '5900000000022', label: 'No network' },
  rateLimited: { code: '5900000000039', label: 'Rate limited' },
  serviceError: { code: '5900000000046', label: 'Service error' },
  hang: { code: '5900000000053', label: 'Never answers' },
} as const;

function reply(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, text: async () => text };
}

const found = (code: string, product: Record<string, unknown>) => reply(200, { code, product: { code, ...product }, status: 1, status_verbose: 'product found' });

export const devBarcodeFetch: FetchLike = async (url, init) => {
  const code = /\/product\/(\d+)\?/.exec(url)?.[1] ?? '';
  switch (code) {
    case DEV_BARCODES.found.code:
      return found(code, {
        product_name: 'Nutella',
        brands: 'Ferrero',
        serving_quantity: 15,
        nutrition_data_per: '100g',
        nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sugars_100g: 56.3, 'saturated-fat_100g': 10.6, sodium_100g: 0.043 },
      });
    case DEV_BARCODES.foundDrink.code:
      return found(code, {
        product_name: 'Cola',
        product_name_es: 'Refresco de cola',
        brands: 'Fizz Co',
        nutriments: { 'energy-kj_100g': 180, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 },
      });
    case DEV_BARCODES.incomplete.code:
      return found(code, { product_name: 'Spaghetti No. 5', product_name_es: 'Espaguetis n.º 5', brands: 'Pasta Co', serving_quantity: 80, nutriments: { proteins_100g: 13, carbohydrates_100g: 71.2, sugars_100g: 3.5 } });
    case DEV_BARCODES.implausible.code:
      return found(code, { product_name: 'Mystery crackers', nutriments: { 'energy-kcal_100g': 900, proteins_100g: 5, carbohydrates_100g: 5, fat_100g: 5 } });
    case DEV_BARCODES.offline.code:
      throw new Error('Network request failed');
    case DEV_BARCODES.rateLimited.code:
      return reply(429, 'Too Many Requests', { 'retry-after': '30' });
    case DEV_BARCODES.serviceError.code:
      return reply(503, 'Service Unavailable');
    case DEV_BARCODES.hang.code:
      return new Promise<HttpResponse>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    default:
      return reply(404, { code, status: 0, status_verbose: 'product not found' });
  }
};
