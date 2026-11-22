/**
 * The export format (docs/08 section 9, FR-70, FR-71) and its ONE definition: this Zod schema decides what an
 * export contains, what an import accepts, and what the preview counts. The exporter builds a document and
 * parses it with this schema before writing a byte; the importer parses the whole file with it before touching
 * the database.
 *
 * What the file holds: everything the person created (profile, goals, weights and body measurements, meals with
 * their items and nutrient snapshots, custom foods, recents and favorites, learned matches, settings) and the
 * AI provider profiles WITHOUT keys. It holds the barcode products that something refers to (a saved item, a favorite or
 * recent, a learned match), so those references do not dangle on the new phone; the rest of the lookup cache stays behind.
 * It never holds `scan` rows (diagnostic data), an API key (there is no field for one; a stray field is dropped when
 * parsing), or the settings that belong to this installation rather than to the person (see `settingsPolicy.ts`).
 *
 * Versioning: `format_version` is a whole number. A reader refuses a version newer than the one it knows and
 * says so; a change that old readers could misread must bump it.
 *
 * `barcode_products` was added without a bump, on purpose: it is optional (a file without it still imports, as `[]`), and
 * a reader from before it ignores the list (unknown keys are dropped when parsing) and reads everything else exactly as
 * it always did; meal items and usage rows that point at a barcode product were already valid in version 1. What an
 * older reader loses is the cached product itself, never the meaning of anything it does read.
 *
 * Health notice: the acceptance in `profile.disclaimer_*` is written to the file (it is part of the profile), but
 * an import does NOT carry it over: the person accepted the notice on the installation they use, and an
 * acceptance given on another phone is not an acceptance here (see `dataService.ts`).
 */
import { z } from 'zod';

import { assertSecureBaseUrl, type ProviderErrorCode } from '@/core/ai';
import { NUTRIENT_CODES } from '@/core/nutrition';
import { MAX_TIMEOUT_S, MIN_TIMEOUT_S, PHOTO_PATH_PATTERN as STORED_PHOTO_PATH, TEXT_LIMITS, VALUE_LIMITS, addDays, isLocalDate, schema } from '@/data';
import { TARGET_RANGES } from '../goals/targetsForm';
import { CUSTOM_FOOD_RANGES, GRAMS_RANGE } from '../logging/limits';
import { HEIGHT_CM, MIN_BIRTH_AGE_YEARS, WEIGHT_KG } from '../profile/units';
import { METRIC_LIMITS } from '../progress/series';
import { SETTING_RULES, isValidSetting } from './settingsPolicy';

export const EXPORT_FORMAT = 'qbit-nutrition-export';
export const EXPORT_FORMAT_VERSION = 1;

/** Meal photos live at `photos/<plain name>.jpg`, in the ZIP as well as on the device. Anything else is refused (no path can leave the folder). */
export const PHOTO_PATH_PATTERN = STORED_PHOTO_PATH;

/**
 * Bounds. Every number a form lets the person type is bounded by the constants of that form (grams, heights, weights,
 * targets, custom food values, measurement ranges): this file imports them and invents no second set. What no form
 * bounds comes from them (an item's calories at most the largest portion of the densest custom food) or is a sanity
 * limit named here.
 */
const ITEM_MAX = VALUE_LIMITS.item;
const NUTRIENT_MAX = VALUE_LIMITS.nutrientMax;
const COUNT_MAX = VALUE_LIMITS.countMax;
/** Earliest day any record may have (the app did not exist before). A birth date is bounded by `MIN_BIRTH_AGE_YEARS` instead. */
export const EARLIEST_DAY = '2000-01-01';
/** A file may name days up to this many days after it was exported (time zones, a clock a little ahead). */
const FUTURE_SLACK_DAYS = 2;

/** What the last "Test connection" may store: `ok` or a provider error code. Anything else (free text from a provider) is not exported. */
const TEST_RESULTS: Record<ProviderErrorCode | 'ok' | 'key_storage', true> = {
  ok: true,
  key_storage: true,
  no_network: true,
  timeout: true,
  auth_invalid: true,
  model_not_found: true,
  no_vision: true,
  quota_exceeded: true,
  provider_unavailable: true,
  content_refused: true,
  invalid_output: true,
  insecure_url: true,
  unknown: true,
};
export const KNOWN_TEST_RESULTS = Object.keys(TEST_RESULTS) as [string, ...string[]];
export const isKnownTestResult = (value: string | null): value is string => value !== null && Object.hasOwn(TEST_RESULTS, value);

