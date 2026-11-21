// Output contract: docs/07-ai-pipeline.md section 4. The Zod schema is the
// single source of truth; the JSON Schema sent to providers is generated from it.
import { z } from 'zod';

const Confidence = z.enum(['low', 'medium', 'high']);

export const DetectedItem = z.object({
  name: z.string(), // display name in the user's locale
  canonical_name_en: z.string(), // generic English name, e.g. "white rice, cooked"
  search_terms_en: z.array(z.string()).max(4),
  preparation: z.enum([
    'raw',
    'boiled',
    'steamed',
    'grilled',
    'baked',
    'fried',
    'sauteed',
    'stewed',
    'processed',
    'unknown',
  ]),
  grams: z.number().positive().max(2000),
  portion_basis: z.string(), // short reasoning: "about one cup, compared with the fork"
  confidence_food: Confidence,
  confidence_portion: Confidence,
  fallback_per_100g: z.object({
    // used only when no catalog match exists
    kcal: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
  }),
});
// A Zod schema and its inferred type share one name by convention.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type DetectedItem = z.infer<typeof DetectedItem>;

export const ScanResult = z.object({
  is_food: z.boolean(),
  dish_name: z.string(), // e.g. "Chicken with rice and salad"
  items: z.array(DetectedItem).max(20),
  hidden_ingredients_note: z.string(), // e.g. "likely cooked with oil"
});
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ScanResult = z.infer<typeof ScanResult>;

type JsonObject = Record<string, unknown>;

/** The JSON Schema generated from `ScanResult` (Zod's own generator, no `$schema` key). */
export function scanResultJsonSchema(): JsonObject {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(ScanResult) as JsonObject;
  return schema;
}

/**
 * Providers accept different subsets of JSON Schema. Bounds the provider
 * ignores or rejects are removed from what it receives; `ScanResult` still
 * enforces them on the device, and a violation takes the repair path.
 */
export type SchemaDialect = 'openai' | 'anthropic' | 'gemini';

const STRIP: Record<SchemaDialect, ReadonlySet<string>> = {
  openai: new Set(),
  // https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations
  anthropic: new Set([
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minLength',
    'maxLength',
    'maxItems',
    'minItems',
    'minProperties',
    'maxProperties',
    'uniqueItems',
  ]),
  gemini: new Set(['exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']),
};

function strip(node: unknown, drop: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) return node.map((n) => strip(n, drop));
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as JsonObject)
        .filter(([key]) => !drop.has(key))
        .map(([key, value]) => [key, key === 'properties' ? stripProps(value, drop) : strip(value, drop)]),
    );
  }
  return node;
}

// `properties` maps field names to schemas; a field called "minimum" must survive.
function stripProps(props: unknown, drop: ReadonlySet<string>): unknown {
  return Object.fromEntries(Object.entries(props as JsonObject).map(([k, v]) => [k, strip(v, drop)]));
}

export function providerJsonSchema(dialect: SchemaDialect): JsonObject {
  return strip(scanResultJsonSchema(), STRIP[dialect]) as JsonObject;
}
