# Crit 7 — ANU Study Room Planner

> Design and implementation handoff for Claude. This document specifies a proposed course prototype. No website has been built in this directory. Use the already prepared Crit 7 starter repository for implementation; inspect its actual structure before changing it. Do not treat the older Assignment 2 `plan.md` or `design-references/` in the parent directory as part of this project.

## 1. Product idea and success criteria

**One-line pitch:** Help an ANU group compare bookable study rooms across libraries in one view, assemble a multi-segment plan, and coordinate who is responsible for each segment.

**User problem:** A group may need a discussion period that one Chifley room cannot cover. Today, the user experiences separate library and room pages, manually compares availability, and submits separate reservations. The proposed app makes the comparison and coordination visible in one workflow.

**Course fit:** Crit 7 asks for a small, end-to-end replacement for a real ANU system, a core action that persists after reload, an app running at its `*.fly.dev` URL, incremental commits, `PROCESS.md`, and `reflections/crit-7.md`. The course page currently marks the brief as **Draft**, so recheck it before final submission. Its suggested starter stack is Astro with a backend, Drizzle, and SQLite; use the existing starter rather than rebuilding the environment. Source: [Crit 7 brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/07-anu-system/).

**Definition of done for the prototype:** On the deployed app, a demo student can search, compose a valid plan, invite a second demo student for a segment, receive that student's approval, confirm the plan, reload, and see the saved result. A conflicting or over-limit confirmation is rejected by the server.

## 2. Evidence, assumptions, and product boundaries

