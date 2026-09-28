# Study Room Planner

An independent course prototype (COMP4020 Crit 7) for one slice of ANU
Library room booking. Today a group that needs a longer discussion than one
room or one person's allowance covers has to open each library's booking page
separately, compare availability by hand and submit separate reservations.
This app puts Chifley, Hancock, Menzies and Law in one view, lets a group
assemble a multi-segment plan, and lets a teammate take responsibility for a
segment through an in-app invitation. It stores **prototype bookings only**:
availability, rooms and people are fictional demo data, and nothing here
reserves a real ANU Library room.

## Try it

The home page (`/`) is a labelled mock-up of today's ANU Library Bookings
page with the planner added as a proposed improvement: the **Open Study Room
Planner** card, the *Find a room in every library* search box, and the four
**Book in … Library** buttons, which now open the unified planner filtered
to that library. The planner itself is at `/search`.

1. **Cross-room comparison.** On the planner page choose *Try demo scenario →
   Cross-room comparison*. Four people want 13:00–15:00; no room is free for
   the whole period, so the best suggestion is Chifley 2.3 then Chifley 2.5.
   The plan shows the 5-minute room change and says it is **5 minutes
   short** instead of calling it a full match.
2. **Three-hour team plan.** Choose *Three-hour team plan* and add the full
   match (Chifley 2.3, 13:00–16:00). You own the first two hours; the last hour
   is over your daily limit, so review the plan, search for Alex Chen's
   student number (u9900102), check the name and number in the confirmation
   dialog and send the invitation. Switch
   the header's **Demo student** to Alex Chen, accept the segment, switch back
   and **Confirm plan**. Reload: both reservations are there.
3. **Conflict.** Repeat step 2, but as Alex Chen, before accepting, also
   start a new plan and confirm Chifley 2.3 14:00–15:00 for yourself. The
   organiser's confirmation then fails, names the clash and writes nothing:
   the pending invitation never held the room.

4. **Cancel.** On a confirmed plan the organiser can cancel the whole plan,
   and each booking owner can cancel their own segment. A dialog confirms
   first; cancelling frees the room and the owner's daily allowance.

Demo students (fictional): Jordan Lee u9900101, Alex Chen u9900102, Priya
Nair u9900103, Tom Walker u9900104, Sofia Rossi u9900105.

**Reset demo data** in the identity menu clears every plan so the stories can
be shown again.

## What good looks like here

The source of truth is `plan.md` (rules, states, wording) and the four
`reference images/` (visual result). Good means:

- **Never overstating the plan.** Changing rooms costs time (5 minutes within
  a library, 15 between libraries — design assumptions, not measurements), so
  a split plan shows the break and its usable discussion time, and a plan
  short of the request can only be confirmed as an explicit partial plan.
- **Rules live on the server.** Capacity, opening hours, overlap with
  confirmed bookings and the 2-hour-per-person daily limit (Australia/Sydney
  calendar day) are rechecked when the plan is confirmed, in one SQLite
  transaction: every reservation is written, or none is.
- **Invitations are consent, not holds.** An invitation expires 30 minutes
  after it is sent and never reserves the room; approval only makes the
  teammate the segment's booking owner. Nobody transfers quota to anyone.
- **Honest framing.** Letting different group members book consecutive
  segments for one meeting is a *proposed* improvement — ANU's public guidance
  doesn't say whether it is allowed.

Enforced by `spec/`: the planner rules (`spec/planner.test.ts`); the core flow
persisting across reloads, the daily limit, invitation accept/decline/expiry,
the no-partial-write conflict case and the page invariants
(`spec/study-rooms.test.ts`, `spec/invariants.test.ts`). Judgement calls
checked by eye: the match with the reference images at 1440px and 390px.

Not built on purpose: ANU SSO, LibCal integration, email, maps, payments,
admin tools and a general route optimiser.

## Stack

Astro (server output) with Drizzle ORM over SQLite; migrations in `drizzle/`
apply at boot; deployed to Fly.io with the database on a volume.
