CREATE TABLE `food_collection` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`file_name` text,
	`imported_at` text NOT NULL,
	`food_count` integer NOT NULL,
	`preset_id` text,
	`basis` text DEFAULT 'g' NOT NULL,
	CONSTRAINT "food_collection_basis_check" CHECK("basis" IN ('g', 'ml')),
	CONSTRAINT "food_collection_count_check" CHECK("food_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `imported_food` (
	`seq` integer PRIMARY KEY,
	`id` text NOT NULL UNIQUE,
	`collection_id` text NOT NULL,
	`name` text NOT NULL,
	`food_group` text,
	`per_100g_json` text NOT NULL,
	CONSTRAINT `fk_imported_food_collection_id_food_collection_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `food_collection`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `imported_food_token` (
	`term` text NOT NULL,
	`food_seq` integer NOT NULL,
	CONSTRAINT `imported_food_token_pk` PRIMARY KEY(`term`, `food_seq`),
	CONSTRAINT `fk_imported_food_token_food_seq_imported_food_seq_fk` FOREIGN KEY (`food_seq`) REFERENCES `imported_food`(`seq`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `imported_food_collection_idx` ON `imported_food` (`collection_id`);--> statement-breakpoint
CREATE INDEX `imported_food_token_seq_idx` ON `imported_food_token` (`food_seq`);