// The part of an Open Food Facts product answer the app reads. Checked against the live API on 2026-11-21:
//   GET https://world.openfoodfacts.org/api/v2/product/{barcode}?fields=...
//   found     -> 200 { code, product: {...fields asked for}, status: 1, status_verbose: "product found" }
//   not found -> 404 { code, status: 0, status_verbose: "product not found" }
// The data is crowd-sourced: a field of the wrong type is dropped (`.catch(undefined)`), never trusted and never fatal.
import { z } from 'zod';

const text = z.string().optional().catch(undefined);
const loose = z.union([z.number(), z.string()]).optional().catch(undefined);

export const OffProductSchema = z.object({
  code: text,
  product_name: text,
  product_name_en: text,
  product_name_es: text,
  brands: text,
  serving_size: text,
  serving_quantity: loose,
  serving_quantity_unit: text,
  nutrition_data_per: text,
  /** Keys such as `energy-kcal_100g`; values are numbers or numbers as text. Read by `mapProduct`, which checks every one. */
  nutriments: z.record(z.string(), z.unknown()).catch({}).default({}),
});
export type OffProduct = z.infer<typeof OffProductSchema>;

export const OffResponseSchema = z.object({
  status: z.union([z.number(), z.string()]).optional(),
  status_verbose: z.string().optional().catch(undefined),
  product: OffProductSchema.optional(),
});
export type OffResponse = z.infer<typeof OffResponseSchema>;
