> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Admin Console (Desktop) — Owner Multi-Location Management

**Status: BUILT.** Phases 1a, 1b, and 2 are all shipped — see "Current
state" below for what actually exists vs. the original spec's phrasing.

## Purpose & scope

A dedicated, desktop-first section of the app for an **owner** to manage
their company across every location: team roster and access, invites,
location CRUD, and a cross-location rollup dashboard. Nothing about the
mobile experience changed — Tasks/Team/Reports/Inventory on the Capacitor
app and in a mobile browser stay exactly as documented in
[`team-invites.md`](team-invites.md), [`locations.md`](locations.md),
[`reports.md`](reports.md), and [`inventory.md`](inventory.md). This is
additive.

**Why a separate section instead of responsive breakpoints on the
existing pages:** the mobile UI is built around bottom-sheet modals,
single-column card lists, a `<select>`-based location switcher, and
bottom-nav chrome (`app/(app)/layout.tsx`). Retrofitting that with desktop
breakpoints would mean branching two component trees inside the same
files. A separate route group gets a clean owner-only gate at the layout
level, a natural home for real tables and bulk actions, and — critically —
a natural home for the rollup dashboard, which had **no existing
precedent to retrofit at all** (see Phase 2 below). Team/Location
management screens in the new section call the *existing* mobile APIs —
no backend duplication for those (Phase 2's rollup route is the one
genuinely new backend surface).

## Architecture

### Route structure

`app/(console)/console/**` — a route group, parallel to `app/(app)/`, not
nested inside it. Pages:

- `app/(console)/console/layout.tsx` — owner-only gate + sidebar shell.
- `app/(console)/console/page.tsx` — redirects to `/console/locations`
  (no landing content of its own).
- `app/(console)/console/locations/page.tsx` — Location CRUD (Phase 1a).
- `app/(console)/console/team/page.tsx` — Roster, invites, access (Phase 1b).
- `app/(console)/console/rollup/page.tsx` — Cross-location dashboard (Phase 2).

### Auth gate

`app/(console)/console/layout.tsx` (server component) calls the existing
`resolveSessionUser()` (`lib/session.ts`):

- No `companyId` → renders `components/NoCompanyMessage.tsx`, same as the
  mobile app (not an owner-specific case — reused as-is).
- `companyId` present but `role !== "owner"` → `redirect("/tasks")`. A
  manager/employee never sees this section exist; no "upgrade your
  role"/teaser messaging, just a plain redirect, matching the app's
  existing pattern of not exposing UI a role can't use.
- Owner → renders `components/console/ConsoleShell.tsx`.

