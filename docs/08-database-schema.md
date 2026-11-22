# 08 — Database Schema

## 1. Storage overview

| Store | Contents | Technology |
| --- | --- | --- |
| `app.db` | Everything the user creates | SQLite, read-write |
| `catalog.db` | Bundled USDA foods and translations | SQLite, read-only, attached to `app.db`; replaced on app update |
| Secure storage | API keys | Android Keystore through `expo-secure-store` |
| App file directory | Meal photos | JPEG files |

Splitting the catalog from user data means a catalog update never touches
the user's records, and an export contains only `app.db` data.

## 2. Conventions

- Primary keys are UUID text, so a future sync never needs to renumber rows.
- Timestamps are UTC in ISO 8601 text. A meal also stores its **local date**
  (`YYYY-MM-DD`), because "which day did I eat this" must not change when
  the user travels across time zones.
- All quantities are metric: grams, milliliters, centimeters, kilograms,
  kilocalories. Imperial is a display conversion.
- Rows are deleted for real, not soft-deleted. There is one device and no
  sync.
- `PRAGMA foreign_keys = ON`; the schema version is tracked by the migration
  tool.

## 3. Entity relationships

```
profile 1───* goal
profile 1───* body_measurement

meal 1───* meal_item 1───* meal_item_nutrient *───1 nutrient
meal *───0..1 scan
meal_item *───0..1 food (catalog)  |  custom_food  |  barcode_product

food 1───* food_nutrient *───1 nutrient          (catalog.db)
food 1───* food_name                             (catalog.db)
food 1───* food_portion                          (catalog.db)

ai_provider 1───* scan
match_memory          (learned name → food corrections)
food_usage            (recents and favorites)
setting               (key-value)
```

## 4. Tables in `app.db`

### `profile` (single row)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `sex` | text null | `male`, `female`; null if not given |
| `birth_date` | text null | |
| `height_cm` | real null | |
| `activity_level` | text null | `sedentary`, `light`, `moderate`, `active`, `very_active` |
| `special_condition` | text null | `pregnant`, `breastfeeding`; disables target proposals |
| `unit_system` | text | `metric` or `imperial` |
| `locale` | text | `en` or `es` |
| `disclaimer_accepted_at` | text | |
| `disclaimer_version` | text | Re-prompt when the text changes |
| `created_at`, `updated_at` | text | |

### `goal`

One row per goal period; the row with a null `end_date` is current.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `type` | text | `lose_fat`, `maintain`, `gain_muscle` |
| `pace` | text null | `gentle`, `moderate` |
| `start_date` | text | Local date |
| `end_date` | text null | |
| `kcal_target` | real null | Null means the user tracks without targets |
| `protein_g_target`, `carbs_g_target`, `fat_g_target` | real null | |
| `is_custom` | integer | 1 when the user overrode the proposal |
| `basis_weight_kg` | real null | Weight used for the calculation |
| `formula_version` | text null | Which constants produced the proposal |

### `body_measurement`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `measured_on` | text | Local date |
| `kind` | text | `weight`, `waist`, `hips`, `chest`, `body_fat_pct` |
| `value` | real | kg, cm, or percent according to `kind` |
| `source` | text | `manual` or `health_connect` |

Unique on (`measured_on`, `kind`, `source`).

### `meal`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `local_date` | text | Indexed |
| `eaten_at` | text | UTC timestamp |
| `slot` | text | `breakfast`, `lunch`, `dinner`, `snack` |
| `name` | text null | For example the dish name from the scan |
| `source` | text | `scan`, `manual`, `copy` |
| `scan_id` | text null FK → `scan` | |
| `photo_path` | text null | Relative path; null when photos are not kept |
| `note` | text null | |
| `created_at`, `updated_at` | text | |

### `meal_item`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `meal_id` | text FK → `meal`, cascade delete | Indexed |
| `position` | integer | Display order |
| `display_name` | text | In the language used when logged |
| `grams` | real | |
| `food_source` | text | `catalog`, `custom`, `barcode`, `ai_estimate` |
| `food_ref` | text null | Id in the corresponding table; null for `ai_estimate` |
| `origin` | text | `ai` (as detected), `ai_edited` (user changed it), `manual` |
| `confidence_food`, `confidence_portion` | text null | From the scan |
| `kcal`, `protein_g`, `carbs_g`, `fat_g` | real | Snapshot for these grams |

### `meal_item_nutrient`

Snapshot of the remaining tracked nutrients for the item.

| Column | Type | Notes |
| --- | --- | --- |
| `meal_item_id` | text FK → `meal_item`, cascade delete | |
| `nutrient_code` | text | For example `fiber`, `sodium`, `vit_c` |
| `amount` | real | In the nutrient's unit |

Primary key (`meal_item_id`, `nutrient_code`).

**Why snapshots.** History must not change when the catalog is updated or a
custom food is edited, and the dashboard must not need catalog joins. The
four headline values sit on `meal_item` because every screen reads them;
the rest go in the side table. Changing an item's grams recalculates its
snapshot from the source food.

### `scan`

