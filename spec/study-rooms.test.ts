import axe from "axe-core";
import Database from "better-sqlite3";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, inject, it } from "vitest";

// The week's contract, checked against the running built server: search
// across libraries, a plan that persists across reloads, server-enforced
// limits, invitations that expire and never hold a room, and an
// all-or-nothing confirmation.
const baseUrl = inject("baseUrl");
const dbPath = inject("dbPath");
const A = "student-a";
const B = "student-b";
const B_NUMBER = "u9900102";

type Page = { status: number; url: string; doc: Document; html: string; dom: JSDOM };

async function get(path: string, user = A): Promise<Page> {
  const res = await fetch(new URL(path, baseUrl), { headers: { cookie: `demo_user=${user}` } });
  const html = await res.text();
  const dom = new JSDOM(html, { url: new URL(path, baseUrl).href, runScripts: "outside-only", pretendToBeVisual: true });
  return { status: res.status, url: res.url, doc: dom.window.document, html, dom };
}

async function post(path: string, fields: Record<string, string | number>, user = A) {
  const res = await fetch(new URL(path, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: `demo_user=${user}`,
      origin: baseUrl,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, String(v)])),
  });
  const location = res.headers.get("location") ?? "";
  const params = new URL(location, baseUrl).searchParams;
  return { status: res.status, location, error: params.get("error"), notice: params.get("notice") };
}

function db() {
  return new Database(dbPath);
}

async function scenarioDates() {
  const page = await get("/search");
  const hrefs = [...page.doc.querySelectorAll(".demo-links a")].map((a) => a.getAttribute("href") ?? "");
  const date = (href: string) => new URL(href, baseUrl).searchParams.get("date") ?? "";
  return { crossRoom: date(hrefs[0]), team: date(hrefs[1]), crossHref: hrefs[0], teamHref: hrefs[1] };
}

const h = (x: number) => x * 60;

async function addOption(user: string, date: string, reqStart: number, reqEnd: number, segments: string) {
  return post("/api/plans/segments", { intent: "add-option", date, reqStart, reqEnd, people: 4, segments, back: "/" }, user);
}