const HEADLINE = new Set(['kcal', 'protein', 'carbs', 'fat']);
const EXTRA_NUTRIENTS = new Set<string>(NUTRIENT_CODES.filter((code) => !HEADLINE.has(code)));

const id = z.string().min(1).max(TEXT_LIMITS.id);
const text = z.string().max(2000);
const longText = z.string().max(TEXT_LIMITS.note);
const upTo = (max: number) => z.number().finite().min(0).max(max);
const within = (range: { min: number; max: number }) => z.number().finite().min(range.min).max(range.max);
const localDate = z.string().refine(isLocalDate, 'must be a calendar date, YYYY-MM-DD');
const instant = z.iso.datetime();
const nullable = <T extends z.ZodType>(type: T) => type.nullable();

/** Nutrient codes other than kcal, protein, carbs and fat (those are columns of the item), with non-negative amounts. */
const nutrients = z.record(z.string(), upTo(NUTRIENT_MAX)).superRefine((value, ctx) => {
  for (const code of Object.keys(value)) {
    if (!EXTRA_NUTRIENTS.has(code)) ctx.addIssue({ code: 'custom', message: `"${code}" is not a nutrient code this app tracks` });
  }
});

const profile = z.object({
  id,
  sex: nullable(z.enum(schema.SEXES)),
  birth_date: nullable(localDate),
  height_cm: nullable(within(HEIGHT_CM)),
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
    kcal_target: nullable(within(TARGET_RANGES.kcal)),
    protein_g_target: nullable(within(TARGET_RANGES.protein)),
    carbs_g_target: nullable(within(TARGET_RANGES.carbs)),
    fat_g_target: nullable(within(TARGET_RANGES.fat)),
    is_custom: z.boolean(),
    basis_weight_kg: nullable(within(WEIGHT_KG)),
    formula_version: nullable(text),
  })
  .superRefine((value, ctx) => {
    if (value.end_date !== null && value.end_date < value.start_date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'a goal cannot end before it starts' });
    }
  });

const bodyMeasurement = z
  .object({
    id,
    measured_on: localDate,
    kind: z.enum(schema.MEASUREMENT_KINDS),
    value: z.number().finite().positive(),
    source: z.enum(schema.MEASUREMENT_SOURCES),
  })
  .superRefine((value, ctx) => {
    const range = METRIC_LIMITS[value.kind];
    if (value.value < range.min || value.value > range.max) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: `a ${value.kind} must be between ${range.min} and ${range.max}` });
    }
  });

const mealItem = z.object({
  id,
  position: z.number().int().min(0),
  display_name: z.string().min(1).max(TEXT_LIMITS.name),
  grams: upTo(GRAMS_RANGE.max),
  food_source: z.enum(schema.FOOD_SOURCES),
  food_ref: nullable(id),
  origin: z.enum(schema.ITEM_ORIGINS),
  confidence_food: nullable(text),
  confidence_portion: nullable(text),
  kcal: upTo(ITEM_MAX.kcal),
  protein_g: upTo(ITEM_MAX.protein),
  carbs_g: upTo(ITEM_MAX.carbs),
  fat_g: upTo(ITEM_MAX.fat),
  nutrients,
});

const meal = z.object({
  id,
  local_date: localDate,
  eaten_at: instant,
  slot: z.enum(schema.MEAL_SLOTS),
  name: nullable(z.string().max(TEXT_LIMITS.mealName)),
  source: z.enum(schema.MEAL_SOURCES),
  photo_path: nullable(z.string().regex(PHOTO_PATH_PATTERN, 'must be photos/<name>.jpg')),
  note: nullable(longText),
  created_at: instant,
  updated_at: instant,
  items: z.array(mealItem).min(1),
});

const customFood = z.object({
  id,
  name: z.string().min(1).max(TEXT_LIMITS.name),
  kcal_100g: within(CUSTOM_FOOD_RANGES.kcal),
  protein_100g: within(CUSTOM_FOOD_RANGES.protein),
  carbs_100g: within(CUSTOM_FOOD_RANGES.carbs),
  fat_100g: within(CUSTOM_FOOD_RANGES.fat),
  other_nutrients: nullable(nutrients),
  default_portion_g: nullable(within({ min: 0, max: GRAMS_RANGE.max })),
});

const PRODUCT_FIELDS = ['name', 'kcal', 'protein', 'carbs', 'fat'] as const;

