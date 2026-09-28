import { describe, expect, it } from "vitest";
import {
  type BusyMap,
  coverage,
  isExpired,
  type RoomInfo,
  segmentStatus,
  splitForOwner,
  suggest,
} from "../src/lib/planner";
import { fmtDuration, INVITE_TTL_MS } from "../src/lib/time";

const room = (id: string, libraryId: string, capacity = 6, sort = 0): RoomInfo => ({
  id,
  libraryId,
  name: id,
  capacity,
  opensMin: 8 * 60,
  closesMin: 20 * 60,
  sort,
});
const a = room("a", "chifley", 6, 1);
const b = room("b", "chifley", 4, 2);
const c = room("c", "menzies", 6, 3);
const rooms = [a, b, c];
const byId = new Map(rooms.map((r) => [r.id, r]));
const h = (x: number) => x * 60;

describe("coverage and room changes", () => {
  it("same room, consecutive segments: no break", () => {
    const cov = coverage(
      [
        { roomId: "a", start: h(13), end: h(15) },
        { roomId: "a", start: h(15), end: h(16) },
      ],
      byId,
      { start: h(13), end: h(16) },
    );
    expect(cov.usableMin).toBe(180);
    expect(cov.fullMatch).toBe(true);
  });

  it("a change within one library costs 5 minutes and is not a full match", () => {
    const cov = coverage(
      [
        { roomId: "a", start: h(13), end: h(14) },
        { roomId: "b", start: h(14), end: h(15) },
      ],
      byId,
      { start: h(13), end: h(15) },
    );
    expect(cov.bookedMin).toBe(120);
    expect(cov.usableMin).toBe(115);
    expect(cov.shortfallMin).toBe(5);
    expect(fmtDuration(cov.shortfallMin)).toBe("5 minutes");
    expect(cov.fullMatch).toBe(false);
  });

  it("a change between libraries costs 15 minutes", () => {
    const cov = coverage(
      [
        { roomId: "a", start: h(13), end: h(14) },
        { roomId: "c", start: h(14), end: h(15) },
      ],
      byId,
      { start: h(13), end: h(15) },
    );
    expect(cov.shortfallMin).toBe(15);
  });

  it("a gap between segments absorbs the walk", () => {
    const cov = coverage(
      [
        { roomId: "a", start: h(13), end: h(14) },
        { roomId: "c", start: h(14.5), end: h(15) },
      ],
      byId,
      { start: h(13), end: h(15) },
    );
    expect(cov.breaks).toEqual([]);
    expect(cov.uncoveredMin).toBe(30);
    expect(cov.usableMin).toBe(90);
  });
});

describe("suggestions", () => {
  it("prefers a single room covering the whole period", () => {
    const busy: BusyMap = new Map([["a", [{ start: h(14), end: h(15) }]]]);
    const options = suggest(rooms, busy, { start: h(13), end: h(15), people: 4 });
    expect(options[0].kind).toBe("full");
    expect(options.every((o) => o.kind === "full")).toBe(true);
    expect(options.map((o) => o.segments[0].roomId)).not.toContain("a");
  });

  it("orders splits same-library first, then less shortfall", () => {
    const busy: BusyMap = new Map([
      ["a", [{ start: h(14), end: h(16) }]],
      ["b", [{ start: h(12), end: h(14) }]],
      ["c", [{ start: h(14), end: h(16) }]],
    ]);
    const options = suggest(rooms, busy, { start: h(13), end: h(15), people: 4 });
    expect(options[0].kind).toBe("split");
    expect(options[0].segments.map((s) => s.roomId)).toEqual(["a", "b"]);
    expect(options[0].coverage.shortfallMin).toBe(5);
    expect(options.slice(1).every((o) => o.crossLibrary)).toBe(true);
  });

  it("respects capacity", () => {
    const options = suggest(rooms, new Map(), { start: h(13), end: h(15), people: 5 });
    expect(options.map((o) => o.segments[0].roomId)).toEqual(["a", "c"]);
  });

  it("returns nothing when no room has time", () => {
    const allDay = [{ start: h(8), end: h(20) }];
    const busy: BusyMap = new Map(rooms.map((r) => [r.id, allDay]));
    expect(suggest(rooms, busy, { start: h(13), end: h(15), people: 2 })).toEqual([]);
  });
});

describe("ownership and invitations", () => {
  it("the organiser owns up to their remaining allowance; the rest needs teammates", () => {
    expect(splitForOwner(h(13), h(16), 120)).toEqual([
      { start: h(13), end: h(15), forOrganizer: true },
      { start: h(15), end: h(16), forOrganizer: false },
    ]);
    expect(splitForOwner(h(13), h(15), 0)).toEqual([{ start: h(13), end: h(15), forOrganizer: false }]);
    expect(splitForOwner(h(9), h(14), 60).map((c) => c.end - c.start)).toEqual([60, 120, 120]);
  });

  it("invitations expire exactly 30 minutes after creation", () => {
    expect(isExpired(0, INVITE_TTL_MS - 1)).toBe(false);
    expect(isExpired(0, INVITE_TTL_MS)).toBe(true);
  });

  it("derives segment status without ever saying booked before confirmation", () => {
    const base = { planConfirmed: false, organizerId: "a" };
    expect(segmentStatus({ ...base, ownerId: "a" }, 0)).toBe("Assigned");
    expect(segmentStatus({ ...base, ownerId: null }, 0)).toBe("Needs teammate");
    expect(segmentStatus({ ...base, ownerId: null, latestInvite: { status: "pending", createdAtMs: 0 } }, 1)).toBe(
      "Pending approval",
    );
    expect(
      segmentStatus({ ...base, ownerId: null, latestInvite: { status: "pending", createdAtMs: 0 } }, INVITE_TTL_MS),
    ).toBe("Expired");
    expect(segmentStatus({ ...base, ownerId: "b" }, 0)).toBe("Approved");
    expect(segmentStatus({ ...base, ownerId: "b", planConfirmed: true }, 0)).toBe("Confirmed");
  });
});
