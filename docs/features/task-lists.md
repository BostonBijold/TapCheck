> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Task Lists (shift checklists)

The Today/Tasks page groups a company's shift checklists into `TaskList`s (Opening Shift, Mid-Shift, Closing Shift, and any manager-created custom lists — see "Manager-created task lists" below), plus one or more standalone "anytime" task lists for anytime/recurring tasks — see [anytime-tasks.md](anytime-tasks.md). Each list contains an ordered list of `Task`s, and each task's status for a given date is tracked by a separate `TaskLog` document, so history is never overwritten — every day gets its own log per task, shared across the whole company (any employee on shift can complete a given task — see [task-lists-api.md](../api/task-lists-api.md)).

## Task types

`Task.taskType` is one of:

- **`form`** — the only creatable type. Has a `formFields` array (number readings with an optional unit/min/max, or yes/no items); tapping it opens `components/TaskFormScreen.tsx` to fill in those fields, with elapsed time tracked the same way a timer would be.
- **`standard`** / **`stopwatch`** / **`checkbox`** — timer-based personal-habit item types from before the app's pivot to restaurant work checks. Kept in the schema for compatibility with old data; nothing in the UI creates them anymore.

## Log states (anytime tasks — `TaskCard`)

A `TaskLog` (see [task-lists-api.md](../api/task-lists-api.md)) has `state: "in_progress" | "paused" | "done" | "missed" | "rest"`, or simply has no log yet ("pending"). Neither `in_progress` nor `paused` counts as complete for a list's completion check.

The per-row action panel described below applies only to an **anytime task** (`TaskCard.tsx`, no `startTime` on its list — see [anytime-tasks.md](anytime-tasks.md)). A **shift-window task** (`TaskRow.tsx`, its list has a `startTime`) has no per-row actions at all — see "Task list locking & sequential-only completion" below.

