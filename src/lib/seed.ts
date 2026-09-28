import { and, eq } from "drizzle-orm";
import { db } from "./db";
import {
  bookings,
  demoMeta,
  demoUsers,
  invitations,
  libraries,
  planSegments,
  plans,
  rooms,
} from "./schema";
import { addDays, DEMO_WINDOW_DAYS, sydneyToday } from "./time";

// Fictional prototype data only: people, rooms and availability are made up
// and are not ANU Library inventory.

// Student numbers are fictional and use a u99… range so they don't read as
// real ANU uIDs.
export const USERS = [
  { id: "student-a", name: "Jordan Lee", studentNumber: "u9900101", sort: 1 },
  { id: "student-b", name: "Alex Chen", studentNumber: "u9900102", sort: 2 },
  { id: "student-c", name: "Priya Nair", studentNumber: "u9900103", sort: 3 },
  { id: "student-d", name: "Tom Walker", studentNumber: "u9900104", sort: 4 },
  { id: "student-e", name: "Sofia Rossi", studentNumber: "u9900105", sort: 5 },
];

const LIBRARIES = [
  { id: "chifley", name: "Chifley Library", shortName: "Chifley", sort: 1 },
  { id: "hancock", name: "Hancock Library", shortName: "Hancock", sort: 2 },
  { id: "menzies", name: "Menzies Library", shortName: "Menzies", sort: 3 },
  { id: "law", name: "Law Library", shortName: "Law", sort: 4 },
];

const h = (hours: number) => Math.round(hours * 60);

const ROOMS = [
  { id: "chifley-2-1", libraryId: "chifley", name: "Chifley 2.1", capacity: 2, opensMin: h(8), closesMin: h(20) },
  { id: "chifley-2-2", libraryId: "chifley", name: "Chifley 2.2", capacity: 6, opensMin: h(8), closesMin: h(20) },
  { id: "chifley-2-3", libraryId: "chifley", name: "Chifley 2.3", capacity: 6, opensMin: h(8), closesMin: h(20) },
  { id: "chifley-2-4", libraryId: "chifley", name: "Chifley 2.4", capacity: 4, opensMin: h(8), closesMin: h(20) },
  { id: "chifley-2-5", libraryId: "chifley", name: "Chifley 2.5", capacity: 4, opensMin: h(8), closesMin: h(20) },
  { id: "chifley-2-6", libraryId: "chifley", name: "Chifley 2.6", capacity: 8, opensMin: h(8), closesMin: h(20) },
  { id: "hancock-1-1", libraryId: "hancock", name: "Hancock 1.1", capacity: 4, opensMin: h(8), closesMin: h(20) },
  { id: "hancock-1-2", libraryId: "hancock", name: "Hancock 1.2", capacity: 6, opensMin: h(8), closesMin: h(20) },
  { id: "menzies-3-1", libraryId: "menzies", name: "Menzies 3.1", capacity: 6, opensMin: h(9), closesMin: h(18) },
  { id: "menzies-3-2", libraryId: "menzies", name: "Menzies 3.2", capacity: 4, opensMin: h(9), closesMin: h(18) },
  { id: "law-1-1", libraryId: "law", name: "Law 1.1", capacity: 4, opensMin: h(9), closesMin: h(18) },
  { id: "law-1-2", libraryId: "law", name: "Law 1.2", capacity: 6, opensMin: h(9), closesMin: h(18) },
].map((r, i) => ({ ...r, sort: i + 1 }));

type Pattern = Record<string, [number, number][]>;

// Scenario 1 (anchor day): four people, 13:00–15:00. No room is free for the
// whole period; the best split is Chifley 2.3 then Chifley 2.5, which loses
// five minutes to the room change.
const CROSS_ROOM_DAY: Pattern = {
  "chifley-2-1": [[10, 11]],
  "chifley-2-2": [[12, 14.5]],
  "chifley-2-3": [[11, 12.5], [14, 16]],
  "chifley-2-4": [[12.5, 15.5]],
  "chifley-2-5": [[12, 14], [15, 16.5]],
  "chifley-2-6": [[13.5, 17]],
  "hancock-1-1": [[12, 13.5], [14.5, 16]],
  "hancock-1-2": [[13, 16]],
  "menzies-3-1": [[10, 12], [14.5, 16]],
  "menzies-3-2": [[12, 15]],
  "law-1-1": [[13, 14.5]],
  "law-1-2": [[14, 17]],
};

