import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { bus } from "./events";
import { coverage, isExpired, isFree, overlaps, splitForOwner } from "./planner";
import {
  busyFor,
  confirmedMinutes,
  currentPlan,
  getPlan,
  getUser,
  latestInvites,
  roomsById,
} from "./repo";
import { bookings, invitations, type Plan, planSegments, plans } from "./schema";
import {
  DAILY_LIMIT_MIN,
  fmtDate,
  fmtDuration,
  fmtRange,
  inDemoWindow,
  SLOT_MIN,
  sydneyToday,
} from "./time";

// Every rule the interface shows is enforced again here; the UI is never
// the only guard.

export class ActionError extends Error {}

function fail(message: string): never {
  throw new ActionError(message);
}

export function notify(userIds: string[], planId?: string) {
  bus.emit("change", { users: [...new Set(userIds)], planId });
}

function ownPlan(userId: string, planId: string): Plan {
  const plan = getPlan(planId);
  if (!plan) fail("That plan no longer exists.");
  if (plan.organizerId !== userId) fail("Only the plan's organiser can change it.");
  if (plan.status === "confirmed") fail("This plan is already confirmed and can't be edited.");
  return plan;
}

function segmentsOf(planId: string) {
  return db.select().from(planSegments).where(eq(planSegments.planId, planId)).all();
}

function aligned(min: number) {
  return Number.isInteger(min) && min % SLOT_MIN === 0;
}

export type AddInput = {
  date: string;
  reqStart: number;
  reqEnd: number;
  people: number;
  roomId: string;
  start: number;
  end: number;
};

export function newPlan(userId: string, input: Omit<AddInput, "roomId" | "start" | "end">): Plan {
  if (!inDemoWindow(input.date)) fail("Choose a date inside the demo window.");
  return db
    .insert(plans)
    .values({
      id: randomUUID(),
      organizerId: userId,
      date: input.date,
      reqStartMin: input.reqStart,
      reqEndMin: input.reqEnd,
      people: input.people,
    })
    .returning()
    .get();
}

export function addSegment(userId: string, input: AddInput): Plan {
  const { date, roomId, start, end } = input;
  if (!inDemoWindow(date)) fail("Choose a date inside the demo window.");
  if (!aligned(start) || !aligned(end) || start >= end) {
    fail("Choose a start and end on the half hour, with the end after the start.");
  }
  const room = roomsById().get(roomId);
  if (!room) fail("That room doesn't exist in this prototype.");
  if (input.people > room.capacity) {
    fail(`${room.name} seats ${room.capacity}; your group has ${input.people} people.`);
  }
  if (start < room.opensMin || end > room.closesMin) {
    fail(`${room.name} is only bookable ${fmtRange(room.opensMin, room.closesMin)}.`);
  }
  if (!isFree(room, busyFor(date), start, end)) {
    fail(`${room.name} is not available for ${fmtRange(start, end)}.`);
  }

  return db.transaction(() => {
    let plan = currentPlan(userId) ?? newPlan(userId, input);
    const existing = segmentsOf(plan.id);
    if (existing.length && plan.date !== date) {
      fail(
        `Your current plan is for ${fmtDate(plan.date)}. Remove its segments or start a new plan to use ${fmtDate(date)}.`,
      );
    }
    if (existing.length && input.people > plan.people) {
      plan = db
        .update(plans)
        .set({ people: input.people })
        .where(eq(plans.id, plan.id))
        .returning()
        .get();
    }
    if (!existing.length) {
      plan = db
        .update(plans)
        .set({
          date,
          reqStartMin: input.reqStart,
          reqEndMin: input.reqEnd,
          people: input.people,
        })
        .where(eq(plans.id, plan.id))
        .returning()
        .get();
    }
    const clash = existing.find((s) => overlaps({ start: s.startMin, end: s.endMin }, { start, end }));
    if (clash) {
      fail(`Your plan already has a segment at ${fmtRange(clash.startMin, clash.endMin)}.`);
    }

    const ownedInPlan = existing
      .filter((s) => s.ownerId === userId)
      .reduce((sum, s) => sum + (s.endMin - s.startMin), 0);
    const remaining = DAILY_LIMIT_MIN - confirmedMinutes(userId, date) - ownedInPlan;
    for (const c of splitForOwner(start, end, remaining)) {
      const ownerId = c.forOrganizer ? userId : null;
      // Adjacent half-hours in the same room for the organiser grow one
      // segment instead of stacking many.
      const neighbour = c.forOrganizer
        ? existing.find(
            (s) =>
              s.roomId === roomId &&
              s.ownerId === userId &&
              (s.endMin === c.start || s.startMin === c.end),
          )
        : undefined;
      if (neighbour) {
        const merged = {
          startMin: Math.min(neighbour.startMin, c.start),
          endMin: Math.max(neighbour.endMin, c.end),
        };
        db.update(planSegments).set(merged).where(eq(planSegments.id, neighbour.id)).run();
        Object.assign(neighbour, merged);
        continue;
      }
      db.insert(planSegments)
        .values({ id: randomUUID(), planId: plan.id, roomId, startMin: c.start, endMin: c.end, ownerId })
        .run();
    }
    return db
      .update(plans)
      .set({ lastError: null })
      .where(eq(plans.id, plan.id))
      .returning()
      .get();
  });
}

