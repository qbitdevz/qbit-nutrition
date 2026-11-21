CREATE TABLE `ai_provider` (
	`id` text PRIMARY KEY,
	`label` text NOT NULL,
	`preset` text,
	`adapter` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`output_mode` text,
	`timeout_s` integer NOT NULL,
	`is_active` integer DEFAULT 0 NOT NULL,
	`last_test_at` text,
	`last_test_result` text,
	CONSTRAINT "ai_provider_adapter_check" CHECK("adapter" IN ('openai_compatible', 'anthropic', 'gemini')),
	CONSTRAINT "ai_provider_output_mode_check" CHECK("output_mode" IS NULL OR "output_mode" IN ('schema', 'tool', 'prompt')),
	CONSTRAINT "ai_provider_is_active_check" CHECK("is_active" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `barcode_product` (
	`barcode` text PRIMARY KEY,
	`name` text NOT NULL,
	`brand` text,
	`kcal_100g` real NOT NULL,
	`protein_100g` real NOT NULL,
	`carbs_100g` real NOT NULL,
	`fat_100g` real NOT NULL,
	`other_nutrients_json` text,
	`serving_g` real,
	`fetched_at` text NOT NULL,
	`raw_json` text
);
--> statement-breakpoint
CREATE TABLE `body_measurement` (
	`id` text PRIMARY KEY,
	`measured_on` text NOT NULL,
	`kind` text NOT NULL,
	`value` real NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT "body_measurement_kind_check" CHECK("kind" IN ('weight', 'waist', 'hips', 'chest', 'body_fat_pct')),
	CONSTRAINT "body_measurement_source_check" CHECK("source" IN ('manual', 'health_connect'))
);
--> statement-breakpoint
CREATE TABLE `custom_food` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kcal_100g` real NOT NULL,
	`protein_100g` real NOT NULL,
	`carbs_100g` real NOT NULL,
	`fat_100g` real NOT NULL,
	`other_nutrients_json` text,
	`default_portion_g` real
);
--> statement-breakpoint
CREATE TABLE `food_usage` (
	`food_source` text NOT NULL,
	`food_ref` text NOT NULL,
	`last_used_at` text NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	`last_grams` real,
	CONSTRAINT `food_usage_pk` PRIMARY KEY(`food_source`, `food_ref`),
	CONSTRAINT "food_usage_food_source_check" CHECK("food_source" IN ('catalog', 'custom', 'barcode'))
);
--> statement-breakpoint
CREATE TABLE `goal` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`pace` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`kcal_target` real,
	`protein_g_target` real,
	`carbs_g_target` real,
	`fat_g_target` real,
	`is_custom` integer DEFAULT 0 NOT NULL,
	`basis_weight_kg` real,
	`formula_version` text,
	CONSTRAINT "goal_type_check" CHECK("type" IN ('lose_fat', 'maintain', 'gain_muscle')),
	CONSTRAINT "goal_pace_check" CHECK("pace" IS NULL OR "pace" IN ('gentle', 'moderate')),
	CONSTRAINT "goal_period_check" CHECK("end_date" IS NULL OR "end_date" >= "start_date")
);
--> statement-breakpoint
CREATE TABLE `match_memory` (
	`detected_name_normalized` text PRIMARY KEY,
	`food_source` text NOT NULL,
	`food_ref` text NOT NULL,
	`times_confirmed` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "match_memory_food_source_check" CHECK("food_source" IN ('catalog', 'custom', 'barcode'))
);
--> statement-breakpoint
CREATE TABLE `meal` (
	`id` text PRIMARY KEY,
	`local_date` text NOT NULL,
	`eaten_at` text NOT NULL,
	`slot` text NOT NULL,
	`name` text,
	`source` text NOT NULL,
	`scan_id` text,
	`photo_path` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_meal_scan_id_scan_id_fk` FOREIGN KEY (`scan_id`) REFERENCES `scan`(`id`),
	CONSTRAINT "meal_slot_check" CHECK("slot" IN ('breakfast', 'lunch', 'dinner', 'snack')),
	CONSTRAINT "meal_source_check" CHECK("source" IN ('scan', 'manual', 'copy'))
);
--> statement-breakpoint
CREATE TABLE `meal_item` (
	`id` text PRIMARY KEY,
	`meal_id` text NOT NULL,
	`position` integer NOT NULL,
	`display_name` text NOT NULL,
	`grams` real NOT NULL,
	`food_source` text NOT NULL,
	`food_ref` text,
	`origin` text NOT NULL,
	`confidence_food` text,
	`confidence_portion` text,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	CONSTRAINT `fk_meal_item_meal_id_meal_id_fk` FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON DELETE CASCADE,
	CONSTRAINT "meal_item_food_source_check" CHECK("food_source" IN ('catalog', 'custom', 'barcode', 'ai_estimate')),
	CONSTRAINT "meal_item_origin_check" CHECK("origin" IN ('ai', 'ai_edited', 'manual')),
	CONSTRAINT "meal_item_grams_check" CHECK("grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE `meal_item_nutrient` (
	`meal_item_id` text NOT NULL,
	`nutrient_code` text NOT NULL,
	`amount` real NOT NULL,
	CONSTRAINT `meal_item_nutrient_pk` PRIMARY KEY(`meal_item_id`, `nutrient_code`),
	CONSTRAINT `fk_meal_item_nutrient_meal_item_id_meal_item_id_fk` FOREIGN KEY (`meal_item_id`) REFERENCES `meal_item`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY,
	`sex` text,
	`birth_date` text,
	`height_cm` real,
	`activity_level` text,
	`special_condition` text,
	`unit_system` text NOT NULL,
	`locale` text NOT NULL,
	`disclaimer_accepted_at` text NOT NULL,
	`disclaimer_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "profile_sex_check" CHECK("sex" IS NULL OR "sex" IN ('male', 'female')),
	CONSTRAINT "profile_activity_level_check" CHECK("activity_level" IS NULL OR "activity_level" IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
	CONSTRAINT "profile_special_condition_check" CHECK("special_condition" IS NULL OR "special_condition" IN ('pregnant', 'breastfeeding')),
	CONSTRAINT "profile_unit_system_check" CHECK("unit_system" IN ('metric', 'imperial')),
	CONSTRAINT "profile_locale_check" CHECK("locale" IN ('en', 'es'))
);
--> statement-breakpoint
CREATE TABLE `scan` (
	`id` text PRIMARY KEY,
	`created_at` text NOT NULL,
	`provider_id` text,
	`provider_label` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`hint` text,
	`result_json` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`repaired` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_scan_provider_id_ai_provider_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `ai_provider`(`id`) ON DELETE SET NULL,
	CONSTRAINT "scan_status_check" CHECK("status" IN ('ok', 'no_food', 'error'))
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_provider_one_active` ON `ai_provider` (`is_active`) WHERE "ai_provider"."is_active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `body_measurement_unique` ON `body_measurement` (`measured_on`,`kind`,`source`);--> statement-breakpoint
CREATE INDEX `body_measurement_kind_date_idx` ON `body_measurement` (`kind`,`measured_on`);--> statement-breakpoint
CREATE INDEX `food_usage_last_used_at_idx` ON `food_usage` (`last_used_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `goal_one_current` ON `goal` (`end_date`) WHERE "goal"."end_date" IS NULL;--> statement-breakpoint
CREATE INDEX `goal_start_date_idx` ON `goal` (`start_date`);--> statement-breakpoint
CREATE INDEX `meal_local_date_idx` ON `meal` (`local_date`);--> statement-breakpoint
CREATE INDEX `meal_item_meal_id_idx` ON `meal_item` (`meal_id`);