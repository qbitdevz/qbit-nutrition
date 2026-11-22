/**
 * Drizzle schema of `app.db` (docs/08-database-schema.md sections 2, 4 and 6).
 *
 * Conventions (section 2): UUID text primary keys, UTC ISO 8601 timestamps, local dates as
 * `YYYY-MM-DD`, metric quantities, real deletes. There is deliberately NO column that holds an
 * API key: keys live in secure storage under the `ai_provider.id` (docs/08 section 4).
 *
 * `catalog.db` is a separate, read-only database; nothing here references it with a foreign key,
 * so `food_ref` columns are plain text.
 */
import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

export const SEXES = ['male', 'female'] as const;
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export const SPECIAL_CONDITIONS = ['pregnant', 'breastfeeding'] as const;
export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export const LOCALES = ['en', 'es'] as const;
export const GOAL_TYPES = ['lose_fat', 'maintain', 'gain_muscle'] as const;
export const GOAL_PACES = ['gentle', 'moderate'] as const;
export const MEASUREMENT_KINDS = ['weight', 'waist', 'hips', 'chest', 'body_fat_pct'] as const;
export const MEASUREMENT_SOURCES = ['manual', 'health_connect'] as const;
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const MEAL_SOURCES = ['scan', 'manual', 'copy'] as const;
export const FOOD_SOURCES = ['catalog', 'custom', 'barcode', 'ai_estimate'] as const;
/** Sources a `FoodRef` can point at (`ai_estimate` has no source row). */
export const REF_FOOD_SOURCES = ['catalog', 'custom', 'barcode'] as const;
export const ITEM_ORIGINS = ['ai', 'ai_edited', 'manual'] as const;
export const SCAN_STATUSES = ['ok', 'no_food', 'error'] as const;
export const AI_ADAPTERS = ['openai_compatible', 'anthropic', 'gemini'] as const;
export const OUTPUT_MODES = ['schema', 'tool', 'prompt'] as const;
/** What an imported table's values are per: 100 g, or 100 ml (flagged; no density is applied). */
export const COLLECTION_BASES = ['g', 'ml'] as const;

const oneOf = (column: AnySQLiteColumn, values: readonly string[]): SQL =>
  sql`${column} IN (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`;

/** Single row (the repository keeps it that way). */
export const profile = sqliteTable(
  'profile',
  {
    id: text('id').primaryKey(),
    sex: text('sex', { enum: SEXES }),
    birthDate: text('birth_date'),
    heightCm: real('height_cm'),
    activityLevel: text('activity_level', { enum: ACTIVITY_LEVELS }),
    specialCondition: text('special_condition', { enum: SPECIAL_CONDITIONS }),
    unitSystem: text('unit_system', { enum: UNIT_SYSTEMS }).notNull(),
    locale: text('locale', { enum: LOCALES }).notNull(),
    disclaimerAcceptedAt: text('disclaimer_accepted_at').notNull(),
    disclaimerVersion: text('disclaimer_version').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check('profile_sex_check', sql`${t.sex} IS NULL OR ${oneOf(t.sex, SEXES)}`),
    check(
      'profile_activity_level_check',
      sql`${t.activityLevel} IS NULL OR ${oneOf(t.activityLevel, ACTIVITY_LEVELS)}`,
    ),
    check(
      'profile_special_condition_check',
      sql`${t.specialCondition} IS NULL OR ${oneOf(t.specialCondition, SPECIAL_CONDITIONS)}`,
    ),
    check('profile_unit_system_check', oneOf(t.unitSystem, UNIT_SYSTEMS)),
    check('profile_locale_check', oneOf(t.locale, LOCALES)),
  ],
);

/** One row per goal period; the row with a null `end_date` is current. `end_date` is inclusive. */
export const goal = sqliteTable(
  'goal',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: GOAL_TYPES }).notNull(),
    pace: text('pace', { enum: GOAL_PACES }),
    startDate: text('start_date').notNull(),
    endDate: text('end_date'),
    kcalTarget: real('kcal_target'),
    proteinGTarget: real('protein_g_target'),
    carbsGTarget: real('carbs_g_target'),
    fatGTarget: real('fat_g_target'),
    isCustom: integer('is_custom').notNull().default(0),
    basisWeightKg: real('basis_weight_kg'),
    formulaVersion: text('formula_version'),
  },
  (t) => [
    check('goal_type_check', oneOf(t.type, GOAL_TYPES)),
    check('goal_pace_check', sql`${t.pace} IS NULL OR ${oneOf(t.pace, GOAL_PACES)}`),
    check('goal_period_check', sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
    // At most one open period. NULLs are distinct in a unique index, so the key is a constant.
    uniqueIndex('goal_one_current').on(sql`(1)`).where(sql`${t.endDate} IS NULL`),
    index('goal_start_date_idx').on(t.startDate),
  ],
);

