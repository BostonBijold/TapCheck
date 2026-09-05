> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Console — Reports

**Status: BUILT.** A page inside the existing
[`admin-console.md`](admin-console.md) section. Rides on the owner-or-
manager console gate established in
[`console-task-management.md`](console-task-management.md) — no auth-gate
change was needed, since Reports is already a manager-and-up page on
mobile (not owner-only like Locations/Team/Rollup).

## User story

As a manager or owner, see the same Reports data available on the phone —
Overview, Logs, Inventory — laid out for a desktop browser instead of
getting bounced into the mobile-shaped `/reports` page. Previously,
clicking a location row in the console's Rollup Dashboard set that
location active and pushed to `/reports`, which visibly shrank the whole
browser window down to phone-width chrome. This page replaces that jump
with a real console page, same data, same APIs, desktop layout.

## What this is not

Not the cross-location rollup — that's `admin-console.md`'s Phase 2,
`/console/rollup`, `GET /api/reports/rollup`, and is unaffected by this
page. This is the **single-location** Reports view (Overview/Logs/
Inventory), reused here for whichever one location is currently active —
same scoping mobile has always used, nothing new aggregated.

## Page: `/console/reports`

Owner or manager (not employee). Reuses every existing route as-is — no
new backend:

- `GET /api/reports?days=7|30&localDate=YYYY-MM-DD` — Overview data.
- `GET /api/reports/leaderboard?days=7|30&localDate=YYYY-MM-DD` —
  completion-rate ranking, on-time/late breakdown.
- `GET /api/reports/inventory?days=7|30[&itemTypeId=]` — Inventory tab's
  trend chart.
- `GET /api/inventory-item-types` — Inventory tab's below-par callout.
- `GET /api/task-logs/history` — Logs tab, paginated date-range query.
- `PATCH /api/session/active-location` — the location switcher, same
  endpoint mobile and the Rollup Dashboard's row-click already call.

