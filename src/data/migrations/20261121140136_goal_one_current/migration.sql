DROP INDEX `goal_one_current`;--> statement-breakpoint
CREATE UNIQUE INDEX `goal_one_current` ON `goal` ((1)) WHERE "goal"."end_date" IS NULL;