/** A cached Open Food Facts product. A headline value the lookup did not have is 0 here and named in `missing` (the column cannot be empty). */
const barcodeProduct = z.object({
  barcode: z.string().regex(/^(\d{8}|\d{13})$/, 'must be 8 or 13 digits'),
  name: z.string().max(TEXT_LIMITS.name),
  brand: nullable(z.string().max(TEXT_LIMITS.name)),
  kcal_100g: within(CUSTOM_FOOD_RANGES.kcal),
  protein_100g: within(CUSTOM_FOOD_RANGES.protein),
  carbs_100g: within(CUSTOM_FOOD_RANGES.carbs),
  fat_100g: within(CUSTOM_FOOD_RANGES.fat),
  other_nutrients: nullable(nutrients),
  serving_g: nullable(z.number().finite().gt(0).max(GRAMS_RANGE.max)),
  missing: z.array(z.enum(PRODUCT_FIELDS)).max(PRODUCT_FIELDS.length),
  inconsistent: z.boolean(),
  edited: z.boolean(),
  fetched_at: instant,
});

const foodUsage = z.object({
  food_source: z.enum(schema.REF_FOOD_SOURCES),
  food_ref: id,
  last_used_at: instant,
  use_count: z.number().int().min(0).max(COUNT_MAX),
  is_favorite: z.boolean(),
  last_grams: nullable(upTo(GRAMS_RANGE.max)),
});

const matchMemory = z.object({
  detected_name_normalized: z.string().min(1).max(TEXT_LIMITS.name),
  food_source: z.enum(schema.REF_FOOD_SOURCES),
  food_ref: id,
  times_confirmed: z.number().int().min(1).max(COUNT_MAX),
  updated_at: instant,
});

/** A provider profile as exported: no key, ever. */
const aiProvider = z.object({
  id,
  label: z.string().min(1).max(TEXT_LIMITS.label),
  preset: nullable(z.string().max(TEXT_LIMITS.name)),
  adapter: z.enum(schema.AI_ADAPTERS),
  // The same rule as creating a profile (HTTPS, no credentials in the URL): a file cannot smuggle in what the form refuses.
  base_url: z
    .string()
    .min(1)
    .max(TEXT_LIMITS.url)
    .refine((url) => {
      try {
        assertSecureBaseUrl(url);
        return true;
      } catch {
        return false;
      }
    }, 'must be an https URL (http only for a local network), without credentials'),
  model: z.string().min(1).max(TEXT_LIMITS.model),
  output_mode: nullable(z.enum(schema.OUTPUT_MODES)),
  timeout_s: z.number().int().min(MIN_TIMEOUT_S).max(MAX_TIMEOUT_S),
  is_active: z.boolean(),
  last_test_at: nullable(text),
  last_test_result: nullable(z.enum(KNOWN_TEST_RESULTS)),
});

const documentShape = z
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
    /** Optional: a file written before barcode products travelled has none. */
    barcode_products: z.array(barcodeProduct).default([]),
    food_usage: z.array(foodUsage),
    match_memory: z.array(matchMemory),
    ai_providers: z.array(aiProvider),
    settings: z.record(z.string().min(1).max(200), z.string().max(1000)).superRefine((value, ctx) => {
      for (const [key, setting] of Object.entries(value)) {
        if (!Object.hasOwn(SETTING_RULES, key)) ctx.addIssue({ code: 'custom', path: [key], message: `"${key}" is not a setting that travels` });
        else if (!isValidSetting(key, setting)) ctx.addIssue({ code: 'custom', path: [key], message: `"${key}" has a value the app cannot read` });
      }
    }),
  });

/**
 * The format as a schema. `clock` is the DEVICE's clock: every date is bounded by it (plus a little skew), never by the file's own
 * `exported_at`, which a file can set to any year it likes.
 */
