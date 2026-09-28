CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`date` text NOT NULL,
	`start_min` integer NOT NULL,
	`end_min` integer NOT NULL,
	`owner_id` text,
	`plan_id` text,
	`source` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `demo_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bookings_room_date_idx` ON `bookings` (`room_id`,`date`);--> statement-breakpoint
CREATE INDEX `bookings_owner_date_idx` ON `bookings` (`owner_id`,`date`);--> statement-breakpoint
CREATE TABLE `demo_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `demo_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`segment_id` text NOT NULL,
	`inviter_id` text NOT NULL,
	`invitee_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at_ms` integer NOT NULL,
	`responded_at_ms` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`segment_id`) REFERENCES `plan_segments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `demo_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invitee_id`) REFERENCES `demo_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invitations_segment_idx` ON `invitations` (`segment_id`);--> statement-breakpoint
CREATE INDEX `invitations_invitee_idx` ON `invitations` (`invitee_id`);--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`room_id` text NOT NULL,
	`start_min` integer NOT NULL,
	`end_min` integer NOT NULL,
	`owner_id` text,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `demo_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_segments_plan_idx` ON `plan_segments` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`organizer_id` text NOT NULL,
	`date` text NOT NULL,
	`req_start_min` integer NOT NULL,
	`req_end_min` integer NOT NULL,
	`people` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`organizer_id`) REFERENCES `demo_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`opens_min` integer NOT NULL,
	`closes_min` integer NOT NULL,
	`sort` integer NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE no action
);