Every one of these already resolves `locationId` via
`pickActiveLocationId`/`sessionUser.activeLocationId` server-side (see
[`reports.md`](reports.md)'s "Location scoping") — the console page just
fetches them and renders the response, no new location-handling logic
anywhere.

### Role view

Console Reports always shows the manager-shaped view — task list
performance, the leaderboard, exception callouts, inventory — since every
console viewer is manager-or-above already (an employee can't get into
`/console` at all, so mobile's `EmployeeOverview.tsx` personal variant has
no console equivalent and none of `ReportsContent.tsx`'s role branching
was carried over).

### Reused vs. rebuilt

**Rebuilt, not reused**: the actual presentational layout. Rather than
dropping mobile's `ManagerOverview.tsx`/`Leaderboard.tsx`/
`ExceptionCallouts.tsx`/`LogsTab.tsx`/`InventoryTab.tsx` into a centered
phone-width column (this spec's Open Question #1, resolved this
direction), each tab got new desktop-shaped components under
`components/console/reports/` that fetch the identical endpoints and use
the extra screen width — grids instead of single columns, real `<table>`s
instead of stacked divide-y rows (matching the console's existing table
convention from `TeamTable.tsx`/`RollupTable.tsx`), side-by-side cards
instead of stacked ones.

**Reused directly, not rebuilt** — pure logic/types with no mobile-layout
assumptions baked in, imported straight from their existing files rather
than re-derived (so the two surfaces can't quietly disagree on what a
number or color means):
- `components/reports/shared.ts` — `ReportsData`/`TaskListStats`/
  `TaskStats` types, `fmtMins`, `utcMinsToLocalTime`, `barColor`,
  `completionBarColor`, `PACING`.
- `lib/task-progress.ts` — `WeeklyProgress`/`DayBreakdown` types (via
  `shared.ts`'s re-export).
- `components/TaskRow.tsx` — `BADGE`/`LABEL` (Logs tab state pills).
- `lib/format-relative-time.ts` — `formatRelativeTime` (Inventory tab
  "logged Xh ago").
- `components/LocationSwitcher.tsx` — the location switcher itself. Not a
  presentational content component in the "which tab layout" sense above;
  reused unmodified the same way `AddTaskSheet.tsx` was reused as-is by
  `console-task-management.md`.
- The exception-callout sort logic (worst lists, variance outliers) and
  the leaderboard/logs fetch-and-filter logic are re-implemented inline in
  the new components rather than imported, since the originals
  (`ExceptionCallouts.tsx`, `Leaderboard.tsx`, `LogsTab.tsx`) are
  presentational components, not extracted pure functions — but the
  actual filter/sort predicates (`avgCompletionRate < 0.9`, `engagedDays
  >= 3`, `MIN_ENGAGED_TO_RANK`'s server-side equivalent) are copied
  verbatim from those files, not reinvented.

### Tabs

Same three as mobile's `ReportsContent.tsx`: **Overview**, **Logs**,
**Inventory** — a segmented control at the top of the page (no bottom
nav — the console has none), in
`components/console/reports/ConsoleReportsView.tsx`. Each tab fetches its
own data on mount; switching the active location remounts the whole tab
subtree via a `key` bump on `${activeLocationId}-${refreshTick}`, same
pattern `ReportsView.tsx` uses on mobile.

- **Overview** — `ConsoleOverviewTab.tsx`. A 4-tile stat strip (avg
  completion, tasks logged, needs-attention count, timing-outlier count —
  new, no mobile equivalent, styled like `RollupTable.tsx`'s `StatTile`),
  the two exception callouts side by side instead of stacked, the
  leaderboard as a full `<table>` (rank/name/done-engaged/on-time/late/
  missed/completion — no expand-per-row, since a table has room to show
  it all at once), a Task List Performance card grid (2 columns,
  `TaskListMiniChart.tsx` — same `barColor`/`dayLabel` math as mobile's
  `TaskListChart.tsx`, always shows day labels since a grid card has the
  room), and a Task Breakdown `<table>` per task list (task/done/missed/
  unlogged/avg actual/progress) instead of `TaskStatRow.tsx`'s
  per-task segmented-bar card.
- **Logs** — `ConsoleLogsTab.tsx`. Same filters (date range, team-member
  select, task-list select) as mobile, always shown (no employee-personal
  variant to branch on); results as a `<table>` instead of stacked rows.
  Same trailing-14-day default window, same "Load more" pagination (no
  infinite scroll).
- **Inventory** — `ConsoleInventoryTab.tsx`. Same below-par callout and
  manager-defined group sections as mobile's `InventoryTab.tsx`, but each
  group renders as a 2-column card grid (`InventoryTrendChart.tsx` per
  card — same bar-chart-normalized-to-window-max math as mobile) instead
  of one stacked column. Confirmed as the intended scope (Open Question
  #3): this is the existing read-only Inventory *reporting* tab only, not
  a full inventory-management CRUD page — that already exists separately
  at `/inventory/manage`, reached from the mobile Inventory tab and a
  Profile card, unaffected by this page.

### Location switcher

`components/LocationSwitcher.tsx`, reused unmodified, rendered inline on
the page itself (Open Question #2, resolved as the simpler default — only
Reports needs one today, so no persistent-console-chrome version was
built). Same gating as mobile: visible only for an owner at a company
with 2+ active locations. Selecting a location `PATCH`es
`/api/session/active-location`, then bumps `refreshTick` to remount the
active tab — it does **not** navigate anywhere, unlike the Rollup
Dashboard's row click below.

### Fix: Rollup Dashboard's row click

`components/console/RollupTable.tsx`'s row click used to `PATCH
/api/session/active-location` then `router.push("/reports")` — the
mobile page, the exact "screen shrinks to an iPhone" symptom this page
fixes. Now that this page exists, that push target is
`router.push("/console/reports")` instead — same `PATCH`, same intent
(deep-link into that location's numbers), staying inside the console.

### Sidebar

`components/console/ConsoleSidebar.tsx` gained a **Reports** item (same
`BarChart3` icon mobile's own Reports tab uses), visible to both owner and
manager — same visibility as Task Management, unlike Locations/Team/
Rollup which stay owner-only. Rollup Dashboard's own icon changed from
`BarChart3` to `LayoutDashboard` now that both sit in one sidebar and
can't share an icon. Owner nav, in order: Locations, Team & Access, Task
Management, Reports, Rollup Dashboard. Manager nav: Task Management,
Reports.

Neither role's default landing page changed — an owner still lands on
`/console/locations`, a manager still lands on `/console/tasks`, per
[`console-task-management.md`](console-task-management.md). Reports is an
additional reachable page, not a new default for either role.

## Depends on

[`features/reports.md`](reports.md) — every reused route, and the
location scoping/role-split logic this must not diverge from.
[`admin-console.md`](admin-console.md) — the Rollup Dashboard and its
row-click behavior this replaces, the sidebar/shell conventions this adds
to. [`console-task-management.md`](console-task-management.md) — the
owner-or-manager console gate this page reuses without modification.
[`features/locations.md`](locations.md) — `LocationSwitcher`,
`activeLocationId`, `PATCH /api/session/active-location` mechanics.