export function removeSegment(userId: string, segmentId: string): Plan {
  const seg = db.select().from(planSegments).where(eq(planSegments.id, segmentId)).get();
  if (!seg) fail("That segment has already been removed.");
  const plan = ownPlan(userId, seg.planId);
  const invitees = db
    .select({ id: invitations.inviteeId })
    .from(invitations)
    .where(eq(invitations.segmentId, segmentId))
    .all()
    .map((r) => r.id);
  db.delete(planSegments).where(eq(planSegments.id, segmentId)).run();
  db.update(plans).set({ lastError: null }).where(eq(plans.id, plan.id)).run();
  notify([userId, ...invitees], plan.id);
  return plan;
}

export function takeSegment(userId: string, segmentId: string): Plan {
  const seg = db.select().from(planSegments).where(eq(planSegments.id, segmentId)).get();
  if (!seg) fail("That segment has been removed.");
  const plan = ownPlan(userId, seg.planId);
  if (seg.ownerId) fail("This segment already has an owner.");
  const inv = latestInvites([seg.id]).get(seg.id);
  if (inv?.status === "pending" && !isExpired(inv.createdAtMs, Date.now())) {
    fail("An invitation for this segment is still pending.");
  }
  const owned = segmentsOf(plan.id)
    .filter((s) => s.ownerId === userId)
    .reduce((sum, s) => sum + (s.endMin - s.startMin), 0);
  const total = confirmedMinutes(userId, plan.date) + owned + (seg.endMin - seg.startMin);
  if (total > DAILY_LIMIT_MIN) {
    fail(`Taking this segment would give you ${fmtDuration(total)} that day; the limit is 2 hours.`);
  }
  db.update(planSegments).set({ ownerId: userId }).where(eq(planSegments.id, seg.id)).run();
  return plan;
}

export function invite(userId: string, segmentId: string, inviteeId: string) {
  const seg = db.select().from(planSegments).where(eq(planSegments.id, segmentId)).get();
  if (!seg) fail("That segment has been removed.");
  const plan = ownPlan(userId, seg.planId);
  if (inviteeId === userId) fail("Invite a teammate other than yourself.");
  if (!getUser(inviteeId)) fail("Choose a demo teammate.");
  if (seg.ownerId) fail("This segment already has an owner.");
  const inv = latestInvites([seg.id]).get(seg.id);
  if (inv?.status === "pending" && !isExpired(inv.createdAtMs, Date.now())) {
    fail("An invitation for this segment is already pending.");
  }
  const created = db
    .insert(invitations)
    .values({
      id: randomUUID(),
      planId: plan.id,
      segmentId: seg.id,
      inviterId: userId,
      inviteeId,
      createdAtMs: Date.now(),
    })
    .returning()
    .get();
  notify([userId, inviteeId], plan.id);
  return created;
}

export function respond(userId: string, invitationId: string, accept: boolean) {
  const inv = db.select().from(invitations).where(eq(invitations.id, invitationId)).get();
  if (!inv) fail("That invitation no longer exists.");
  if (inv.inviteeId !== userId) fail("Only the invited teammate can answer this invitation.");
  if (inv.status !== "pending") fail(`This invitation was already ${inv.status}.`);
  if (isExpired(inv.createdAtMs, Date.now())) fail("This invitation has expired.");
  const plan = getPlan(inv.planId);
  const seg = db.select().from(planSegments).where(eq(planSegments.id, inv.segmentId)).get();
  if (!plan || !seg) fail("The plan for this invitation has changed.");
  if (plan.status === "confirmed") fail("This plan has already been confirmed.");
  if (seg.ownerId) fail("Someone already took responsibility for this segment.");

  if (accept) {
    const ownedSameDay = db
      .select()
      .from(planSegments)
      .innerJoin(plans, eq(planSegments.planId, plans.id))
      .where(
        and(
          eq(planSegments.ownerId, userId),
          eq(plans.date, plan.date),
          eq(plans.status, "draft"),
        ),
      )
      .all()
      .reduce((sum, r) => sum + (r.plan_segments.endMin - r.plan_segments.startMin), 0);
    const total =
      confirmedMinutes(userId, plan.date) + ownedSameDay + (seg.endMin - seg.startMin);
    if (total > DAILY_LIMIT_MIN) {
      fail(
        `Accepting would give you ${fmtDuration(total)} of bookings that day; the limit is 2 hours.`,
      );
    }
  }

  db.transaction(() => {
    db.update(invitations)
      .set({ status: accept ? "accepted" : "declined", respondedAtMs: Date.now() })
      .where(eq(invitations.id, inv.id))
      .run();
    if (accept) {
      db.update(planSegments).set({ ownerId: userId }).where(eq(planSegments.id, seg.id)).run();
    }
  });
  notify([userId, inv.inviterId], plan.id);
}

