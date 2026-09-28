import { sql } from "drizzle-orm";
import { index, int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts). Never edit the database by hand.
//
// Dates are Australia/Sydney calendar dates as "YYYY-MM-DD"; times of day
// are minutes since local midnight. Availability is never stored: it is a
// room's opening window minus its rows in `bookings`.

export const demoUsers = sqliteTable(
  "demo_users",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    // fictional uIDs in a range chosen not to look like real ANU numbers
    studentNumber: text("student_number"),
    sort: int().notNull(),
  },
  (t) => [uniqueIndex("demo_users_student_number_idx").on(t.studentNumber)],
);

export const libraries = sqliteTable("libraries", {
  id: text().primaryKey(),
  name: text().notNull(),
  shortName: text("short_name").notNull(),
  sort: int().notNull(),
});

export const rooms = sqliteTable("rooms", {
  id: text().primaryKey(),
  libraryId: text("library_id")
    .notNull()
    .references(() => libraries.id),
  name: text().notNull(),
  capacity: int().notNull(),
  opensMin: int("opens_min").notNull(),
  closesMin: int("closes_min").notNull(),
  sort: int().notNull(),
});

export const plans = sqliteTable("plans", {
  id: text().primaryKey(),
  organizerId: text("organizer_id")
    .notNull()
    .references(() => demoUsers.id),
  date: text().notNull(),
  reqStartMin: int("req_start_min").notNull(),
  reqEndMin: int("req_end_min").notNull(),
  people: int().notNull(),
  // draft → confirmed → cancelled. "Pending" and "Failed" are derived for
  // display from invitations and last_error, so a failed plan stays an
  // editable draft.
  status: text({ enum: ["draft", "confirmed", "cancelled"] })
    .notNull()
    .default("draft"),
  lastError: text("last_error"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  confirmedAt: text("confirmed_at"),
});

export const planSegments = sqliteTable(
  "plan_segments",
  {
    id: text().primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    startMin: int("start_min").notNull(),
    endMin: int("end_min").notNull(),
    // null until a teammate accepts responsibility for the segment
    ownerId: text("owner_id").references(() => demoUsers.id),
    // set when a confirmed segment's reservation is cancelled
    cancelledAt: text("cancelled_at"),
  },
  (t) => [index("plan_segments_plan_idx").on(t.planId)],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text().primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    segmentId: text("segment_id")
      .notNull()
      .references(() => planSegments.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => demoUsers.id),
    inviteeId: text("invitee_id")
      .notNull()
      .references(() => demoUsers.id),
    // "expired" is computed on read from created_at_ms + 30 minutes
    status: text({ enum: ["pending", "accepted", "declined"] })
      .notNull()
      .default("pending"),
    createdAtMs: int("created_at_ms").notNull(),
    respondedAtMs: int("responded_at_ms"),
  },
  (t) => [
    index("invitations_segment_idx").on(t.segmentId),
    index("invitations_invitee_idx").on(t.inviteeId),
  ],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: int().primaryKey({ autoIncrement: true }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    date: text().notNull(),
    startMin: int("start_min").notNull(),
    endMin: int("end_min").notNull(),
    // null for seeded background reservations by people outside the demo
    ownerId: text("owner_id").references(() => demoUsers.id),
    planId: text("plan_id").references(() => plans.id, { onDelete: "set null" }),
    source: text({ enum: ["seed", "plan"] }).notNull(),
  },
  (t) => [
    index("bookings_room_date_idx").on(t.roomId, t.date),
    index("bookings_owner_date_idx").on(t.ownerId, t.date),
  ],
);

export const demoMeta = sqliteTable("demo_meta", {
  key: text().primaryKey(),
  value: text().notNull(),
});

export type DemoUser = typeof demoUsers.$inferSelect;
export type Library = typeof libraries.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanSegment = typeof planSegments.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
