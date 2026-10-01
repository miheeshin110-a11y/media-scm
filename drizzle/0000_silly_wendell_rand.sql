CREATE TABLE `scm_outbox` (
	`record_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`lease_token` text,
	`lease_until` integer,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scm_records` (
	`row_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scm_records_id_unique` ON `scm_records` (`id`);--> statement-breakpoint
CREATE TABLE `scm_revisions` (
	`request_id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`version` integer NOT NULL,
	`actor` text NOT NULL,
	`request_hash` text NOT NULL,
	`before_payload` text,
	`after_payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scm_revision_record_version` ON `scm_revisions` (`record_id`,`version`);