This is a layout-level check, not a `middleware.ts` matcher addition —
`middleware.ts`'s existing matcher already covers `/console` for the
plain "is there a session at all" check (it excludes only static assets,
`api/auth`, and `api/cron`), so no middleware change was needed; the
company/role-tier check happens one layer in, inside this server
component, same precedent as `NoCompanyMessage.tsx`. Each of the three
section pages (`locations`, `team`, `rollup`) also calls
`resolveSessionUser()` itself for its own props (e.g. `team/page.tsx`
needs `currentUserId` for the roster's "(you)" label) — a second DB read
per navigation, same non-concern the original spec flagged, confirmed by
building it: every other page in the app already does its own
`resolveSessionUser()` call regardless of any layout-level check.

### Nav & shell

`components/console/ConsoleSidebar.tsx` — a fixed 240px sidebar (not
bottom nav): **Locations**, **Team & Access**, **Rollup Dashboard**, with
the signed-in user's name and a **Sign Out** button pinned at the bottom
(`next-auth/react`'s `signOut()`, same call `ProfileView.tsx` uses).
`components/console/ConsoleShell.tsx` wraps the sidebar and a
`max-w-5xl` centered content area — desktop layout, no mobile safe-area
handling. Components live under `components/console/` — a sibling to
`components/`, not mixed into it, so nothing here risks touching a shared
mobile component by accident. No new UI dependency was needed — same
Tailwind setup as the rest of the app, same `lucide-react` icon set.

### Reachability from the iOS app

**Resolved** (was Open Question #1): `components/console/ConsoleShell.tsx`
checks `Capacitor.isNativePlatform()` client-side on mount and, if native,
renders an in-place "Open this on a computer" message instead of the
sidebar/table content — no redirect to `/tasks` (simpler than plumbing a
message through a query param, and avoids a jarring auto-navigation away
from a URL the owner explicitly opened).

## Phase 1a — Locations CRUD (built)

Thinnest slice, existing API only, no new backend work.

- `GET /api/locations` — list.
- `POST /api/locations` — create (owner-only).
- `PATCH /api/locations/[id]` — rename/re-address/re-zone.
- `DELETE /api/locations/[id]` — soft-delete/close.

`components/console/LocationsTable.tsx`: Name, Address, Timezone, Actions
(edit, close) — **no Status column**: `GET /api/locations` only ever
returns active locations (a closed one just disappears from the list,
same soft-delete convention as `TaskList`), so there is no "closed" row
this table could ever render; the spec's draft "Status (active/closed)"
column was dropped for this reason rather than fabricated with fake data.
"+ Add Location" expands an inline editable table row (name required,
address/timezone optional); editing an existing row swaps it into the
same inline-input row shape rather than a separate modal.

## Phase 1b — Team & Access (built)

Reuses existing mobile APIs: `GET`/`POST /api/invites`, `DELETE
/api/invites/[id]`, `GET /api/team`, `PATCH /api/team/[userId]`, `DELETE
/api/team/[userId]`, `GET /api/locations` (for pickers).

**One net-new piece of UI wiring, plus one small additive API field**: a
location-reassignment control. `PATCH /api/team/[userId]`'s owner-only
`locationId` field has existed since the Locations feature shipped, but —
per `team-invites.md`'s "Known gaps" — `TeamMemberActionSheet.tsx` (the
mobile action sheet) has no button that calls it. `components/console
/TeamTable.tsx`'s roster now has a per-row location `<select>` that calls
this endpoint directly. This needed one additive field on `GET /api/team`
that didn't exist before: the response now includes each member's
`locationId` (`app/api/team/route.ts`) so the dropdown can show a current
selection — the mobile `TeamView.tsx` ignores the new field, unaffected.

Roster table (`TeamTable.tsx`): Name, Role, Location (editable dropdown,
owner-only per above), Joined date, Actions (make manager/employee,
remove — same guards as mobile: can't touch a fellow owner's role, can't
demote/remove the last manager with zero owners as backstop).
**Unfiltered by location** — the console's `GET /api/team` call never
sends `activeLocationId`, so this table always shows the whole company,
unlike the mobile Team tab's owner-switcher-scoped view.

Invite panel (`components/console/InvitePanel.tsx`): role select,
location select (required, same validation `POST /api/invites` already
enforces for an owner), one-time vs. reusable checkbox, Generate → shows
the link with a **Copy** button (no Web Share API call — that was a
mobile-only fallback path; desktop just copies to clipboard). Pending
invites table in the same component: Role, Uses remaining, Expiry,
Created by, Revoke button (`DELETE /api/invites/[id]`).

`components/console/TeamConsoleView.tsx` is the page-level coordinator
(client component) holding the shared `team`/`invites`/`locations` state
both `TeamTable` and `InvitePanel` need and wiring their callbacks to the
API routes above — not one of the spec's originally-named components, but
needed to avoid duplicating that fetch/refresh logic across two files.

## Phase 2 — Cross-location rollup dashboard (built)

The genuinely new part — the piece with no existing precedent.
`reports.md` and `locations.md` both flagged multi-location rollup as
explicitly out of scope; this is where it was built.

### `GET /api/reports/rollup?days=7|30&localDate=YYYY-MM-DD`

`app/api/reports/rollup/route.ts` — owner-only (`403` otherwise — a
manager/employee only ever has one location, so this view has no meaning
for them). Response shape:

```ts
{
  dates: string[];
  days: number;
  today: string;
  locations: Array<{
    locationId, locationName,
    avgCompletionRate: number,   // doneCount / (doneCount + missedCount) — see lib/reports.ts
    totalTasksLogged: number,    // doneCount + missedCount + restCount
    missedTaskListCount: number, // MissedListAlert rows in the window
    belowParItemCount: number,   // InventoryItemType par comparison, this location's logs
    activeEmployeeCount: number,
  }>;
  companyTotals: {
    avgCompletionRate: number,   // summed doneCount/engagedCount across every location, NOT an
                                 // average of each location's own percentage — a low-volume
                                 // location would otherwise skew the total as much as a
                                 // high-volume one
    totalTasksLogged: number,
    missedTaskListCount: number,
    belowParItemCount: number,
  };
}
```

**Implementation**: `lib/reports.ts` (new) holds two small,
`locationId`-parameterized helpers shared with the rest of the reports
surface so the numbers can never quietly drift apart:

- `getLocationTaskCounts(companyId, locationId, dates)` — fetches this
  company's active `Task`s and every matching `TaskLog` in the window,
  returns raw `{ doneCount, engagedCount, totalTasksLogged }` counts
  (never a pre-divided rate — the rollup route sums numerators/
  denominators across locations before dividing for `companyTotals`,
  rather than averaging percentages).
- `getBelowParCountForLocation(companyId, locationId)` — same "latest
  logged count ≤ parLevel" comparison `GET /api/inventory-item-types`
  already makes per-row, parameterized by location via the existing
  `getLatestInventoryLogs` helper in `lib/inventory.ts`.

This is deliberately narrower than the full `GET /api/reports` payload —
no per-task daily breakdown, no weekly-progress/streak math — since the
rollup table only ever needs one number per location. `GET /api/reports`
itself was **not** refactored to call these helpers; it keeps its own
existing, more detailed aggregation untouched to avoid regressing a
working route with many other consumers (charts, weekly progress,
per-task variance). The drift risk this raised in the original spec is
scoped to `avgCompletionRate`/`totalTasksLogged` specifically, and both
routes computing "done state" the same way (`TaskLog.state === "done"`
etc.) makes silent divergence unlikely even without a forced shared code
path for the single-location view.

- `missedTaskListCount`: `MissedListAlert.countDocuments({ companyId,
  locationId, date: { $in: window } })` — already location-scoped, no
  model change.
- `activeEmployeeCount`: `User.countDocuments({ companyId, locationId,
  role: { $ne: null } })`.

### UI: `components/console/RollupTable.tsx`

- **Top strip**: four `StatTile`s — company-wide avg completion, tasks
  logged, missed lists, below-par items (the "at a glance across every
  store" view — see Phase 2's opening note).
- **Table**: one row per location; `missedTaskListCount`/
  `belowParItemCount` render in burgundy when `> 0`, matching the
  existing red-tint convention (`InventoryTab.tsx`, `ExceptionCallouts.tsx`).
- **Row click** → `PATCH /api/session/active-location` (same endpoint the
  mobile switcher calls) then `router.push("/reports")` — reuses the
  existing single-location Reports view rather than rebuilding it inside
  the console.
- 7-day / 30-day toggle, matching the existing Reports convention.

### Deferred (unchanged from the original spec)

No trend-over-time rollup chart, no CSV export, no per-location target/
goal overrides — all still out of scope, same reasoning as the original
draft.

## Resolved open questions

1. **`/console` inside the Capacitor iOS shell** — resolved: blocked via
   `ConsoleShell.tsx`'s client-side `Capacitor.isNativePlatform()` check,
   rendering an in-place message rather than redirecting to `/tasks`. See
   "Reachability from the iOS app" above.
2. **Single-location owner visibility** — resolved as recommended: the
   console is visible regardless of location count. Nothing in the layout
   gate checks location count at all.
3. **Job tags catalog UI** — still not built. Remains a candidate add-on
   for the Team page, same as the original note; `User.jobTags` is still
   schema-only.
4. **`missedTaskListCount`/`belowParItemCount` as the two "at a glance"
   signals** — kept as the first-shipped pair. An avg-variance outlier
   column (borrowing `ExceptionCallouts.tsx`'s logic) remains a plausible
   future third column, not built.
5. **Auth gate mechanics** — confirmed as built: a layout-level
   `redirect()`, not a `middleware.ts` matcher.

## Depends on

[`features/locations.md`](locations.md) — `Location` model, `owner` role,
`listActiveLocations`, `validateLocationId`, the existing location-switcher
`PATCH /api/session/active-location` endpoint this reuses for the
rollup's row-click deep link. [`features/team-invites.md`](team-invites.md)
— `Invite` model, `GET`/`PATCH`/`DELETE /api/team*` this reuses directly.
[`features/reports.md`](reports.md) — `lib/report-dates.ts`'s
`getDates`/`elapsedDates`, and the single-location aggregation this phase
draws its own narrower helpers from rather than duplicating the counting
logic; also the explicit prior "multi-location rollup out of scope" notes
this doc supersedes. [`features/inventory.md`](inventory.md) — the
below-par comparison logic `getBelowParCountForLocation` is built from.