- **pending** → tap opens the row and shows: Start Task (opens `TaskFormScreen` for a form task), or Missed/Rest buttons. If the list's scheduled window has passed ("back-entry" mode, see below), the start button is replaced by a Done button plus a manual minutes input (and, for a form task, the same field inputs).
- **in_progress** → shows "▶ Resume Timer" (reopens the timer, seeded with elapsed time from the server's `startedAt`) plus Missed/Undo. The API enforces that **at most one log can be `in_progress` at a time per person** (`performedByUserId`, not per company — different staff can each have their own timer running) — starting a timer elsewhere auto-*completes* whatever that same person left running instead of leaving two things active at once (see [timer.md](timer.md)).
- **paused** → same row treatment as `in_progress` ("▶ Resume Timer", reopening wherever it was left) — this state only ever arises from jumping to a different task inside an open Task List Session, never from anything on this row itself. Tapping "Resume Timer" on a paused task reopens the session at that task rather than a standalone timer, since a paused log always carries its session anchor. See [timer.md](timer.md) for the full pause/resume mechanics.
- **done** → shows an "Edit time" button that opens a manual start/end time editor, plus Missed/Rest/Undo.
- **missed** / **rest** → shows a retry action (Start Task, or Done+minutes if in back-entry mode) plus the other skip state and Undo.
- **Undo** (any logged state) calls `onStateChange(null)`, which `DELETE`s the log entirely — the task returns to pending. **Manager-only** — see "Manager-only Undo" below.
- **Manual time entry** ("Edit time" / "Log with specific times") lets the user type a start and end clock time directly; it computes minutes client-side and calls `onStateChange("done", { startedAt, completedAt })`, which bypasses the timer UI entirely and PATCHes explicit timestamps (see task-lists-api.md).

Implemented in `components/TaskCard.tsx` (`app/api/task-logs` is the log endpoint used by every action above — see [task-lists-api.md](../api/task-lists-api.md)).

## Time-aware collapse (today only)

Each shift-window list (except an anytime list, see [anytime-tasks.md](anytime-tasks.md)) has a `startTime` (`HH:MM`) and an implied end time, `deriveCollapseAfter`, computed as `startTime + sum(projectedMinutes of all non-checkbox tasks)` (`components/TaskListCard.tsx`). On today's view:

- **Before `startTime`** — collapsed, shown as "starts `HH:MM`".
- **Between `startTime` and the derived end time** — expanded by default.
- **After the derived end time** — collapsed by default, and tasks switch into **back-entry mode**: the timer-start action is replaced by a Done button with a manual minutes input, since the scheduled window has passed.
- Once every visible task in the list is `done`/`missed`/`rest`, the card auto-collapses to a summary view after a 600ms delay (today's view only).
- **Past dates** (via the date nav) always render expanded, unconditionally, so history is fully visible — the time-window logic above only applies when viewing today.

A custom list without a `startTime` never derives a collapse window and simply stays expanded/manually-toggleable.

## Day-of-week visibility

Every `Task` carries its own `scheduledDays` (0=Sun..6=Sat), and `lib/task-visibility.ts`'s `isTaskVisibleOn` gates whether it actually renders on the Tasks page for a given date — a task not scheduled for today's day-of-week is hidden entirely, not just dimmed. A `TaskList` also carries its own `scheduledDays`, purely as a **default that gets pushed down** onto every task in it (overwriting each task's own field) whenever a manager changes the list's schedule — see "List-level scheduling" below. This means a not-scheduled list's tasks disappear for the day as a direct consequence of that push-down, with no separate list-level visibility check needed; a task still shows despite its list being off that day only if it was individually re-edited afterward to include that day, since editing one task's own `scheduledDays` doesn't touch its siblings.

This is a deliberate simplification: `scheduledDays`-based hiding applies uniformly to every task, including ones that had a custom schedule before list-level scheduling existed — previously `scheduledDays` only affected the weekly analytics/streak dot, never whether a task actually appeared; now it does both.

## List-level scheduling

`PATCH /api/task-lists/[taskListId]` accepts a `scheduledDays` field (in `components/TaskListEditView.tsx`'s "Days scheduled" row). Saving it does two things in one request: updates the `TaskList.scheduledDays` field itself, and overwrites `scheduledDays` (clamping `successThreshold` down to fit, never up) on **every** `Task` currently in that list. This always overwrites, even a task a manager had previously customized independently on its own edit form — simplest option to build, and documented as a deliberate choice rather than an oversight: a task can still be reopened and re-customized afterward on top of the new default (a default-then-override relationship, not a hard lock), it just doesn't survive the *next* list-level schedule change.

## Streaks & variance

Each row shows `StreakDots` (`components/StreakDots.tsx`) — a dot strip built from `weekLogs`, one dot per day of the **fixed Sunday–Saturday calendar week** containing `today` (`lib/week-dates.ts`'s `calendarWeekDates`, computed once server-side in `app/(app)/tasks/page.tsx` and passed down as `weekDates`/`weekLogs`). This is a fixed frame, not a trailing "last 7 days" window — the dot for a given weekday always sits in the same position regardless of what day it currently is. `StreakDots` has no day-letter labels at all, unlike the Analytics chart (see `analytics.md`) — deliberately a lighter-weight treatment since this strip repeats on every row — but the dot for whichever date is currently being viewed (`viewingDate` — `selectedDate` from the date nav, `today` when nothing's been navigated) still gets a small gold ring around it so it's identifiable without one. Browsing to a past date via the date nav moves this ring to that date's dot instead of leaving it on today's — e.g. viewing a Sunday highlights the first (leftmost) dot in the strip. `viewingDate` is deliberately a separate prop from `today`: which days are `pending` in the weekly-progress math (below) always stays anchored to the real date, never to whatever's being browsed. For timed tasks marked done, the row also shows the variance between `actualMinutes` and `projectedMinutes` (e.g. `+8m` in an "over" color, `-3m` in an "under" color).

"This week" is Sunday–Saturday specifically, by design — a fixed calendar-week frame, not a trailing 7-day window.

### Weekly schedule + success threshold

Every `Task` carries `scheduledDays` (0=Sun..6=Sat, which days it's expected — default every day, and see "List-level scheduling" above for how a manager sets this for a whole list at once) and `successThreshold` (how many of this week's *scheduled* days need to be `done`/`rest` to read as 100%, default = the number of scheduled days). Both are set/edited via the schedule row and threshold input in the task's inline edit form (`components/TaskListEditView.tsx`'s `SortableRow`, reached through "⚙ Manage" — see "Reordering & editing task lists" below) or at creation time in `AddTaskSheet`'s custom-task form.

The shared math lives in `lib/task-progress.ts`'s `computeWeeklyProgress` (imported by both `StreakDots` and the Analytics Task Breakdown, see `analytics.md`, so the two never diverge). Each of the week's 7 days classifies into one of six states — the first two are solid fills ("something happened"), the rest are hollow, no-fill outlines distinguished by border color/style ("needs a look"), deliberately so a close-but-different fill color is never the only thing telling two states apart:

- **`done`** — logged done that day (solid fill); counts toward `successCount` regardless of how the color reads — going over time is still a win against the threshold, it just renders differently, see "Timing color" below
- **`rest`** — an intentional skip (solid blue-muted fill) — counts toward `successCount` exactly like `done`, never rendered as a fail state
- **`missed`** — an explicit Missed tap (hollow, solid red/burgundy-light border, ✕ mark where there's room) — deliberately distinct from `unlogged` below even though both are equally "not a success" for the math
- **`unlogged`** — a strictly-past scheduled day with no log at all (hollow, solid grey/dim border, no mark) — a read-time interpretation only, nothing is ever written to the database to represent it
- **`pending`** — a scheduled day that's today (and not yet resolved) or later this week (hollow, **dashed** grey/dim border — the dash is what separates it from `unlogged`'s solid border)
- **`not_scheduled`** — a day outside `scheduledDays` entirely (very faint solid fill, no border) — excluded from every count above; a log that happens to exist on a non-scheduled day (e.g. logged anyway) is invisible to this math, not a bonus. As of "Day-of-week visibility" above, this state now also means the task is hidden from the Today view that day, not just dimmed in the streak strip.

### Timing color (done days only)

A `done` day is also colored by how close `actualMinutes` came to the task's target (`projectedMinutes`) — a display-only tier, computed by the same `computeWeeklyProgress` (its `timing` field), that never affects `successCount`/`percentage`/pacing above. Only two tiers, deliberately:

- **green** (olive) — at or under target (`actualMinutes / projectedMinutes <= 1`)
- **amber** — over target by any amount, however severe — there's no third "way over" tier

**Red is reserved exclusively for `missed`** — no other day state, solid or hollow, ever renders red. Overtime, no matter how extreme, stays amber; severity within "overtime" is deliberately not surfaced as a separate color.

Only applies to tasks with a real time target — a form task's fields aren't timed against a target the same way, so this tiering is mostly a legacy concern from the pre-pivot timer types.

The resulting percentage (`successCount / successThreshold * 100`) is **uncapped** — hitting the threshold with days to spare stays a win past 100%, it doesn't clamp back down. A three-state, non-gradient **pacing** verdict — `green` (threshold already reached), `red` (mathematically out of reach even with a perfect rest of the week: `successCount + remainingScheduled < successThreshold`), `amber` (still achievable, everything else) — drives the Analytics Task Breakdown's bar/badge (`StreakDots` itself doesn't surface pacing, only the per-day dots).

## Manager-created task lists

Any signed-in manager (`User.role === "manager"`) can create a new task list from the Tasks page's "+ Add Task List" button (`components/AddTaskListSheet.tsx`) — name and optional start time (blank = an anytime list that never collapses), then straight into `AddTaskSheet` to build out its tasks, the exact same browse-catalog-or-build-custom flow used everywhere else. `POST /api/task-lists` is manager-gated server-side too (`403` for an employee), same as rename (`PATCH`) and delete (`DELETE`) below — see [task-lists-api.md](../api/task-lists-api.md).

## Editing, renaming, and deleting task lists

- `components/TaskListEditView.tsx` (`app/(app)/tasks/[taskListId]/edit/page.tsx`) — dedicated per-list edit page: a drag-to-reorder task list, each task's inline edit form (name, icon, fields, schedule/threshold — see `TaskFieldsEditor.tsx`), the "Add task" sheet, and the list's own name/`startTime`/`scheduledDays`. Also displays each list's and task's raw Mongo `_id` read-only (`select-all`, no copy button) — these are the ids the [external API](../api/external-api.md) needs to target a specific timer. Its per-task inline edit form (`SortableRow`) is also where a task's own `scheduledDays`/`successThreshold` (see "Weekly schedule + success threshold" above) get edited after creation — a day-of-week toggle row plus a threshold input, clamped client-side to never exceed the number of selected days.
- Deleting a task is a **soft delete** (`isActive: false`, via `DELETE /api/tasks/[id]`) — history in `TaskLog` is preserved even after a task is removed from the active list.
- **Renaming a list, changing its schedule, or deleting it** are all manager-only actions on this page — see "Manager-created task lists" above. Deleting a list is also a **soft delete** (`TaskList.isActive: false`, via `DELETE /api/task-lists/[taskListId]`) — its `TaskLog`/`TaskListSession` history is untouched, it just drops off the active Tasks page.

## The "Start Tasks" sequential session

Tapping "Start Tasks"/"Continue Tasks" on a list (not shown for an anytime list) opens `components/TaskListSessionView.tsx`, which steps through that list's tasks one at a time in a single full-screen flow rather than expanding rows individually. Each task gets its own server-side `in_progress` record as it becomes current, and closing the session mid-task flushes that task's progress rather than discarding it — full mechanics in [timer.md](timer.md).

## Task list locking & sequential-only completion

A shift-window list's tasks (any list with a `startTime` — Opening/Mid/Closing/a manager-created custom list with one set) can only move forward through that list's own "Start Tasks"/"Continue Tasks" session, one person at a time. An anytime list (see [anytime-tasks.md](anytime-tasks.md)) is unaffected by everything in this section.

### Shift-list rows are view-only

`TaskRow.tsx` has no Start/Missed/Rest/Undo/Edit-time actions at all — tapping a row only expands it to show its current state and, for a `form` task already `done`, the captured field readings (`TaskLog.formData`, threaded down through `TasksView`/`app/(app)/tasks/page.tsx`). The only way to move a shift-list task forward is that list's own session.

This is enforced server-side too, not just by removing the buttons — `lib/task-log-actions.ts`'s `assertShiftListSessionAuthorized(companyId, taskId, sessionTaskListId)` rejects (`403`) any `POST`/`PATCH` to `/api/task-logs` for a shift-list task unless `sessionTaskListId` (a fresh request's own param when starting a timer, or the log's already-carried-over `sessionTaskListId` for a terminal write) matches that task's own `taskListId`. The per-task `in_progress` start `TaskListSessionView.tsx` fires the moment a task becomes current stamps that anchor before Done/Missed/Rest ever becomes reachable, so anything that actually came through the session is authorized; a direct call bypassing it has nothing to match and is rejected. An anytime task is never restricted (its list has no `startTime`).

### Session lock — one person at a time

`TaskListSession.performedByUserId` (see [timer.md](timer.md)) doubles as a lock on that list's open (`in_progress`) session:

- **No open session, or the open session is yours** → the "Start Tasks"/"Continue Tasks" button (`TaskListCard.tsx`) behaves as before, tappable.
- **Open session, held by someone else** → the button becomes a non-tappable **"In progress by `<name>`"** label.
- **Same, viewed by a manager** → same label, plus a small **unlock icon** next to it. Tapping it shows an inline confirm ("Remove `<name>` from this task list so someone else can continue?"); confirming calls `POST /api/task-lists/[taskListId]/unlock-session` (manager-gated, `403` for an employee), which clears `performedByUserId` back to `null` on the *existing* session via `lib/task-list-session-actions.ts`'s `unlockSession` — nothing is closed, duplicated, or reassigned, and already-completed tasks in it stay exactly as they are.

An unlocked session (`performedByUserId: null`) behaves exactly like a brand-new one for claiming purposes: `ensureOpenSession` claims it for whoever next starts a task in that list, the same mechanism that stamps it on a session's first-ever touch. `GET /api/task-lists/session-locks?date=<date>` (polled by `TasksView.tsx` alongside logs) reports which of the company's shift-window lists currently have a *claimed* lock — an unlocked session reports no lock at all.

### FAB-scan → continue-list prompt

After a task opened via the FAB's "scan to open" shortcut (see [nfc.md](nfc.md)) is completed through `TaskFormScreen`'s Save, `TasksView.tsx`'s `handleTaskFormComplete` checks whether that task's parent list has other tasks today still untouched (no log at all) and isn't locked by someone else. If so, a small prompt offers to jump straight into that list's session at the next pending task ("Continue Tasks") or stay standalone ("Not now") — a one-off convenience, not a replacement for the session: continuing just claims/rejoins the list's session like any other touch.

### Manager-only Undo

`DELETE /api/task-logs` (Undo — deletes a `TaskLog` entirely, returning a task to pending) is manager-only server-side (`403` for an employee), **everywhere** — anytime tasks included, no exceptions and no "same person, same moment" carve-out. An employee who logs a wrong value asks a manager to undo it rather than fixing it themselves. `TaskCard.tsx`'s three Undo buttons (done/missed/rest) are gated client-side the same way (`canUndo={userRole === "manager"}`, threaded down from `TaskListCard.tsx`).

## Files

- `app/(app)/tasks/page.tsx` — server component: auth, seeding, loads task lists/tasks/logs for the selected date.
- `components/TasksView.tsx` — top-level client state: selected date, logs map, opens/closes the timer/session/add-task-list overlays, all the `handleStateChange`/`handleStartTimer`/… handlers.
- `components/TaskListCard.tsx` — per-list card: collapse logic, completion check, the "Start Tasks" button's three lock states, renders `TaskRow` (or `TaskCard` for an anytime list).
- `components/TaskRow.tsx` — per-task row for a shift-window list — view-only, see "Task list locking" above.
- `components/TaskCard.tsx` — per-task card for an anytime list — the full action panel (all states above).
- `components/TaskListSessionView.tsx` — sequential multi-task session (see [timer.md](timer.md)).
- `components/DateNav.tsx` — the `< Today >` date picker driving `selectedDate`.
- `components/TaskListEditView.tsx` — list/task management, including rename/schedule/delete for the list itself (also the path for editing an anytime-list task — see [anytime-tasks.md](anytime-tasks.md)).
- `components/AddTaskListSheet.tsx` — the "Add Task List" name+start-time step, manager-only.
- `lib/task-visibility.ts` — day-of-week visibility gate (see "Day-of-week visibility" above).
- `lib/task-progress.ts` — the shared weekly-progress math (see "Weekly schedule + success threshold" above).
- `lib/task-list-session-actions.ts` — session bookkeeping, including the lock helpers (`getOpenSessionLocks`, `unlockSession`) — see "Task list locking" above.
- `lib/task-log-actions.ts` — `assertShiftListSessionAuthorized`, the server-side lock enforcement.
- `app/api/task-lists/session-locks/route.ts`, `app/api/task-lists/[taskListId]/unlock-session/route.ts` — the lock-reading and manager-only unlock endpoints.
- `lib/seed.ts` — idempotent seeding of default shift task lists/tasks for a new company.

## Depends on

[`docs/api/task-lists-api.md`](../api/task-lists-api.md) — task lists, tasks, and task logs endpoints.
