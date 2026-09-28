import { DAILY_LIMIT_MIN, INVITE_TTL_MS, SLOT_MIN } from "./time";

// Pure scheduling rules — no database access, so they are unit-tested
// directly in spec/planner.test.ts and reused by the server actions.

export type Interval = { start: number; end: number };

export type RoomInfo = {
  id: string;
  libraryId: string;
  name: string;
  capacity: number;
  opensMin: number;
  closesMin: number;
  sort: number;
};

export type BusyMap = Map<string, Interval[]>;

export type Request = { start: number; end: number; people: number };

export type SegmentLike = { roomId: string; start: number; end: number };

export const SAME_LIBRARY_CHANGE_MIN = 5;
export const CROSS_LIBRARY_CHANGE_MIN = 15;

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function isFree(room: RoomInfo, busy: BusyMap, start: number, end: number): boolean {
  if (start >= end || start < room.opensMin || end > room.closesMin) return false;
  return !(busy.get(room.id) ?? []).some((b) => overlaps(b, { start, end }));
}

export function freeIntervals(room: RoomInfo, busy: BusyMap): Interval[] {
  const taken = [...(busy.get(room.id) ?? [])].sort((a, b) => a.start - b.start);
  const free: Interval[] = [];
  let cursor = room.opensMin;
  for (const b of taken) {
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, room.closesMin) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < room.closesMin) free.push({ start: cursor, end: room.closesMin });
  return free.filter((i) => i.end > i.start);
}

export function changeMinutes(a: RoomInfo, b: RoomInfo): number {
  if (a.id === b.id) return 0;
  return a.libraryId === b.libraryId ? SAME_LIBRARY_CHANGE_MIN : CROSS_LIBRARY_CHANGE_MIN;
}

export type Break = { afterIndex: number; minutes: number; crossLibrary: boolean };

export type Coverage = {
  bookedMin: number;
  usableMin: number;
  requestedMin: number;
  shortfallMin: number;
  uncoveredMin: number;
  breaks: Break[];
  roomChanges: number;
  fullMatch: boolean;
};

// Usable discussion time is time spent in a booked room inside the request,
// minus the walk between rooms that a gap between segments doesn't absorb.
export function coverage(
  segments: SegmentLike[],
  roomsById: Map<string, RoomInfo>,
  req: Interval,
): Coverage {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const requestedMin = Math.max(0, req.end - req.start);
  let bookedMin = 0;
  let insideMin = 0;
  const breaks: Break[] = [];
  let roomChanges = 0;

  sorted.forEach((seg, i) => {
    bookedMin += seg.end - seg.start;
    insideMin += Math.max(0, Math.min(seg.end, req.end) - Math.max(seg.start, req.start));
    const next = sorted[i + 1];
    if (!next) return;
    const a = roomsById.get(seg.roomId);
    const b = roomsById.get(next.roomId);
    if (!a || !b || a.id === b.id) return;
    roomChanges++;
    const travel = changeMinutes(a, b);
    const gap = Math.max(0, next.start - seg.end);
    const minutes = Math.max(0, travel - gap);
    if (minutes > 0) {
      breaks.push({ afterIndex: i, minutes, crossLibrary: a.libraryId !== b.libraryId });
    }
  });

  const breakMin = breaks.reduce((sum, b) => sum + b.minutes, 0);
  const usableMin = Math.max(0, insideMin - breakMin);
  return {
    bookedMin,
    usableMin,
    requestedMin,
    shortfallMin: Math.max(0, requestedMin - usableMin),
    uncoveredMin: Math.max(0, requestedMin - insideMin),
    breaks,
    roomChanges,
    fullMatch: sorted.length > 0 && usableMin >= requestedMin,
  };
}

export type Option = {
  kind: "full" | "split" | "partial";
  segments: SegmentLike[];
  coverage: Coverage;
  crossLibrary: boolean;
};

