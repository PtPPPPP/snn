CREATE TABLE `interview_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text,
	`submission_id` text,
	`action` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `interview_identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `interview_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_interview_audit_submission` ON `interview_audit_events` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `interview_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`form_version` text NOT NULL,
	`user_id` text NOT NULL,
	`device_hash` text,
	`applicant_name` text NOT NULL,
	`student_id` text NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_interview_identity_user` ON `interview_identities` (`form_version`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_interview_identity_device` ON `interview_identities` (`form_version`,`device_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_interview_identity_student` ON `interview_identities` (`form_version`,`student_id`);--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `identity_id` text REFERENCES interview_identities(id);--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `review_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `interview_submissions` ADD `reviewed_by_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_interview_submission_identity` ON `interview_submissions` (`identity_id`);