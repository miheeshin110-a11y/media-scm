CREATE TABLE `scm_finance` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	`request_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`lease_token` text,
	`lease_until` integer
);
--> statement-breakpoint
CREATE TABLE `scm_finance_revisions` (
	`request_id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`actor` text NOT NULL,
	`before_payload` text NOT NULL,
	`after_payload` text NOT NULL,
	`created_at` text NOT NULL
);