// One transaction: every approval, capacity, window, overlap and daily-limit
// check runs first, then every reservation is written and the plan marked
// confirmed — or nothing is written at all.
export function confirmPlan(userId: string, planId: string, acceptShort: boolean) {
  const plan = getPlan(planId);
  if (!plan) fail("That plan no longer exists.");
  if (plan.organizerId !== userId) fail("Only the plan's organiser can confirm it.");
  if (plan.status === "confirmed") return { alreadyConfirmed: true };

  try {
    db.transaction(
      (tx) => {
        const fresh = tx.select().from(plans).where(eq(plans.id, planId)).get();
        if (fresh?.status === "confirmed") return;
        const segs = tx.select().from(planSegments).where(eq(planSegments.planId, planId)).all();
        if (!segs.length) fail("Add at least one room segment before confirming.");
        if (!inDemoWindow(plan.date) || plan.date < sydneyToday()) {
          fail("This plan's date is outside the demo window. Start a fresh search.");
        }
        const rooms = roomsById();
        const busy = busyFor(plan.date);
        const totals = new Map<string, number>();
        for (const s of segs.sort((a, b) => a.startMin - b.startMin)) {
          const room = rooms.get(s.roomId);
          const when = `${fmtRange(s.startMin, s.endMin)} in ${room?.name ?? s.roomId}`;
          if (!room) fail(`The room for ${when} no longer exists.`);
          if (!s.ownerId) fail(`${when} has no approved owner yet.`);
          if (plan.people > room.capacity) {
            fail(`${room.name} seats ${room.capacity}, fewer than your ${plan.people} people.`);
          }
          if (s.startMin < room.opensMin || s.endMin > room.closesMin) {
            fail(`${when} is outside the room's bookable hours.`);
          }
          if (!isFree(room, busy, s.startMin, s.endMin)) {
            fail(`${when} was reserved by someone else. No bookings were made.`);
          }
          totals.set(s.ownerId, (totals.get(s.ownerId) ?? 0) + (s.endMin - s.startMin));
        }
        for (const [ownerId, minutes] of totals) {
          const total = confirmedMinutes(ownerId, plan.date) + minutes;
          if (total > DAILY_LIMIT_MIN) {
            const name = getUser(ownerId)?.name ?? ownerId;
            fail(
              `${name} would have ${fmtDuration(total)} of bookings on ${fmtDate(plan.date)}; the daily limit is 2 hours.`,
            );
          }
        }
        const cov = coverage(
          segs.map((s) => ({ roomId: s.roomId, start: s.startMin, end: s.endMin })),
          rooms,
          { start: plan.reqStartMin, end: plan.reqEndMin },
        );
        if (cov.shortfallMin > 0 && !acceptShort) {
          fail(
            `This plan is ${fmtDuration(cov.shortfallMin)} short of your requested time. Confirm it as a partial plan or change it.`,
          );
        }
        tx.insert(bookings)
          .values(
            segs.map((s) => ({
              roomId: s.roomId,
              date: plan.date,
              startMin: s.startMin,
              endMin: s.endMin,
              ownerId: s.ownerId,
              planId: plan.id,
              source: "plan" as const,
            })),
          )
          .run();
        tx.update(plans)
          .set({ status: "confirmed", confirmedAt: new Date().toISOString(), lastError: null })
          .where(eq(plans.id, plan.id))
          .run();
      },
      { behavior: "immediate" },
    );
  } catch (error) {
    if (error instanceof ActionError) {
      db.update(plans).set({ lastError: error.message }).where(eq(plans.id, plan.id)).run();
    }
    throw error;
  }
  const owners = segmentsOf(plan.id).flatMap((s) => (s.ownerId ? [s.ownerId] : []));
  notify([userId, ...owners], plan.id);
  return { alreadyConfirmed: false };
}
