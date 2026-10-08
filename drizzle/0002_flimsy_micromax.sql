CREATE TABLE `interview_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`form_version` text NOT NULL,
	`code_hash` text NOT NULL,
	`applicant_name` text NOT NULL,
	`student_id` text NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`year` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`code_issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`issued_by_user_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_interview_invitation_code` ON `interview_invitations` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_interview_invitation_student` ON `interview_invitations` (`form_version`,`student_id`);--> statement-breakpoint
ALTER TABLE `interview_audit_events` ADD `invitation_id` text REFERENCES interview_invitations(id);--> statement-breakpoint
ALTER TABLE `interview_identities` ADD `invitation_id` text REFERENCES interview_invitations(id);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_interview_identity_invitation` ON `interview_identities` (`invitation_id`);