export function createExportSchema(clock: () => Date) {
  return documentShape.superRefine((doc, ctx) => {
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
    unique(doc.barcode_products, 'barcode_products', (p) => p.barcode, 'barcode');
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

    // Goal periods must not overlap, and the open one must be the latest: each day has one set of targets.
    const byStart = doc.goals.map((g, index) => ({ g, index })).sort((x, y) => x.g.start_date.localeCompare(y.g.start_date) || x.index - y.index);
    for (let i = 1; i < byStart.length; i++) {
      const previous = byStart[i - 1]!;
      const next = byStart[i]!;
      if (previous.g.end_date === null) issue(['goals', previous.index, 'end_date'], 'an open goal period must be the latest');
      else if (previous.g.end_date >= next.g.start_date) issue(['goals', next.index, 'start_date'], 'goal periods must not overlap');
    }

    // Dates: plausible against the device clock, and consistent with each other.
    const today = clock().toISOString().slice(0, 10);
    const latest = addDays(today, FUTURE_SLACK_DAYS);
    if (doc.exported_at.slice(0, 10) > latest) issue(['exported_at'], `a file cannot be exported after ${latest} on this device's clock`);
    const plausible = (path: (string | number)[], day: string) => {
      if (day < EARLIEST_DAY || day > latest) issue(path, `must be between ${EARLIEST_DAY} and ${latest}`);
    };
    if (doc.profile?.birth_date) {
      const oldest = `${Number(today.slice(0, 4)) - MIN_BIRTH_AGE_YEARS}-01-01`;
      if (doc.profile.birth_date < oldest || doc.profile.birth_date > today) issue(['profile', 'birth_date'], `must be between ${oldest} and today`);
    }
    if (doc.profile) {
      plausible(['profile', 'created_at'], doc.profile.created_at.slice(0, 10));
      plausible(['profile', 'updated_at'], doc.profile.updated_at.slice(0, 10));
    }
    doc.goals.forEach((g, i) => {
      plausible(['goals', i, 'start_date'], g.start_date);
      if (g.end_date !== null) plausible(['goals', i, 'end_date'], g.end_date);
    });
    doc.body_measurements.forEach((m, i) => plausible(['body_measurements', i, 'measured_on'], m.measured_on));
    const dayNumber = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / 86_400_000;
    doc.meals.forEach((m, mi) => {
      plausible(['meals', mi, 'local_date'], m.local_date);
      plausible(['meals', mi, 'eaten_at'], m.eaten_at.slice(0, 10));
      plausible(['meals', mi, 'created_at'], m.created_at.slice(0, 10));
      plausible(['meals', mi, 'updated_at'], m.updated_at.slice(0, 10));
      // Time zones run from UTC-12 to UTC+14: the local day is at most one day from the UTC day of the instant.
      if (Math.abs(dayNumber(m.local_date) - dayNumber(m.eaten_at.slice(0, 10))) > 1) issue(['meals', mi, 'local_date'], 'does not match eaten_at in any time zone');
      const positions = new Set<number>();
      m.items.forEach((item, ii) => {
        if (positions.has(item.position)) issue(['meals', mi, 'items', ii, 'position'], 'two items of a meal share a position');
        positions.add(item.position);
      });
    });
    doc.barcode_products.forEach((p, i) => plausible(['barcode_products', i, 'fetched_at'], p.fetched_at.slice(0, 10)));
    doc.food_usage.forEach((u, i) => plausible(['food_usage', i, 'last_used_at'], u.last_used_at.slice(0, 10)));
    doc.match_memory.forEach((m, i) => plausible(['match_memory', i, 'updated_at'], m.updated_at.slice(0, 10)));

    let active = false;
    doc.ai_providers.forEach((p, index) => {
      if (!p.is_active) return;
      if (active) issue(['ai_providers', index, 'is_active'], 'only one provider can be active');
      active = true;
    });
  });
}

export const ExportDocumentSchema = createExportSchema(() => new Date());

export type ExportDocument = z.infer<typeof documentShape>;

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
export function parseExportDocument(raw: unknown, clock: () => Date = () => new Date()): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || (raw as Record<string, unknown>).format !== EXPORT_FORMAT) {
    return { ok: false, code: 'not_export' };
  }
  const version = (raw as Record<string, unknown>).format_version;
  if (typeof version === 'number' && Number.isInteger(version) && version > EXPORT_FORMAT_VERSION) {
    return { ok: false, code: 'newer_version', fileVersion: version, supportedVersion: EXPORT_FORMAT_VERSION };
  }
  const result = createExportSchema(clock).safeParse(raw);
  if (result.success) return { ok: true, document: result.data };
  const first = result.error.issues[0];
  return { ok: false, code: 'invalid', where: describePath(first?.path ?? []) || 'file' };
}

/** Every photo path a document refers to, once each. */
export function referencedPhotos(document: ExportDocument): string[] {
  return [...new Set(document.meals.flatMap((m) => (m.photo_path ? [m.photo_path] : [])))];
}
