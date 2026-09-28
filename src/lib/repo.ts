import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  type BusyMap,
  type Coverage,
  coverage,
  isExpired,
  minutesUntilExpiry,
  type RoomInfo,
  type SegmentStatus,
  segmentStatus,
} from "./planner";
import {
  bookings,
  type DemoUser,
  demoUsers,
  type Invitation,
  invitations,
  type Library,
  libraries,
  type Plan,
  planSegments,
  plans,
  rooms,
} from "./schema";

export type RoomView = RoomInfo & { libraryName: string; libraryShort: string };

export function listUsers(): DemoUser[] {
  return db.select().from(demoUsers).orderBy(asc(demoUsers.sort)).all();
}

export function getUser(id: string): DemoUser | undefined {
  return db.select().from(demoUsers).where(eq(demoUsers.id, id)).get();
}

export function listLibraries(): Library[] {
  return db.select().from(libraries).orderBy(asc(libraries.sort)).all();
}

export function listRooms(): RoomView[] {
  return db
    .select({
      id: rooms.id,
      libraryId: rooms.libraryId,
      name: rooms.name,
      capacity: rooms.capacity,
      opensMin: rooms.opensMin,
      closesMin: rooms.closesMin,
      sort: rooms.sort,
      libraryName: libraries.name,
      libraryShort: libraries.shortName,
    })
    .from(rooms)
    .innerJoin(libraries, eq(rooms.libraryId, libraries.id))
    .orderBy(asc(libraries.sort), asc(rooms.sort))
    .all();
}

export function roomsById(): Map<string, RoomView> {
  return new Map(listRooms().map((r) => [r.id, r]));
}

export function busyFor(date: string): BusyMap {
  const busy: BusyMap = new Map();
  for (const b of db.select().from(bookings).where(eq(bookings.date, date)).all()) {
    const list = busy.get(b.roomId) ?? [];
    list.push({ start: b.startMin, end: b.endMin });
    busy.set(b.roomId, list);
  }
  return busy;
}

