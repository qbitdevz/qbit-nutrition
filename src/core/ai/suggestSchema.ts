// Output contract of the food suggestions (FR-51, docs/09 section 1.1): a short list, validated like every model answer.
// The Zod schema is the single source of truth; the JSON Schema sent to providers is generated from it.
import { z } from 'zod';

import { toProviderSchema, type SchemaDialect } from './schema';

/** The most suggestions the screen shows. The model is asked for no more than this and anything beyond it is cut. */
export const MAX_SUGGESTIONS = 5;

export const Suggestion = z.object({
  /** Food name in the user's language. */
  name: z.string().min(1).max(200),
  /** A suggested amount. */
  grams: z.number().positive().max(1000),
  /** Estimates for that amount (a food database computes the real values once the person picks a food). */
  kcal: z.number().min(0).max(2000),
  protein_g: z.number().min(0).max(300),
  carbs_g: z.number().min(0).max(500),
  fat_g: z.number().min(0).max(300),
  /** One short reason, in the user's language. */
  reason: z.string().min(1).max(500),
});
// A Zod schema and its inferred type share one name by convention.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type Suggestion = z.infer<typeof Suggestion>;

export const SuggestionList = z.object({ suggestions: z.array(Suggestion).max(MAX_SUGGESTIONS) });
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SuggestionList = z.infer<typeof SuggestionList>;

export function suggestionsJsonSchema(dialect: SchemaDialect): Record<string, unknown> {
  return toProviderSchema(SuggestionList, dialect);
}