// Scenario 2 (day after): Chifley 2.3 is free 12:00–17:00, so a three-hour
// discussion fits one room but needs two booking owners.
const TEAM_DAY: Pattern = {
  "chifley-2-1": [[15, 16]],
  "chifley-2-2": [[13, 14.5]],
  "chifley-2-3": [[9, 11], [17.5, 19]],
  "chifley-2-4": [[12, 14]],
  "chifley-2-5": [[15, 17]],
  "chifley-2-6": [[14, 16]],
  "hancock-1-1": [[13.5, 15]],
  "hancock-1-2": [[12, 13.5]],
  "menzies-3-1": [[15.5, 17]],
  "menzies-3-2": [[13, 14]],
  "law-1-1": [[14, 15.5]],
  "law-1-2": [[10, 13.5]],
};

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genericDay(date: string): Pattern {
  const pattern: Pattern = {};
  for (const room of ROOMS) {
    const rand = rng(hashSeed(`${date}:${room.id}`));
    const blocks: [number, number][] = [];
    for (let start = room.opensMin; start < room.closesMin; ) {
      const length = rand() < 0.5 ? 60 : 90;
      if (rand() < 0.35 && start + length <= room.closesMin) {
        blocks.push([start / 60, (start + length) / 60]);
        start += length;
      }
      start += 60;
    }
    pattern[room.id] = blocks;
  }
  return pattern;
}

// Seeded blocks never overlap reservations the demo users already confirmed.
function insertPattern(date: string, pattern: Pattern) {
  const existing = db.select().from(bookings).where(eq(bookings.date, date)).all();
  const clashes = (roomId: string, start: number, end: number) =>
    existing.some((b) => b.roomId === roomId && b.startMin < end && start < b.endMin);
  const rows = Object.entries(pattern).flatMap(([roomId, blocks]) =>
    blocks
      .filter(([from, to]) => !clashes(roomId, h(from), h(to)))
      .map(([from, to]) => ({
      roomId,
      date,
      startMin: h(from),
      endMin: h(to),
      ownerId: null,
      planId: null,
      source: "seed" as const,
    })),
  );
  if (rows.length) db.insert(bookings).values(rows).run();
  db.insert(demoMeta)
    .values({ key: `seeded:${date}`, value: "1" })
    .onConflictDoNothing()
    .run();
}

function getMeta(key: string): string | undefined {
  return db.select().from(demoMeta).where(eq(demoMeta.key, key)).get()?.value;
}

function setMeta(key: string, value: string) {
  db.insert(demoMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: demoMeta.key, set: { value } })
    .run();
}

function seedStatic() {
  for (const user of USERS) {
    db.insert(demoUsers)
      .values(user)
      .onConflictDoUpdate({
        target: demoUsers.id,
        set: { name: user.name, studentNumber: user.studentNumber, sort: user.sort },
      })
      .run();
  }
  db.insert(libraries).values(LIBRARIES).onConflictDoNothing().run();
  db.insert(rooms).values(ROOMS).onConflictDoNothing().run();
}

// The scenario days sit just after "today" so they are never in the past on
// the day the demo is shown. When the anchor slips into the past, the next
// two days are re-seeded with the scenario patterns.
function placeScenarioDays(today: string) {
  const anchor = addDays(today, 1);
  setMeta("anchor_date", anchor);
  for (const [date, pattern] of [
    [anchor, CROSS_ROOM_DAY],
    [addDays(anchor, 1), TEAM_DAY],
  ] as const) {
    db.delete(bookings)
      .where(and(eq(bookings.date, date), eq(bookings.source, "seed")))
      .run();
    insertPattern(date, pattern);
  }
}

let seededFor: string | null = null;

export function ensureDemoData(now: Date = new Date()) {
  const today = sydneyToday(now);
  if (seededFor === today) return;
  db.transaction(() => {
    seedStatic();
    const anchor = getMeta("anchor_date");
    if (!anchor || anchor < today) placeScenarioDays(today);
    for (let i = 0; i < DEMO_WINDOW_DAYS; i++) {
      const date = addDays(today, i);
      if (!getMeta(`seeded:${date}`)) insertPattern(date, genericDay(date));
    }
  });
  seededFor = today;
}

export function resetDemoData(now: Date = new Date()) {
  db.transaction(() => {
    db.delete(invitations).run();
    db.delete(bookings).run();
    db.delete(planSegments).run();
    db.delete(plans).run();
    db.delete(demoMeta).run();
  });
  seededFor = null;
  ensureDemoData(now);
}

export function scenarioDates(): { crossRoom: string; team: string } {
  const anchor = getMeta("anchor_date") ?? addDays(sydneyToday(), 1);
  return { crossRoom: anchor, team: addDays(anchor, 1) };
}