// Minutes of confirmed prototype bookings a demo user owns on a date.
export function confirmedMinutes(ownerId: string, date: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${bookings.endMin} - ${bookings.startMin}), 0)` })
    .from(bookings)
    .where(and(eq(bookings.ownerId, ownerId), eq(bookings.date, date)))
    .get();
  return Number(row?.total ?? 0);
}

export function getPlan(id: string): Plan | undefined {
  return db.select().from(plans).where(eq(plans.id, id)).get();
}

export function currentPlan(userId: string): Plan | undefined {
  return db
    .select()
    .from(plans)
    .where(and(eq(plans.organizerId, userId), eq(plans.status, "draft")))
    .orderBy(desc(sql`rowid`))
    .limit(1)
    .get();
}

export function latestInvites(segmentIds: string[]): Map<string, Invitation> {
  const map = new Map<string, Invitation>();
  if (!segmentIds.length) return map;
  const rows = db
    .select()
    .from(invitations)
    .where(inArray(invitations.segmentId, segmentIds))
    .orderBy(asc(sql`rowid`))
    .all();
  for (const row of rows) map.set(row.segmentId, row);
  return map;
}

export type SegmentView = {
  id: string;
  room: RoomView;
  start: number;
  end: number;
  ownerId: string | null;
  ownerName: string | null;
  status: SegmentStatus;
  invite?: Invitation & {
    inviteeName: string;
    expired: boolean;
    minutesLeft: number;
  };
};

export type PlanView = {
  plan: Plan;
  organizer: DemoUser;
  segments: SegmentView[];
  coverage: Coverage;
  displayStatus: "Draft" | "Pending approval" | "Ready to confirm" | "Confirmed" | "Failed";
  canConfirm: boolean;
  blockers: string[];
  organizerMinutes: number;
};

export function planView(planId: string, nowMs: number = Date.now()): PlanView | undefined {
  const plan = getPlan(planId);
  if (!plan) return undefined;
  const users = new Map(listUsers().map((u) => [u.id, u]));
  const organizer = users.get(plan.organizerId);
  if (!organizer) return undefined;
  const byId = roomsById();
  const segRows = db
    .select()
    .from(planSegments)
    .where(eq(planSegments.planId, planId))
    .orderBy(asc(planSegments.startMin))
    .all();
  const invites = latestInvites(segRows.map((s) => s.id));
  const confirmed = plan.status === "confirmed";

  const segments: SegmentView[] = segRows.flatMap((s) => {
    const room = byId.get(s.roomId);
    if (!room) return [];
    const inv = invites.get(s.id);
    return [
      {
        id: s.id,
        room,
        start: s.startMin,
        end: s.endMin,
        ownerId: s.ownerId,
        ownerName: s.ownerId ? (users.get(s.ownerId)?.name ?? null) : null,
        status: segmentStatus(
          {
            planConfirmed: confirmed,
            ownerId: s.ownerId,
            organizerId: plan.organizerId,
            latestInvite: inv,
          },
          nowMs,
        ),
        invite: inv
          ? {
              ...inv,
              inviteeName: users.get(inv.inviteeId)?.name ?? inv.inviteeId,
              expired: inv.status === "pending" && isExpired(inv.createdAtMs, nowMs),
              minutesLeft: minutesUntilExpiry(inv.createdAtMs, nowMs),
            }
          : undefined,
      },
    ];
  });

  const cov = coverage(
    segments.map((s) => ({ roomId: s.room.id, start: s.start, end: s.end })),
    byId,
    { start: plan.reqStartMin, end: plan.reqEndMin },
  );

  const blockers: string[] = [];
  if (!segments.length) blockers.push("Add at least one room segment.");
  const unowned = segments.filter((s) => !s.ownerId).length;
  if (unowned) {
    blockers.push(
      `${unowned} segment${unowned === 1 ? " needs" : "s need"} an approved teammate.`,
    );
  }

  const pending = segments.some((s) => s.status === "Pending approval");
  const displayStatus: PlanView["displayStatus"] = confirmed
    ? "Confirmed"
    : plan.lastError
      ? "Failed"
      : pending
        ? "Pending approval"
        : segments.length && !unowned
          ? "Ready to confirm"
          : "Draft";

  const organizerMinutes =
    confirmedMinutes(plan.organizerId, plan.date) +
    segments
      .filter((s) => s.ownerId === plan.organizerId && !confirmed)
      .reduce((sum, s) => sum + (s.end - s.start), 0);

  return {
    plan,
    organizer,
    segments,
    coverage: cov,
    displayStatus,
    canConfirm: !confirmed && blockers.length === 0,
    blockers,
    organizerMinutes,
  };
}

export function plansFor(userId: string): PlanView[] {
  const owned = db
    .selectDistinct({ id: planSegments.planId })
    .from(planSegments)
    .where(and(eq(planSegments.ownerId, userId), isNotNull(planSegments.ownerId)))
    .all()
    .map((r) => r.id);
  const rows = db
    .select({ id: plans.id })
    .from(plans)
    .where(
      owned.length
        ? or(eq(plans.organizerId, userId), inArray(plans.id, owned))
        : eq(plans.organizerId, userId),
    )
    .orderBy(desc(sql`rowid`))
    .all();
  const now = Date.now();
  return rows.flatMap((r) => {
    const view = planView(r.id, now);
    return view ? [view] : [];
  });
}

export type InvitationView = {
  invitation: Invitation;
  inviter: DemoUser;
  invitee: DemoUser;
  plan: Plan;
  segment: { id: string; start: number; end: number; ownerId: string | null };
  room: RoomView;
  expired: boolean;
  minutesLeft: number;
  expiresAtMs: number;
  inviteeDayMinutes: number;
  superseded: boolean;
};

export function invitationView(id: string, nowMs: number = Date.now()): InvitationView | undefined {
  const invitation = db.select().from(invitations).where(eq(invitations.id, id)).get();
  if (!invitation) return undefined;
  const plan = getPlan(invitation.planId);
  const seg = db.select().from(planSegments).where(eq(planSegments.id, invitation.segmentId)).get();
  const inviter = getUser(invitation.inviterId);
  const invitee = getUser(invitation.inviteeId);
  if (!plan || !seg || !inviter || !invitee) return undefined;
  const room = roomsById().get(seg.roomId);
  if (!room) return undefined;
  const assignedInPlans = db
    .select({ total: sql<number>`coalesce(sum(${planSegments.endMin} - ${planSegments.startMin}), 0)` })
    .from(planSegments)
    .innerJoin(plans, eq(planSegments.planId, plans.id))
    .where(
      and(
        eq(planSegments.ownerId, invitee.id),
        eq(plans.date, plan.date),
        eq(plans.status, "draft"),
      ),
    )
    .get();
  return {
    invitation,
    inviter,
    invitee,
    plan,
    segment: { id: seg.id, start: seg.startMin, end: seg.endMin, ownerId: seg.ownerId },
    room,
    expired: invitation.status === "pending" && isExpired(invitation.createdAtMs, nowMs),
    minutesLeft: minutesUntilExpiry(invitation.createdAtMs, nowMs),
    expiresAtMs: invitation.createdAtMs + 30 * 60_000,
    inviteeDayMinutes:
      confirmedMinutes(invitee.id, plan.date) + Number(assignedInPlans?.total ?? 0),
    superseded:
      invitation.status === "pending" &&
      (plan.status === "confirmed" || (seg.ownerId !== null && seg.ownerId !== invitee.id)),
  };
}

export function invitationsFor(userId: string, nowMs: number = Date.now()): InvitationView[] {
  return db
    .select({ id: invitations.id })
    .from(invitations)
    .where(eq(invitations.inviteeId, userId))
    .orderBy(desc(invitations.createdAtMs))
    .all()
    .flatMap((r) => {
      const view = invitationView(r.id, nowMs);
      return view ? [view] : [];
    });
}
