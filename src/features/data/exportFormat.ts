/**
 * The export format (docs/08 section 9, FR-70, FR-71) and its ONE definition: this Zod schema decides what an
 * export contains, what an import accepts, and what the preview counts. The exporter builds a document and
 * parses it with this schema before writing a byte; the importer parses the whole file with it before touching
 * the database.
 *
 * What the file holds: everything the person created (profile, goals, weights and body measurements, meals with
 * their items and nutrient snapshots, custom foods, recents and favorites, learned matches, settings) and the
 * AI provider profiles WITHOUT keys. It never holds `scan` rows (diagnostic data), the barcode cache, an API
 * key (there is no field for one; a stray field is dropped when parsing), or the settings that belong to this
 * installation rather than to the person (see `settingsPolicy.ts`).
 *
 * Versioning: `format_version` is a whole number. A reader refuses a version newer than the one it knows and
 * says so; a change that old readers could misread must bump it.
 *
 * Health notice: the acceptance in `profile.disclaimer_*` is written to the file (it is part of the profile), but
 * an import does NOT carry it over: the person accepted the notice on the installation they use, and an
 * acceptance given on another phone is not an acceptance here (see `dataService.ts`).
 */
import { z } from 'zod';

import { assertSecureBaseUrl } from '@/core/ai';
import { NUTRIENT_CODES } from '@/core/nutrition';
import { isLocalDate, schema } from '@/data';

export const EXPORT_FORMAT = 'qbit-nutrition-export';
export const EXPORT_FORMAT_VERSION = 1;

/** Meal photos live at `photos/<plain name>.jpg`, in the ZIP as well as on the device. Anything else is refused (no path can leave the folder). */
export const PHOTO_PATH_PATTERN = /^photos\/[A-Za-z0-9._-]{1,120}\.jpg$/;

const HEADLINE = new Set(['kcal', 'protein', 'carbs', 'fat']);
const EXTRA_NUTRIENTS = new Set<string>(NUTRIENT_CODES.filter((code) => !HEADLINE.has(code)));

const id = z.string().min(1).max(200);
const text = z.string().max(2000);
const longText = z.string().max(20_000);
const amount = z.number().finite().min(0);
const localDate = z.string().refine(isLocalDate, 'must be a calendar date, YYYY-MM-DD');
const instant = z.iso.datetime();
const nullable = <T extends z.ZodType>(type: T) => type.nullable();

/** Nutrient codes other than kcal, protein, carbs and fat (those are columns of the item), with non-negative amounts. */
const nutrients = z.record(z.string(), amount).superRefine((value, ctx) => {
  for (const code of Object.keys(value)) {
    if (!EXTRA_NUTRIENTS.has(code)) ctx.addIssue({ code: 'custom', message: `"${code}" is not a nutrient code this app tracks` });
  }
});

const profile = z.object({
  id,
  sex: nullable(z.enum(schema.SEXES)),
  birth_date: nullable(localDate),
  height_cm: nullable(z.number().finite().positive()),
  activity_level: nullable(z.enum(schema.ACTIVITY_LEVELS)),
  special_condition: nullable(z.enum(schema.SPECIAL_CONDITIONS)),
  unit_system: z.enum(schema.UNIT_SYSTEMS),
  locale: z.enum(schema.LOCALES),
  disclaimer_accepted_at: text,
  disclaimer_version: text,
  created_at: instant,
  updated_at: instant,
});

const goal = z
  .object({
    id,
    type: z.enum(schema.GOAL_TYPES),
    pace: nullable(z.enum(schema.GOAL_PACES)),
    start_date: localDate,
    end_date: nullable(localDate),
    kcal_target: nullable(amount),
    protein_g_target: nullable(amount),
    carbs_g_target: nullable(amount),
    fat_g_target: nullable(amount),
    is_custom: z.boolean(),
    basis_weight_kg: nullable(amount),
    formula_version: nullable(text),
  })
  .superRefine((value, ctx) => {
    if (value.end_date !== null && value.end_date < value.start_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'a goal cannot end before it starts' });
    }
  });

const bodyMeasurement = z.object({
  id,
  measured_on: localDate,
  kind: z.enum(schema.MEASUREMENT_KINDS),
  value: z.number().finite().positive(),
  source: z.enum(schema.MEASUREMENT_SOURCES),
});

const mealItem = z.object({
  id,
  position: z.number().int().min(0),
  display_name: z.string().min(1).max(500),
  grams: amount,
  food_source: z.enum(schema.FOOD_SOURCES),
  food_ref: nullable(id),
  origin: z.enum(schema.ITEM_ORIGINS),
  confidence_food: nullable(text),
  confidence_portion: nullable(text),
  kcal: amount,
  protein_g: amount,
  carbs_g: amount,
  fat_g: amount,
  nutrients,
});

const meal = z.object({
  id,
  local_date: localDate,
  eaten_at: instant,
  slot: z.enum(schema.MEAL_SLOTS),
  name: nullable(text),
  source: z.enum(schema.MEAL_SOURCES),
  photo_path: nullable(z.string().regex(PHOTO_PATH_PATTERN, 'must be photos/<name>.jpg')),
  note: nullable(longText),
  created_at: instant,
  updated_at: instant,
  items: z.array(mealItem),
});

const customFood = z.object({
  id,
  name: z.string().min(1).max(500),
  kcal_100g: amount,
  protein_100g: amount,
  carbs_100g: amount,
  fat_100g: amount,
  other_nutrients: nullable(nutrients),
  default_portion_g: nullable(amount),
});