async function currentPlanId(user: string): Promise<string> {
  const page = await get("/search", user);
  const href = page.doc.querySelector(".rail a.btn--primary")?.getAttribute("href") ?? "";
  expect(href).toMatch(/^\/plans\//);
  return href.split("/").pop() ?? "";
}

async function newPlan(user: string, date: string) {
  return post("/api/plans/segments", { intent: "new", date, reqStart: h(13), reqEnd: h(15), people: 4, back: "/" }, user);
}

async function teamPlanWithInvite() {
  const { team } = await scenarioDates();
  await newPlan(A, team);
  expect((await addOption(A, team, h(13), h(16), `chifley-2-3|${h(13)}|${h(16)}`)).error).toBeNull();
  const planId = await currentPlanId(A);
  const review = await get(`/plans/${planId}`);
  const segmentId = review.doc.querySelector('form.lookup input[name="for"]')?.getAttribute("value") ?? "";
  expect(segmentId).not.toBe("");
  const sent = await post(`/api/plans/${planId}/invite`, {
    segmentId, studentNumber: B_NUMBER, confirmed: "yes", back: `/plans/${planId}`,
  });
  expect(sent.error).toBeNull();
  const inv = db().prepare("select id from invitations where segment_id = ?").get(segmentId) as { id: string };
  return { planId, segmentId, invitationId: inv.id, team };
}

function planBookings(planId: string): number {
  const row = db().prepare("select count(*) as n from bookings where plan_id = ?").get(planId) as { n: number };
  return row.n;
}

beforeEach(async () => {
  const reset = await post("/api/demo/reset", { back: "/" });
  expect(reset.status).toBe(303);
});

describe("library bookings home (mock-up of anu.libcal.com)", () => {
  it("mirrors the booking page and puts the planner where students will see it", async () => {
    const page = await get("/");
    expect(page.doc.querySelector("h1")?.textContent).toBe("Book a group study room");
    const buttons = [...page.doc.querySelectorAll(".lib-grid a")].map((a) => [a.textContent?.trim(), a.getAttribute("href")]);
    expect(buttons).toEqual([
      ["Book in Chifley Library", "/search?library=chifley"],
      ["Book in Hancock Library", "/search?library=hancock"],
      ["Book in Menzies Library", "/search?library=menzies"],
      ["Book in Law Library", "/search?library=law"],
    ]);
    const card = page.doc.querySelector(".planner-card");
    expect(card?.querySelector('a[href="/search"]')?.textContent).toContain("Open Study Room Planner");
    const firstLibrary = page.doc.querySelector(".lib-grid");
    expect(card && firstLibrary && card.compareDocumentPosition(firstLibrary) & 4).toBeTruthy();
    expect(page.html).toContain("Students can book a group study space for up to two hours a day.");
  });

  it("says it is a prototype, links the real site and offers no ANU login", async () => {
    const page = await get("/");
    expect(page.doc.querySelector(".lib-strip")?.textContent).toContain("not an ANU service");
    expect(page.doc.querySelector('a[href="https://anu.libcal.com/"]')).toBeTruthy();
    expect(page.doc.querySelector('input[type="password"]')).toBeNull();
    expect(page.doc.querySelector("img")).toBeNull();
  });
});

describe("search", () => {
  it("shows all four libraries in one view with capacity and a legend", async () => {
    const { crossHref } = await scenarioDates();
    const page = await get(crossHref);
    const groups = [...page.doc.querySelectorAll(".grid .lib-row th")].map((th) => th.textContent?.trim());
    expect(groups).toEqual(["Chifley Library", "Hancock Library", "Menzies Library", "Law Library"]);
    const legend = page.doc.querySelector(".legend")?.textContent ?? "";
    for (const label of ["Available", "Unavailable", "Selected"]) expect(legend).toContain(label);
    expect(page.html).toContain("Prototype bookings only");
  });

  it("marks the room change and shortfall when no single room fits", async () => {
    const { crossHref } = await scenarioDates();
    const page = await get(crossHref);
    const first = page.doc.querySelector(".option")?.textContent ?? "";
    expect(first).toContain("Chifley 2.3 13:00 – 14:00");
    expect(first).toContain("Chifley 2.5 14:00 – 15:00");
    expect(first).toContain("5 minutes short");
    expect(first).not.toContain("Full match");
  });

  it("prefers a single-room full match when one exists", async () => {
    const { teamHref } = await scenarioDates();
    const page = await get(teamHref);
    const first = page.doc.querySelector(".option")?.textContent ?? "";
    expect(first).toContain("Full match");
    expect(first).toContain("Chifley 2.3 13:00 – 16:00");
  });

  it("filters by library", async () => {
    const { crossHref } = await scenarioDates();
    const page = await get(`${crossHref}&library=law`);
    const groups = [...page.doc.querySelectorAll(".grid .lib-row th")].map((th) => th.textContent?.trim());
    expect(groups).toEqual(["Law Library"]);
  });

  it("rejects dates outside the demo window", async () => {
    const page = await get("/search?date=2020-01-01&from=13:00&until=15:00&people=4");
    expect(page.doc.querySelector("#date-error")?.textContent).toContain("Demo availability");
    expect(page.doc.querySelector(".grid")).toBeNull();
  });
});

describe("core flow: plan, confirm, reload", () => {
  it("keeps a draft across reloads and confirms a partial plan only when acknowledged", async () => {
    const { crossRoom, crossHref } = await scenarioDates();
    const added = await addOption(A, crossRoom, h(13), h(15), `chifley-2-3|${h(13)}|${h(14)},chifley-2-5|${h(14)}|${h(15)}`);
    expect(added.error).toBeNull();

    const reloaded = await get(crossHref);
    const rail = reloaded.doc.querySelector(".rail")?.textContent ?? "";
    expect(rail).toContain("Chifley 2.3");
    expect(rail).toContain("Chifley 2.5");
    expect(rail).toContain("5-minute room change");
    expect(rail).toContain("5 minutes short");

    const planId = await currentPlanId(A);
    const silent = await post(`/api/plans/${planId}/confirm`, { back: `/plans/${planId}` });
    expect(silent.error).toContain("short");
    expect(planBookings(planId)).toBe(0);

    const ok = await post(`/api/plans/${planId}/confirm`, { acceptShort: "yes", back: `/plans/${planId}` });
    expect(ok.notice).toBe("Plan confirmed in this prototype.");
    expect(planBookings(planId)).toBe(2);

    const again = await post(`/api/plans/${planId}/confirm`, { acceptShort: "yes", back: `/plans/${planId}` });
    expect(again.error).toBeNull();
    expect(planBookings(planId)).toBe(2);

    const review = await get(`/plans/${planId}`);
    expect(review.doc.querySelectorAll(".table .status--confirmed").length).toBe(2);
    const mine = await get("/my-plans");
    expect(mine.doc.querySelector(".plan-card .status")?.textContent).toBe("Confirmed");

    const after = await get(crossHref);
    const cell = after.doc.querySelector('[data-room="chifley-2-3"] [data-slot="780"]');
    expect(cell?.tagName).toBe("SPAN");
    expect(cell?.getAttribute("data-state")).toBe("busy");
  });

  it("rejects a room that is already taken or too small", async () => {
    const { crossRoom } = await scenarioDates();
    const taken = await post("/api/plans/segments", {
      intent: "add", date: crossRoom, reqStart: h(13), reqEnd: h(15), people: 4,
      roomId: "chifley-2-3", start: h(14), end: h(15), back: "/",
    });
    expect(taken.error).toContain("not available");
    const small = await post("/api/plans/segments", {
      intent: "add", date: crossRoom, reqStart: h(13), reqEnd: h(15), people: 4,
      roomId: "chifley-2-1", start: h(13), end: h(14), back: "/",
    });
    expect(small.error).toContain("seats 2");
  });

  it("refuses to confirm more than two hours of one person's bookings in a day", async () => {
    const { team } = await scenarioDates();
    const add = (start: number, end: number) =>
      post("/api/plans/segments", {
        intent: "add", date: team, reqStart: start, reqEnd: end, people: 2,
        roomId: "chifley-2-1", start, end, back: "/",
      });
    await newPlan(A, team);
    expect((await add(h(9), h(10.5))).error).toBeNull();
    const first = await currentPlanId(A);
    await newPlan(A, team);
    expect((await add(h(11), h(12))).error).toBeNull();
    const second = await currentPlanId(A);

    expect((await post(`/api/plans/${first}/confirm`, { back: "/" })).notice).toBe("Plan confirmed in this prototype.");
    const over = await post(`/api/plans/${second}/confirm`, { back: "/" });
    expect(over.error).toContain("daily limit is 2 hours");
    expect(planBookings(second)).toBe(0);
    const review = await get(`/plans/${second}`);
    expect(review.doc.querySelector(".flash--error")?.textContent).toContain("Confirmation failed");
  });
});

describe("collaboration", () => {
  it("a teammate accepts a segment and the organiser confirms both reservations", async () => {
    const { planId, invitationId } = await teamPlanWithInvite();

    const pending = await get(`/plans/${planId}`);
    expect(pending.doc.querySelector(".table")?.textContent).toContain("Pending approval");
    expect(pending.doc.querySelector(".invite-card")?.textContent).toMatch(/Pending · expires in (29|30) minutes/);
    const confirmButton = [...pending.doc.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Confirm plan");
    expect(confirmButton?.hasAttribute("disabled")).toBe(true);
    expect((await post(`/api/plans/${planId}/confirm`, { back: "/" })).error).toContain("no approved owner");

    const resend = await post(`/api/plans/${planId}/invite`, {
      segmentId: (db().prepare("select segment_id from invitations where id = ?").get(invitationId) as { segment_id: string }).segment_id,
      studentNumber: B_NUMBER, confirmed: "yes", back: "/",
    });
    expect(resend.error).toContain("already pending");

    const bView = await get(`/invitations/${invitationId}`, B);
    const details = bView.doc.querySelector(".details")?.textContent ?? "";
    for (const text of ["Jordan Lee", "Chifley 2.3", "Chifley Library", "15:00 – 16:00", "1 hour"]) expect(details).toContain(text);
    expect((await post(`/api/invitations/${invitationId}/respond`, { decision: "accept", back: "/" }, A)).error).toContain(
      "Only the invited teammate",
    );
    expect((await post(`/api/invitations/${invitationId}/respond`, { decision: "accept", back: "/" }, B)).error).toBeNull();
    expect(planBookings(planId)).toBe(0);

    const approved = await get(`/plans/${planId}`);
    expect(approved.doc.querySelector(".table")?.textContent).toContain("Approved");
    expect((await post(`/api/plans/${planId}/confirm`, { back: "/" })).notice).toBe("Plan confirmed in this prototype.");
    const owners = db().prepare("select owner_id from bookings where plan_id = ? order by start_min").all(planId);
    expect(owners).toEqual([{ owner_id: A }, { owner_id: B }]);

    const bPlans = await get("/my-plans", B);
    expect(bPlans.html).toContain(`/plans/${planId}`);
  });

  it("approval does not hold the room: a conflicting booking fails confirmation with no partial writes", async () => {
    const { planId, invitationId, team } = await teamPlanWithInvite();
    await newPlan(B, team);
    const snipe = await post("/api/plans/segments", {
      intent: "add", date: team, reqStart: h(14), reqEnd: h(15), people: 4,
      roomId: "chifley-2-3", start: h(14), end: h(15), back: "/",
    }, B);
    expect(snipe.error).toBeNull();
    const bPlan = await currentPlanId(B);
    expect((await post(`/api/plans/${bPlan}/confirm`, { back: "/" }, B)).notice).toBe("Plan confirmed in this prototype.");

    expect((await post(`/api/invitations/${invitationId}/respond`, { decision: "accept", back: "/" }, B)).error).toBeNull();
    const result = await post(`/api/plans/${planId}/confirm`, { back: "/" });
    expect(result.error).toContain("reserved by someone else");
    expect(planBookings(planId)).toBe(0);
    const status = db().prepare("select status, last_error from plans where id = ?").get(planId) as { status: string; last_error: string };
    expect(status.status).toBe("draft");
    expect(status.last_error).toContain("reserved by someone else");
  });

  it("an answer without an explicit decision changes nothing", async () => {
    const { invitationId } = await teamPlanWithInvite();
    const blank = await post(`/api/invitations/${invitationId}/respond`, { back: "/" }, B);
    expect(blank.error).toContain("Choose Accept segment or Decline");
    const row = db().prepare("select status from invitations where id = ?").get(invitationId) as { status: string };
    expect(row.status).toBe("pending");
  });

  it("declined and expired invitations are shown and can be re-sent", async () => {
    const { planId, segmentId, invitationId } = await teamPlanWithInvite();
    expect((await post(`/api/invitations/${invitationId}/respond`, { decision: "decline", back: "/" }, B)).error).toBeNull();
    expect((await get(`/plans/${planId}`)).doc.querySelector(".table")?.textContent).toContain("Declined");

    expect(
      (await post(`/api/plans/${planId}/invite`, { segmentId, studentNumber: B_NUMBER, confirmed: "yes", back: "/" })).error,
    ).toBeNull();
    const second = db().prepare("select id from invitations where segment_id = ? and status = 'pending'").get(segmentId) as { id: string };
    const conn = db();
    conn.prepare("update invitations set created_at_ms = ? where id = ?").run(Date.now() - 31 * 60_000, second.id);
    conn.close();

    const expired = await post(`/api/invitations/${second.id}/respond`, { decision: "accept", back: "/" }, B);
    expect(expired.error).toContain("expired");
    const page = await get(`/plans/${planId}`);
    expect(page.doc.querySelector(".table")?.textContent).toContain("Expired");
    const buttons = [...(await get(`/invitations/${second.id}`, B)).doc.querySelectorAll(".actions button")];
    expect(buttons.every((b) => b.hasAttribute("disabled"))).toBe(true);
  });
});

describe("teammate lookup by student number", () => {
  async function draftTeamPlan() {
    const { team } = await scenarioDates();
    await newPlan(A, team);
    await addOption(A, team, h(13), h(16), `chifley-2-3|${h(13)}|${h(16)}`);
    const planId = await currentPlanId(A);
    const review = await get(`/plans/${planId}`);
    const segmentId = review.doc.querySelector('form.lookup input[name="for"]')?.getAttribute("value") ?? "";
    return { planId, segmentId };
  }

  it("finds a student by number and asks for confirmation before sending", async () => {
    const { planId, segmentId } = await draftTeamPlan();
    const found = await get(`/plans/${planId}?for=${segmentId}&lookup=U9900103`);
    expect(found.doc.querySelector(".found")?.textContent).toContain("Priya Nair");
    const dialog = found.doc.querySelector(`#invite-dlg-${segmentId}`)?.textContent ?? "";
    expect(dialog).toContain("Priya Nair");
    expect(dialog).toContain("u9900103");
    expect(found.doc.querySelector(`#invite-dlg-${segmentId} button[name="confirmed"][value="yes"]`)).toBeTruthy();

    const unconfirmed = await post(`/api/plans/${planId}/invite`, { segmentId, studentNumber: "u9900103", back: "/" });
    expect(unconfirmed.error).toContain("Confirm that Priya Nair (u9900103)");
    const sent = await post(`/api/plans/${planId}/invite`, { segmentId, studentNumber: "u9900103", confirmed: "yes", back: "/" });
    expect(sent.notice).toContain("Priya Nair (u9900103)");
    const row = db().prepare("select invitee_id from invitations where segment_id = ?").get(segmentId) as { invitee_id: string };
    expect(row.invitee_id).toBe("student-c");
  });

  it("explains unknown numbers and refuses your own", async () => {
    const { planId, segmentId } = await draftTeamPlan();
    const missing = await get(`/plans/${planId}?for=${segmentId}&lookup=u1234567`);
    expect(missing.doc.querySelector(".lookup [role=alert]")?.textContent).toContain("No student with number u1234567");
    expect(missing.doc.querySelector(".found")).toBeNull();
    const own = await get(`/plans/${planId}?for=${segmentId}&lookup=u9900101`);
    expect(own.doc.querySelector(".lookup [role=alert]")?.textContent).toContain("your own student number");
    expect((await post(`/api/plans/${planId}/invite`, { segmentId, studentNumber: "u0000000", confirmed: "yes", back: "/" })).error).toContain("No student");
    expect((await post(`/api/plans/${planId}/invite`, { segmentId, studentNumber: "u9900101", confirmed: "yes", back: "/" })).error).toContain("your own");
  });
});

describe("cancelling confirmed bookings", () => {
  async function confirmedTeamPlan() {
    const { planId, invitationId, segmentId, team } = await teamPlanWithInvite();
    await post(`/api/invitations/${invitationId}/respond`, { decision: "accept", back: "/" }, B);
    expect((await post(`/api/plans/${planId}/confirm`, { back: "/" })).notice).toBe("Plan confirmed in this prototype.");
    return { planId, segmentId, team };
  }

  it("a teammate cancels their own segment, freeing the room and their allowance", async () => {
    const { planId, segmentId, team } = await confirmedTeamPlan();
    expect((await post(`/api/plans/${planId}/cancel`, { scope: "segment", segmentId, back: "/" }, B)).error).toContain("Confirm the cancellation");
    const outsider = await post(`/api/plans/${planId}/cancel`, { scope: "segment", segmentId, confirmed: "yes", back: "/" }, "student-c");
    expect(outsider.error).toContain("Only the segment's booking owner");
    const done = await post(`/api/plans/${planId}/cancel`, { scope: "segment", segmentId, confirmed: "yes", back: "/" }, B);
    expect(done.notice).toContain("Booking cancelled");
    expect(planBookings(planId)).toBe(1);

    const review = await get(`/plans/${planId}`);
    expect(review.doc.querySelector(".table")?.textContent).toContain("Cancelled");
    const search = await get(`/search?date=${team}&from=13:00&until=16:00&people=4`);
    expect(search.doc.querySelector('[data-room="chifley-2-3"] button[data-slot="900"]')).toBeTruthy();
    const minutes = db().prepare("select count(*) as n from bookings where owner_id = ? and date = ?").get(B, team) as { n: number };
    expect(minutes.n).toBe(0);
  });

  it("the organiser cancels the whole plan; nothing stays booked", async () => {
    const { planId } = await confirmedTeamPlan();
    expect((await post(`/api/plans/${planId}/cancel`, { scope: "plan", confirmed: "yes", back: "/" }, B)).error).toContain("Only the plan's organiser");
    const done = await post(`/api/plans/${planId}/cancel`, { scope: "plan", confirmed: "yes", back: "/" });
    expect(done.notice).toContain("Plan cancelled");
    expect(planBookings(planId)).toBe(0);
    const mine = await get("/my-plans");
    expect(mine.doc.querySelector(".plan-card .status")?.textContent).toBe("Cancelled");
    expect((await post(`/api/plans/${planId}/confirm`, { back: "/" })).error).toContain("cancelled");
  });

  it("drafts cannot be cancelled as bookings", async () => {
    const { planId, segmentId } = await teamPlanWithInvite();
    expect((await post(`/api/plans/${planId}/cancel`, { scope: "segment", segmentId, confirmed: "yes", back: "/" })).error).toContain("Only confirmed bookings");
  });
});

describe("navigation", () => {
  it("planner nav searches rooms and a home icon returns to library bookings", async () => {
    const page = await get("/my-plans");
    const search = [...page.doc.querySelectorAll(".main-nav a")].find((a) => a.textContent?.trim() === "Search rooms");
    expect(search?.getAttribute("href")).toBe("/search");
    expect(page.doc.querySelector('a.home-link[href="/"]')?.getAttribute("aria-label")).toBe("Library bookings home");
  });
});

describe("dynamic routes meet the same invariants", () => {
  it("plan and invitation pages", async () => {
    const { planId, invitationId } = await teamPlanWithInvite();
    for (const [path, user] of [[`/plans/${planId}`, A], [`/invitations/${invitationId}`, B]] as const) {
      const page = await get(path, user);
      expect(page.status).toBe(200);
      expect(page.doc.documentElement.getAttribute("lang")).toBeTruthy();
      expect(page.doc.title.trim()).not.toBe("");
      expect(page.doc.querySelector('meta[name="viewport"]')).toBeTruthy();
      expect(page.doc.querySelector("nav")).toBeTruthy();
      expect(page.doc.querySelectorAll("h1").length).toBe(1);
      const window = page.dom.window as unknown as { eval: (s: string) => void; axe: typeof axe };
      window.eval(axe.source);
      const results = await window.axe.run(page.doc, {
        rules: { "color-contrast": { enabled: false }, "link-in-text-block": { enabled: false } },
      });
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`)).toEqual([]);
    }
  });

  it("unknown plans return 404", async () => {
    expect((await get("/plans/nope")).status).toBe(404);
  });
});