| Status | Statement | Consequence for design |
| --- | --- | --- |
| Published ANU information | [ANU Library Bookings](https://anu.libcal.com/) shows separate entry points for Chifley, Hancock, Menzies, and Law. Its group-study-room guidance says students may book up to two hours per day and use an ANU email account. | Show all four libraries together; model a 120-minute daily limit per demo user. |
| User observation | Comparing different rooms or libraries and making separate submissions is cumbersome. | Search, compare, and review segments in one place. |
| Proposed feature | A real group member may take responsibility for a later segment after accepting an invitation. | Each segment has its own named booking owner; nobody transfers quota to somebody else. |
| Unconfirmed policy | Public guidance does not establish whether different members of one group may reserve consecutive segments for the same discussion. | Label this as a proposed ANU improvement; do not describe it as an existing permission or connect it to real bookings. |
| Prototype assumption | Availability, room identifiers, opening windows, travel estimates, and user identities are demo data. | Clearly mark the app as an independent course prototype, not live ANU inventory. |

The app must never claim that pressing **Confirm plan** makes a real ANU Library booking. It only commits reservations in the prototype's own database. Do not collect real student numbers or send real emails. The demo invitation is delivered inside the app to another test user.

## 3. Scope and order

### Core slice

1. Search all four libraries by date, start, end, and group size.
2. See room availability and filter by library.
3. Prefer a single-room solution. Let the user add one or more segments to **Your plan**.
4. Review coverage, room changes, booking owners, and daily-limit warnings.
5. Confirm valid segments into SQLite; show them under **My plans** after reload.

### Collaboration slice

6. For a requested period longer than one person's two-hour allowance, assign another segment to a second participating demo user.
7. Send an in-app invitation that expires 30 minutes after creation.
8. The invited user accepts or declines from their own demo account. The organizer can confirm only after all assigned users approve and the server rechecks availability and limits.

Build and verify the core slice first. Then add the collaboration slice using the same plan and booking model. Avoid real ANU SSO, LibCal integration, email delivery, maps, payment, and unrequested admin features.

## 4. Visual concept and reference images

This is a working tool, not a marketing landing page. The opening screen should immediately show the search task and available rooms.

| Reference | Role | File |
| --- | --- | --- |
| Desktop search and results | Main layout, cross-library time grid, persistent plan rail | [search-results-desktop.png](reference%20images/search-results-desktop.png) |
| Mobile search and results | Reflowed form, vertical room records, sticky plan summary | [search-results-mobile.png](reference%20images/search-results-mobile.png) |
| Desktop plan and invitation | Review timeline, owners, invitation status, disabled confirmation | [plan-invite-desktop.png](reference%20images/plan-invite-desktop.png) |
| Mobile plan and invitation | Vertical itinerary, pending teammate request, disabled confirmation | [plan-invite-mobile.png](reference%20images/plan-invite-mobile.png) |

The images are **layout and visual references**. This written plan is authoritative for rules, dates, labels, state, and behavior. In particular, the invitation image contains a generated typo in its introductory sentence; use the exact copy below. The search image shows two adjacent rooms and “2 hours” of bookings: this is not two uninterrupted hours of discussion because moving rooms takes time. Render the break explicitly in the product.

### Visual system

- White page background, deep navy text, dark teal for the main action and active navigation, muted ochre for selected time segments, very light cool-gray rules. Use color together with visible labels and shapes to communicate states.
- Calm, precise scheduling-tool character: open space, thin dividers, room rows and time rails. Avoid a stack of rounded cards, large shadows, decorative illustrations, a promotional hero, and an official ANU crest.
- Desktop target: approximately 1440-pixel-wide viewport; quiet header; search/results area on the left; approximately 320-pixel **Your plan** rail on the right. Do not compress the whole workflow into one viewport if the result list grows.
- Mobile target: 390-pixel viewport. Reflow the search fields, display each room as a labelled record with a miniature time rail, and use a sticky bottom plan summary that opens the full review. No sideways page scrolling.
- Typography: modern sans-serif with deliberate styles for heading, body, labels, buttons, table cells, and status text. Suggested starting scale: desktop title 40 px, section heading 24 px, body 16 px, utility text 14 px; mobile title 28 px and body/control text at least 16 px. Adjust only to fit the references cleanly.
- Controls need visible hover, selected, focus, disabled, and error states. Keyboard navigation, meaningful field labels, readable contrast, and 44-pixel mobile touch targets are required.
- Do not ship the generated screenshots as interface elements. Recreate text, tables, controls, time bars, and labels in code; the images are for visual comparison.

## 5. Information architecture and exact screen behavior

| Screen | Route suggestion | Main content and action |
| --- | --- | --- |
| Search rooms | `/` | Search form, library filters, room availability, plan rail. |
| Review plan | `/plans/[id]` | Timeline, usable discussion time, booking owners, invitation controls, confirmation. |
| My plans | `/my-plans` | Draft, pending, confirmed, and failed plans visible after reload. |
| Invitation | `/invitations/[id]` | Invited user sees exact room/time and accepts or declines. |

Route names may follow the starter's conventions, but keep these four user-facing states discoverable.

### Search rooms — desktop

Header: **Study Room Planner**, **Search rooms**, **My plans**, **Demo student**. The identity control changes between two seeded demo users so both sides of an invitation can be shown in one browser.

Primary heading: **Find a room for your whole session**. Fields: **Date**, **From**, **Until**, **People**. Primary button: **Search rooms**. Use local Australia/Sydney dates and 24-hour time. Keep the date within the prototype's available demo window; never imply that a future date has live ANU availability.

Results heading: **Available rooms**. Library filter: **All libraries**, **Chifley**, **Hancock**, **Menzies**, **Law**. A room row shows library, room name, capacity, and a time rail. Legend and accessible text must distinguish **Available**, **Unavailable**, and **Selected**. A selected slot has an **Add to plan** or **Remove from plan** action with an immediately visible result.

Right rail: **Your plan**, ordered segments with time and room, booked minutes, usable discussion minutes, any room-change time, and **Review plan**. Also show **Prototype bookings only** near the action area. On an empty plan, give one short instruction: **Choose a room and time to start your plan.**

### Search-result ordering and room changes

Show a single room covering the requested period first when possible. Otherwise offer a small number of simple split options sorted by fewer room changes, same-library changes before cross-library changes, and less uncovered time. Do not build a general route optimiser for this crit.

An uninterrupted session is possible only if the same room remains available for the entire discussion. A plan that changes rooms must display a break. For the demo, assume **5 minutes to change rooms in one library** and **15 minutes between libraries**. These are design assumptions, not measured campus travel times. Subtract this time from usable discussion time. If the user requested 120 minutes but the selected bookings yield 115 usable minutes, show **5 minutes short** and do not label it a full match; suggest extending the time window or choosing another plan. The user may still review a partial plan, but cannot silently confirm it as complete coverage of their request.

### Review plan and invitation

Heading: **Review your plan**. Supporting sentence: **Check your booking details, teammate invitations and next steps.** Show the requested period and a horizontal desktop timeline or vertical mobile itinerary. Each segment shows exact room, time, responsible user, and status: **Assigned**, **Pending approval**, **Approved**, or **Confirmed**. A segment is never labelled “Booked” until the final database transaction succeeds.

If a segment needs another participant, show **Invite a teammate**, a **Demo teammate** selector, and **Send invitation**. Once sent, show **Pending · expires in 30 minutes** and the selected teammate. The invitation section states: **Each participant confirms their own segment. An invitation does not hold the room.** Sending again is unavailable while an invitation for that segment remains pending.

The **Confirm plan** action stays disabled until every assigned participant has approved. When enabled, it rechecks room availability and every owner's daily total on the server. Success copy: **Plan confirmed in this prototype.** The plan then appears in **My plans** after reload. Failure copy identifies the actual reason and preserves the draft for editing.

### Invited teammate's view

The invited demo user sees who invited them, room, library, date, start/end, duration, their total already assigned that day, and the invitation expiry. Actions: **Accept segment** and **Decline**. An acceptance records consent to take responsibility; it does not immediately reserve the room. After expiry, both actions are unavailable and the organizer sees **Expired**.

### Mobile behavior

Keep the same wording and state model. On the search screen, put one search field group above results; use a compact **All libraries** selector; turn the wide schedule into room records with local mini-rails. A bottom bar shows **Your plan · N segments · X hours** and **Review**. The full review is a scrollable page with a vertical itinerary, invitation status below it, and the disabled/enabled **Confirm plan** action after the invitation details. Do not shrink the desktop table to phone width or duplicate the search screen's sticky plan bar on the review page.

## 6. Scheduling and data rules

- Prototype slots use 30-minute increments unless the starter already establishes another interval. A segment has one room, one owner, one date, one start, and one end.
- A user's confirmed bookings plus the proposed segments they own in the same confirmation must total no more than 120 minutes on that local calendar day. Enforce this in the server action, not only the interface.
- Group size must not exceed room capacity. A confirmed booking must fit inside the seeded demo room's available window and must not overlap another confirmed booking of that room.
- One user may own multiple segments within their allowance. For a longer discussion, only a real participant's separate approval can assign that participant a segment. No quota-transfer UI or operation.
- Invitations expire at `created_at + 30 minutes`. Check expiry when reading or acting; a background timer is optional. Expiry does not block or reserve a room.
- Final confirmation should be one database transaction: verify all approvals, expiry, availability, capacity, opening window, and daily limits; then write all reservations and mark the plan confirmed together. Prevent double-click duplication.
- If any check fails, write no partial reservations. Keep the plan editable and explain the conflict. The UI should then allow a fresh search.

Suggested minimal entities: `demo_users`, `libraries`, `rooms`, `plans`, `plan_segments`, `invitations`, and `bookings`. Use bookings plus seeded existing reservations to compute availability; avoid a second mutable “availability” truth source. Persist plan and invitation states in SQLite via the starter's migration workflow.

## 7. Demonstration data and scenarios

All example people, room names, and availability are fictional prototype data. Seed only enough to make the two stories reproducible:

1. **Cross-room comparison:** Four people request 13:00–15:00 on the demo date. Chifley has no uninterrupted full match; the app can show 13:00–14:00 in Chifley 2.3 and 14:00–15:00 in Chifley 2.5, explicitly marking the 5-minute room change and the resulting shortfall. Another library or extended time window can supply a complete alternative if seeded.
2. **Team coordination:** A three-hour discussion has a 13:00–15:00 segment assigned to Demo Student A and a 15:00–16:00 segment offered to Demo Student B. B sees and accepts a 30-minute invitation. The organizer then confirms; both reservations persist after reload. This scenario demonstrates the proposed policy, not a claim about current ANU permissions.
3. **Failure case:** While an invitation is pending, another demo user reserves one room segment. Approval alone does not protect the room; confirmation reports a conflict and makes no partial booking.

Use dynamic dates for ordinary use. A fixed seeded demo date may be exposed through a clearly labelled **Try demo scenario** action if needed, but avoid dates that are already in the past when the crit is presented.

## 8. Implementation sequence for Claude

1. **Inspect the prepared Crit 7 repository.** Identify its Astro routes, Drizzle schema/migrations, SQLite file path, scripts, deployment configuration, and any existing test harness. Map this plan to the starter without replacing working setup. **Verify:** current app/build still runs before edits.
2. **Create the smallest persistent model and seed.** Add the entities needed for the core story and two demo users. **Verify:** reload keeps a draft/confirmed booking and availability changes after confirmation.
3. **Build the search screen from the desktop and mobile references.** Implement library filtering, readable time bars, result ranking, and plan rail. **Verify:** full match, split option, empty result, and room-change shortfall are distinguishable.
4. **Build review and confirmation.** Enforce capacity, time overlap, daily owner limit, and atomic save in the server. **Verify:** valid plan persists; conflict and over-limit plans commit nothing.
5. **Add invitation flow.** Switch demo identity, send in-app invitation, accept/decline/expire, recheck on final confirmation. **Verify:** pending, approved, declined, expired, and conflict states survive reload.
6. **Finish the crit handoff.** Compare rendered desktop and 390-pixel mobile screenshots with the reference images; correct typography, spacing, colors, timeline density, icon treatment, wrapping, and overflow. Test the deployed `*.fly.dev` core flow. Record actual incremental commits and real decisions/corrections in `PROCESS.md` and `reflections/crit-7.md`; do not invent a process history. **Verify:** page loads at the Fly URL, the confirmed plan persists after reload, and the documents reflect actual work.

## 9. Acceptance checklist

- Search shows all four libraries in one view and handles date, time, and people inputs.
- A complete same-room result is preferred; split plans show room-change time and never overstate usable discussion minutes.
- The plan can hold more than one room/segment, with a visible owner for each.
- One demo user cannot confirm more than two hours of their own bookings in a day.
- A second participating demo user can approve a separate segment; pending approval expires after 30 minutes and never holds availability.
- Final confirmation is all-or-nothing and rechecks conflicts on the server.
- Confirmed plans and invitation states remain visible after reload.
- UI clearly says it is a prototype and does not imply real ANU inventory or real bookings.
- Desktop matches the primary visual reference, mobile matches the mobile reference, and keyboard/focus/labels/contrast are usable.
- Deployed app, commits, `PROCESS.md`, and `reflections/crit-7.md` satisfy the current Crit 7 brief.

## 10. Open real-world question

Before presenting this as a production proposal to ANU Library, ask whether different actual members of one group may make consecutive bookings for one continuous meeting and whether the same room may be used that way. Until answered, keep the collaboration feature explicitly described as a **proposed** improvement in the prototype.