const foodUsage = z.object({
  food_source: z.enum(schema.REF_FOOD_SOURCES),
  food_ref: id,
  last_used_at: instant,
  use_count: z.number().int().min(0),
  is_favorite: z.boolean(),
  last_grams: nullable(amount),
});

const matchMemory = z.object({
  detected_name_normalized: z.string().min(1).max(500),
  food_source: z.enum(schema.REF_FOOD_SOURCES),
  food_ref: id,
  times_confirmed: z.number().int().min(1),
  updated_at: instant,
});

/** A provider profile as exported: no key, ever. */
const aiProvider = z.object({
  id,
  label: z.string().min(1).max(200),
  preset: nullable(text),
  adapter: z.enum(schema.AI_ADAPTERS),
  // The same rule as creating a profile (HTTPS, no credentials in the URL): a file cannot smuggle in what the form refuses.
  base_url: z
    .string()
    .min(1)
    .max(2000)
    .refine((url) => {
      try {
        assertSecureBaseUrl(url);
        return true;
      } catch {
        return false;
      }
    }, 'must be an https URL (http only for a local network), without credentials'),
  model: z.string().min(1).max(500),
  output_mode: nullable(z.enum(schema.OUTPUT_MODES)),
  timeout_s: z.number().int().min(1).max(3600),
  is_active: z.boolean(),
  last_test_at: nullable(text),
  last_test_result: nullable(text),
});

export const ExportDocumentSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    format_version: z.literal(EXPORT_FORMAT_VERSION),
    app_version: z.string().min(1).max(100),
    exported_at: instant,
    profile: nullable(profile),
    goals: z.array(goal),
    body_measurements: z.array(bodyMeasurement),
    meals: z.array(meal),
    custom_foods: z.array(customFood),
    food_usage: z.array(foodUsage),
    match_memory: z.array(matchMemory),
    ai_providers: z.array(aiProvider),
    settings: z.record(z.string().min(1).max(200), z.string().max(100_000)),
  })
  .superRefine((doc, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    /** Reports every row whose key was already seen. */
    const unique = <T>(rows: readonly T[], list: string, key: (row: T) => string, field: string) => {
      const seen = new Set<string>();
      rows.forEach((row, index) => {
        const k = key(row);
        if (seen.has(k)) issue([list, index, field], `duplicate ${field}`);
        seen.add(k);
      });
    };

    unique(doc.goals, 'goals', (g) => g.id, 'id');
    unique(doc.body_measurements, 'body_measurements', (m) => m.id, 'id');
    unique(doc.body_measurements, 'body_measurements', (m) => `${m.measured_on}|${m.kind}|${m.source}`, 'measured_on');
    unique(doc.meals, 'meals', (m) => m.id, 'id');
    unique(doc.custom_foods, 'custom_foods', (f) => f.id, 'id');
    unique(doc.food_usage, 'food_usage', (u) => `${u.food_source}|${u.food_ref}`, 'food_ref');
    unique(doc.match_memory, 'match_memory', (m) => m.detected_name_normalized, 'detected_name_normalized');
    unique(doc.ai_providers, 'ai_providers', (p) => p.id, 'id');

    const itemIds = new Set<string>();
    doc.meals.forEach((m, mi) =>
      m.items.forEach((item, ii) => {
        if (itemIds.has(item.id)) issue(['meals', mi, 'items', ii, 'id'], 'duplicate id');
        itemIds.add(item.id);
      }),
    );

    let open = false;
    doc.goals.forEach((g, index) => {
      if (g.end_date !== null) return;
      if (open) issue(['goals', index, 'end_date'], 'only one goal period can be open');
      open = true;
    });

    let active = false;
    doc.ai_providers.forEach((p, index) => {
      if (!p.is_active) return;
      if (active) issue(['ai_providers', index, 'is_active'], 'only one provider can be active');
      active = true;
    });
  });

export type ExportDocument = z.infer<typeof ExportDocumentSchema>;

export type ParseResult =
  | { ok: true; document: ExportDocument }
  /** The file is not an export of this app at all. */
  | { ok: false; code: 'not_export' }
  /** A newer app wrote it; this one cannot know what changed. */
  | { ok: false; code: 'newer_version'; fileVersion: number; supportedVersion: number }
  /** `where` is the first place that is wrong, e.g. `meals[3].items[0].grams`. */
  | { ok: false; code: 'invalid'; where: string };

/** `meals[3].items[0].grams` from a Zod issue path. */
export function describePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, part) => (typeof part === 'number' ? `${out}[${part}]` : `${out}${out ? '.' : ''}${String(part)}`), '');
}

/**
 * Validates a parsed JSON value as an export document, in the order that gives the most useful message:
 * is it an export at all, is it from a newer format, then the whole structure. Nothing is written by this.
 */
export function parseExportDocument(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || (raw as Record<string, unknown>).format !== EXPORT_FORMAT) {
    return { ok: false, code: 'not_export' };
  }
  const version = (raw as Record<string, unknown>).format_version;
  if (typeof version === 'number' && Number.isInteger(version) && version > EXPORT_FORMAT_VERSION) {
    return { ok: false, code: 'newer_version', fileVersion: version, supportedVersion: EXPORT_FORMAT_VERSION };
  }
  const result = ExportDocumentSchema.safeParse(raw);
  if (result.success) return { ok: true, document: result.data };
  const first = result.error.issues[0];
  return { ok: false, code: 'invalid', where: describePath(first?.path ?? []) || 'file' };
}

/** Every photo path a document refers to, once each. */
export function referencedPhotos(document: ExportDocument): string[] {
  return [...new Set(document.meals.flatMap((m) => (m.photo_path ? [m.photo_path] : [])))];
}
