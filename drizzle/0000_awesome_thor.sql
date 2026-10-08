CREATE TABLE `interview_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_version` text NOT NULL,
	`applicant_name` text NOT NULL,
	`student_id` text NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`track` text NOT NULL,
	`questions_json` text NOT NULL,
	`answers_json` text NOT NULL,
	`submitted_at` text NOT NULL,
	`grades_json` text DEFAULT '{}' NOT NULL,
	`total_score` real,
	`feedback` text DEFAULT '' NOT NULL,
	`reviewed_by` text DEFAULT '' NOT NULL,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_interview_version_student` ON `interview_submissions` (`form_version`,`student_id`);