export const bodyMeasurement = sqliteTable(
  'body_measurement',
  {
    id: text('id').primaryKey(),
    measuredOn: text('measured_on').notNull(),
    kind: text('kind', { enum: MEASUREMENT_KINDS }).notNull(),
    value: real('value').notNull(),
    source: text('source', { enum: MEASUREMENT_SOURCES }).notNull(),
  },
  (t) => [
    check('body_measurement_kind_check', oneOf(t.kind, MEASUREMENT_KINDS)),
    check('body_measurement_source_check', oneOf(t.source, MEASUREMENT_SOURCES)),
    uniqueIndex('body_measurement_unique').on(t.measuredOn, t.kind, t.source),
    index('body_measurement_kind_date_idx').on(t.kind, t.measuredOn),
  ],
);

export const aiProvider = sqliteTable(
  'ai_provider',
  {
    /** Also the secure-storage key name for the API key. The key itself is never a column. */
    id: text('id').primaryKey(),
    label: text('label').notNull(),
    preset: text('preset'),
    adapter: text('adapter', { enum: AI_ADAPTERS }).notNull(),
    baseUrl: text('base_url').notNull(),
    model: text('model').notNull(),
    outputMode: text('output_mode', { enum: OUTPUT_MODES }),
    timeoutS: integer('timeout_s').notNull(),
    isActive: integer('is_active').notNull().default(0),
    lastTestAt: text('last_test_at'),
    lastTestResult: text('last_test_result'),
  },
  (t) => [
    check('ai_provider_adapter_check', oneOf(t.adapter, AI_ADAPTERS)),
    check(
      'ai_provider_output_mode_check',
      sql`${t.outputMode} IS NULL OR ${oneOf(t.outputMode, OUTPUT_MODES)}`,
    ),
    check('ai_provider_is_active_check', sql`${t.isActive} IN (0, 1)`),
    // At most one active provider.
    uniqueIndex('ai_provider_one_active').on(t.isActive).where(sql`${t.isActive} = 1`),
  ],
);

