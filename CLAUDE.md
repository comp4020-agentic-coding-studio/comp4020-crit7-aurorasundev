# Harness — Crit 7 · ANU Study Room Planner

## Sources of truth
- `plan.md` is authoritative for rules, labels, copy, states and behaviour.
- The `reference images/` are authoritative for the visual result (user
  instruction): layout, spacing, colour, typography, component shapes.
  Match them closely at 1440px and 390px and compare screenshots side by
  side before calling a screen done. Only wording and behaviour defer to
  `plan.md` (e.g. the invitation typo; the required break/shortfall row).
- The Crit 7 brief on the course site is the grading contract; it is marked
  Draft, so recheck it before submission.
- Never read or reuse the Assignment 2 repo in the parent directory.

## Honesty rules (product)
- The app is an independent course prototype. Never imply live ANU inventory
  or that "Confirm plan" makes a real ANU Library booking. Keep
  "Prototype bookings only" visible near booking actions.
- The collaboration feature (teammates owning consecutive segments) is a
  *proposed* improvement, not an existing ANU permission.
- No real student data, no emails, no SSO, no LibCal integration.
- `/` is a labelled mock-up of the ANU Library Bookings page
  (anu.libcal.com) showing where the planner would fit. It may mirror that
  page's structure and published guidance, but never ANU logos, banner
  images or a login, and it always says it is a course prototype and links
  the real site. The planner itself lives at `/search`.

## Rules the server must enforce (not just the UI)
- 120 minutes per owner per Australia/Sydney calendar day (confirmed + the
  segments they own in this confirmation).
- Group size <= room capacity; inside the room's opening window; no overlap
  with confirmed bookings.
- Invitations expire at created_at + 30 min, computed on read; they never
  hold a room.
- Confirmation is one SQLite transaction: all checks, then all writes, or
  nothing. Availability is derived from `bookings` only.

## Engineering rules
- pnpm only. Schema changes: edit `src/lib/schema.ts`, run `pnpm db:generate`,
  commit the generated migration. Never hand-edit migrations or the DB.
- Keep `GET /api/events` (SSE) and keep `/` server-rendered: the CI deploy
  job probes both. Every internal link must resolve (linkinator runs on
  deploy).
- Every new static route goes in `spec/routes.ts`; dynamic routes get the same
  invariant checks in `spec/study-rooms.test.ts`.
- `pnpm check` must be green before each commit. Commit in small steps that
  match the work; do not squash history.
- Dates/times: store `YYYY-MM-DD` Sydney-local dates and minutes-since-midnight
  integers; compute "today" with `timeZone: "Australia/Sydney"`.
- Ask before deploying to Fly, pushing, or anything visible to others.
- `mise.local.toml` holds a Fly token: never print, log or commit it.

## Process evidence
- `PROCESS.md` and `reflections/crit-7.md` describe only what actually
  happened (real commits, real corrections). Never invent history. The
  reflection is the student's voice; draft only if asked, and flag it.