One row per analysis request, including failed ones.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `created_at` | text | |
| `provider_id` | text null FK → `ai_provider`, set null on delete | |
| `provider_label`, `model` | text | Copied, so history survives profile changes |
| `prompt_version` | text | |
| `status` | text | `ok`, `no_food`, `error` |
| `error_code` | text null | From the taxonomy in document 09 |
| `hint` | text null | |
| `result_json` | text null | The validated model output |
| `input_tokens`, `output_tokens` | integer null | When reported |
| `latency_ms` | integer null | |
| `repaired` | integer | 1 if the repair retry was needed |

Comparing `result_json` with the saved `meal_item` rows shows what the user
corrected, which is the app's only local quality signal.

### `ai_provider`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | Also the secure-storage key name for the API key |
| `label` | text | |
| `preset` | text null | Preset id, or null for custom |
| `adapter` | text | `openai_compatible`, `anthropic`, `gemini` |
| `base_url` | text | |
| `model` | text | |
| `output_mode` | text null | `schema`, `tool`, `prompt`; set by "test connection" |
| `timeout_s` | integer | |
| `is_active` | integer | At most one row with 1 |
| `last_test_at`, `last_test_result` | text null | |

**The API key is never a column.**

### `custom_food`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `name` | text | |
| `kcal_100g`, `protein_100g`, `carbs_100g`, `fat_100g` | real | |
| `other_nutrients_json` | text null | Optional per-100 g values by nutrient code |
| `default_portion_g` | real null | |

### `barcode_product`

Cache of Open Food Facts lookups: `barcode` (PK), `name`, `brand`, per-100 g
values, `serving_g`, `fetched_at`, and `raw_json`. Entries refresh after a
set age.

### `food_usage`

Recents and favorites: `food_source`, `food_ref` (composite PK),
`last_used_at`, `use_count`, `is_favorite`, `last_grams`.

### `match_memory`

Learned corrections: `detected_name_normalized` (PK), `food_source`,
`food_ref`, `times_confirmed`, `updated_at`.

### `setting`

Key-value pairs: `keep_photos`, `monthly_scan_warning`, `theme`, and
similar.

## 5. Tables in `catalog.db` (read-only)

| Table | Columns | Notes |
| --- | --- | --- |
| `nutrient` | `code` PK, `unit`, `name_en`, `name_es`, `sort_order` | The tracked nutrients from document 02 |
| `food` | `id` PK, `source` (`usda_foundation`, `usda_sr_legacy`, `usda_fndds`), `source_id`, `category`, `state` (`raw`, `cooked`, `processed`, `unknown`), `is_branded`, `kcal_100g`, `protein_100g`, `carbs_100g`, `fat_100g` | Headline values inline for fast listing |
| `food_nutrient` | `food_id`, `nutrient_code`, `amount_100g` | PK on both columns |
| `food_name` | `food_id`, `locale`, `name`, `is_alias`, `origin` (`source`, `handwritten`, `composed`) | English from USDA; Spanish from the repository's translation table |
| `food_portion` | `food_id`, `locale`, `label`, `grams` | Household measures such as "1 cup" |
| `food_fts` | FTS5 virtual table over `food_name.name` | Diacritics removed, so "plátano" matches "platano" |
| `recipe`, `recipe_ingredient` | Dishes calculated by the project: method, yield, and the exact ingredient foods with grams | Source `qbit_recipe`; see `docs/catalog-recipes.md` |
| `catalog_meta` | `key`, `value` | Data version, build date, source file names |

## 6. Indexes

- `meal(local_date)`, `meal_item(meal_id)`
- `body_measurement(kind, measured_on)`
- `food_usage(last_used_at)`
- `food_nutrient(food_id)` is covered by its primary key
- `food_name(food_id)`, `food_portion(food_id)` in `catalog.db`

## 7. Derived data

Daily, weekly, and monthly totals are computed by query from `meal_item`
and `meal_item_nutrient`. They are not stored. If measurements later show
this is too slow, a `day_total` cache table can be added without changing
anything else.

## 8. Migrations

- SQL migration files are generated by Drizzle and committed.
- Migrations run in a transaction at startup, before any screen reads data.
- A failed migration leaves the previous database untouched and shows a
  recovery screen offering export.
- Migrations are forward-only. Each release is tested by opening a database
  created by the previous release (document 11).

## 9. Export format

A single JSON document:

```json
{
  "format": "qbit-nutrition-export",
  "format_version": 1,
  "app_version": "1.0.0",
  "exported_at": "2026-11-21T12:00:00Z",
  "profile": {},
  "goals": [],
  "body_measurements": [],
  "meals": [{ "items": [{ "nutrients": {} }] }],
  "custom_foods": [],
  "food_usage": [],
  "match_memory": [],
  "ai_providers": [],
  "settings": {}
}
```

- `ai_providers` contains profiles **without keys**.
- `scan` rows are not exported by default; they are diagnostic data.
- With photos, the JSON and a `photos/` folder are packed in a ZIP.
- Import validates the whole file against a schema before writing anything.
