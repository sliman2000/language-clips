CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`score` integer NOT NULL,
	`correct` integer NOT NULL,
	`total` integer NOT NULL,
	`passed` integer NOT NULL,
	`results` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attempts_user_idx` ON `attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_lesson_idx` ON `attempts` (`lesson_id`);--> statement-breakpoint
CREATE TABLE `expressions` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`position` integer NOT NULL,
	`phrase` text NOT NULL,
	`meaning` text NOT NULL,
	`example` text DEFAULT '' NOT NULL,
	`line_id` text,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expressions_lesson_idx` ON `expressions` (`lesson_id`,`position`);--> statement-breakpoint
CREATE TABLE `learners` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`stars` integer DEFAULT 0 NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_study_day` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`language` text NOT NULL,
	`level` text NOT NULL,
	`topic` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`clip_key` text,
	`clip_type` text,
	`clip_size` integer,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lessons_published_idx` ON `lessons` (`published`);--> statement-breakpoint
CREATE TABLE `lines` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`position` integer NOT NULL,
	`start` real NOT NULL,
	`end` real NOT NULL,
	`text` text NOT NULL,
	`translation` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lines_lesson_idx` ON `lines` (`lesson_id`,`position`);--> statement-breakpoint
CREATE TABLE `progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`best_score` integer NOT NULL,
	`completed_at` text,
	`stars_earned` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `lesson_id`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `saved` (
	`user_id` text NOT NULL,
	`expression_id` text NOT NULL,
	`learned` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`user_id`, `expression_id`),
	FOREIGN KEY (`expression_id`) REFERENCES `expressions`(`id`) ON UPDATE no action ON DELETE cascade
);