/** One row per analysis request, including failed ones. */
export const scan = sqliteTable(
  'scan',
  {
    id: text('id').primaryKey(),
    createdAt: text('created_at').notNull(),
    providerId: text('provider_id').references(() => aiProvider.id, { onDelete: 'set null' }),
    providerLabel: text('provider_label').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    status: text('status', { enum: SCAN_STATUSES }).notNull(),
    errorCode: text('error_code'),
    hint: text('hint'),
    resultJson: text('result_json'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    repaired: integer('repaired').notNull().default(0),
  },
  (t) => [check('scan_status_check', oneOf(t.status, SCAN_STATUSES))],
);

export const meal = sqliteTable(
  'meal',
  {
    id: text('id').primaryKey(),
    localDate: text('local_date').notNull(),
    eatenAt: text('eaten_at').notNull(),
    slot: text('slot', { enum: MEAL_SLOTS }).notNull(),
    name: text('name'),
    source: text('source', { enum: MEAL_SOURCES }).notNull(),
    scanId: text('scan_id').references(() => scan.id),
    photoPath: text('photo_path'),
    note: text('note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check('meal_slot_check', oneOf(t.slot, MEAL_SLOTS)),
    check('meal_source_check', oneOf(t.source, MEAL_SOURCES)),
    index('meal_local_date_idx').on(t.localDate),
  ],
);

export const mealItem = sqliteTable(
  'meal_item',
  {
    id: text('id').primaryKey(),
    mealId: text('meal_id')
      .notNull()
      .references(() => meal.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    displayName: text('display_name').notNull(),
    grams: real('grams').notNull(),
    foodSource: text('food_source', { enum: FOOD_SOURCES }).notNull(),
    foodRef: text('food_ref'),
    origin: text('origin', { enum: ITEM_ORIGINS }).notNull(),
    confidenceFood: text('confidence_food'),
    confidencePortion: text('confidence_portion'),
    /** Snapshot for `grams` (headline values; the rest is in `meal_item_nutrient`). */
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbsG: real('carbs_g').notNull(),
    fatG: real('fat_g').notNull(),
  },
  (t) => [
    check('meal_item_food_source_check', oneOf(t.foodSource, FOOD_SOURCES)),
    check('meal_item_origin_check', oneOf(t.origin, ITEM_ORIGINS)),
    check('meal_item_grams_check', sql`${t.grams} >= 0`),
    index('meal_item_meal_id_idx').on(t.mealId),
  ],
);

export const mealItemNutrient = sqliteTable(
  'meal_item_nutrient',
  {
    mealItemId: text('meal_item_id')
      .notNull()
      .references(() => mealItem.id, { onDelete: 'cascade' }),
    nutrientCode: text('nutrient_code').notNull(),
    amount: real('amount').notNull(),
  },
  (t) => [primaryKey({ columns: [t.mealItemId, t.nutrientCode] })],
);

export const customFood = sqliteTable('custom_food', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kcal100g: real('kcal_100g').notNull(),
  protein100g: real('protein_100g').notNull(),
  carbs100g: real('carbs_100g').notNull(),
  fat100g: real('fat_100g').notNull(),
  otherNutrientsJson: text('other_nutrients_json'),
  defaultPortionG: real('default_portion_g'),
});

/**
 * A food composition table the person imported from a file they downloaded (docs/guides). It lives only in this database: nothing
 * is sent anywhere. Removing the row removes every food of the table at once (the cascade); meals already logged keep their own
 * snapshot of the values and are not touched.
 */
export const foodCollection = sqliteTable(
  'food_collection',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    fileName: text('file_name'),
    importedAt: text('imported_at').notNull(),
    foodCount: integer('food_count').notNull(),
    /** The preset that recognised the file's layout, or null for the generic mapping. */
    presetId: text('preset_id'),
    basis: text('basis', { enum: COLLECTION_BASES }).notNull().default('g'),
    /**
     * Fingerprint of the table's content (every food's name, group and values, and the basis; the order of the foods does not matter), so the
     * same table imported twice is noticed. Null for a table imported before this column existed: those are compared by name, count and a
     * sample of food names, and get their fingerprint the first time the duplicates are looked for.
     */
    contentHash: text('content_hash'),
  },
  (t) => [check('food_collection_basis_check', oneOf(t.basis, COLLECTION_BASES)), check('food_collection_count_check', sql`${t.foodCount} >= 0`)],
);

/**
 * One food of an imported table. `seq` is the integer key the search index points at (it is the table's rowid, so it is stable);
 * `id` is the public key that meal items, favorites and learned matches store as the food reference (source `custom`: it is the
 * person's own data, and a UUID never collides with a custom food's). Values are JSON `{ code: per 100 g }`: a nutrient the table has
 * no number for has no key, so unknown stays apart from zero.
 */
export const importedFood = sqliteTable(
  'imported_food',
  {
    seq: integer('seq').primaryKey(),
    id: text('id').notNull().unique(),
    collectionId: text('collection_id')
      .notNull()
      .references(() => foodCollection.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    foodGroup: text('food_group'),
    per100gJson: text('per_100g_json').notNull(),
  },
  (t) => [index('imported_food_collection_idx').on(t.collectionId)],
);

/**
 * The search index over imported food names: one row per word form of a name (normalized: lowercase, no diacritics, plural and
 * singular forms, the same rules as the catalog's `core/catalog/text.ts`). A plain indexed table instead of FTS5, so the same
 * migration and the same queries run where SQLite has no FTS5 (the web preview) and on the device. Deleted with its food.
 */
export const importedFoodToken = sqliteTable(
  'imported_food_token',
  {
    term: text('term').notNull(),
    foodSeq: integer('food_seq')
      .notNull()
      .references(() => importedFood.seq, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.term, t.foodSeq] }), index('imported_food_token_seq_idx').on(t.foodSeq)],
);

/** Cache of Open Food Facts lookups. */
export const barcodeProduct = sqliteTable('barcode_product', {
  barcode: text('barcode').primaryKey(),
  name: text('name').notNull(),
  brand: text('brand'),
  kcal100g: real('kcal_100g').notNull(),
  protein100g: real('protein_100g').notNull(),
  carbs100g: real('carbs_100g').notNull(),
  fat100g: real('fat_100g').notNull(),
  otherNutrientsJson: text('other_nutrients_json'),
  servingG: real('serving_g'),
  fetchedAt: text('fetched_at').notNull(),
  rawJson: text('raw_json'),
});

export const foodUsage = sqliteTable(
  'food_usage',
  {
    foodSource: text('food_source', { enum: REF_FOOD_SOURCES }).notNull(),
    foodRef: text('food_ref').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
    useCount: integer('use_count').notNull().default(0),
    isFavorite: integer('is_favorite').notNull().default(0),
    lastGrams: real('last_grams'),
  },
  (t) => [
    primaryKey({ columns: [t.foodSource, t.foodRef] }),
    check('food_usage_food_source_check', oneOf(t.foodSource, REF_FOOD_SOURCES)),
    index('food_usage_last_used_at_idx').on(t.lastUsedAt),
  ],
);

export const matchMemory = sqliteTable(
  'match_memory',
  {
    detectedNameNormalized: text('detected_name_normalized').primaryKey(),
    foodSource: text('food_source', { enum: REF_FOOD_SOURCES }).notNull(),
    foodRef: text('food_ref').notNull(),
    timesConfirmed: integer('times_confirmed').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [check('match_memory_food_source_check', oneOf(t.foodSource, REF_FOOD_SOURCES))],
);

export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
