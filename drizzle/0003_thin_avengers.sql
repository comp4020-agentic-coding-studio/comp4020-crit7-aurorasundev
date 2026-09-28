ALTER TABLE `demo_users` ADD `student_number` text;--> statement-breakpoint
CREATE UNIQUE INDEX `demo_users_student_number_idx` ON `demo_users` (`student_number`);--> statement-breakpoint
ALTER TABLE `plan_segments` ADD `cancelled_at` text;