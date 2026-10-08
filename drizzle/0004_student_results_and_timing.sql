ALTER TABLE `interview_identities` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `elapsed_seconds` integer;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `result_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `result_message` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `result_published_at` text;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `result_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `candidate_reply` text;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `candidate_replied_at` text;