// Single rooms that cover the whole request first; otherwise a few simple
// two-room splits (fewer changes, same library first, less shortfall);
// otherwise the longest partial stretch. Deliberately not a route optimiser.
export function suggest(
  rooms: RoomInfo[],
  busy: BusyMap,
  req: Request,
  limit = 3,
): Option[] {
  const eligible = rooms
    .filter((r) => r.capacity >= req.people)
    .sort((a, b) => a.sort - b.sort);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const window = { start: req.start, end: req.end };
  const make = (kind: Option["kind"], segments: SegmentLike[]): Option => {
    const [a, b] = segments.map((s) => byId.get(s.roomId));
    return {
      kind,
      segments,
      coverage: coverage(segments, byId, window),
      crossLibrary: !!a && !!b && a.libraryId !== b.libraryId,
    };
  };

  const full = eligible
    .filter((r) => isFree(r, busy, req.start, req.end))
    .map((r) => make("full", [{ roomId: r.id, start: req.start, end: req.end }]));
  if (full.length) return full.slice(0, limit);

  const splits: Option[] = [];
  for (let t = req.start + SLOT_MIN; t < req.end; t += SLOT_MIN) {
    for (const a of eligible) {
      if (!isFree(a, busy, req.start, t)) continue;
      for (const b of eligible) {
        if (b.id === a.id || !isFree(b, busy, t, req.end)) continue;
        splits.push(
          make("split", [
            { roomId: a.id, start: req.start, end: t },
            { roomId: b.id, start: t, end: req.end },
          ]),
        );
      }
    }
  }
  if (splits.length) {
    splits.sort(
      (x, y) =>
        Number(x.crossLibrary) - Number(y.crossLibrary) ||
        x.coverage.shortfallMin - y.coverage.shortfallMin ||
        (byId.get(x.segments[0].roomId)?.sort ?? 0) - (byId.get(y.segments[0].roomId)?.sort ?? 0) ||
        (byId.get(x.segments[1].roomId)?.sort ?? 0) - (byId.get(y.segments[1].roomId)?.sort ?? 0),
    );
    const picked: Option[] = [];
    const seenPairs = new Set<string>();
    for (const option of splits) {
      const key = option.segments.map((s) => s.roomId).join(">");
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      picked.push(option);
      if (picked.length === limit) break;
    }
    return picked;
  }

  const partials: Option[] = [];
  for (const r of eligible) {
    for (const f of freeIntervals(r, busy)) {
      const start = Math.max(f.start, req.start);
      const end = Math.min(f.end, req.end);
      if (end - start >= SLOT_MIN) partials.push(make("partial", [{ roomId: r.id, start, end }]));
    }
  }
  partials.sort((x, y) => x.coverage.shortfallMin - y.coverage.shortfallMin);
  return partials.slice(0, limit);
}

// When the organiser adds a stretch of time, they own as much as their
// remaining daily allowance covers; the rest becomes segments of at most
// two hours that need a teammate's approval. Nobody transfers quota.
export function splitForOwner(
  start: number,
  end: number,
  remainingMin: number,
): { start: number; end: number; forOrganizer: boolean }[] {
  const chunks: { start: number; end: number; forOrganizer: boolean }[] = [];
  let cursor = start;
  const own = Math.max(0, Math.min(remainingMin, end - start));
  const ownAligned = own - (own % SLOT_MIN);
  if (ownAligned > 0) {
    chunks.push({ start: cursor, end: cursor + ownAligned, forOrganizer: true });
    cursor += ownAligned;
  }
  while (cursor < end) {
    const next = Math.min(end, cursor + DAILY_LIMIT_MIN);
    chunks.push({ start: cursor, end: next, forOrganizer: false });
    cursor = next;
  }
  return chunks;
}

export function isExpired(createdAtMs: number, nowMs: number): boolean {
  return nowMs >= createdAtMs + INVITE_TTL_MS;
}

export function minutesUntilExpiry(createdAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((createdAtMs + INVITE_TTL_MS - nowMs) / 60_000));
}

export type SegmentStatus =
  | "Cancelled"
  | "Confirmed"
  | "Assigned"
  | "Approved"
  | "Pending approval"
  | "Declined"
  | "Expired"
  | "Needs teammate";

export function segmentStatus(
  input: {
    planConfirmed: boolean;
    cancelled?: boolean;
    ownerId: string | null;
    organizerId: string;
    latestInvite?: { status: "pending" | "accepted" | "declined"; createdAtMs: number };
  },
  nowMs: number,
): SegmentStatus {
  if (input.cancelled) return "Cancelled";
  if (input.planConfirmed) return "Confirmed";
  if (input.ownerId === input.organizerId) return "Assigned";
  if (input.ownerId) return "Approved";
  const inv = input.latestInvite;
  if (!inv) return "Needs teammate";
  if (inv.status === "declined") return "Declined";
  if (inv.status === "pending") {
    return isExpired(inv.createdAtMs, nowMs) ? "Expired" : "Pending approval";
  }
  return "Needs teammate";
}
