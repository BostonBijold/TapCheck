> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Task Lists API

Covers task lists, tasks, and task logs — the three collections behind [task-lists.md](../features/task-lists.md), [anytime-tasks.md](../features/anytime-tasks.md), and [timer.md](../features/timer.md). For the API-key-authenticated variant of starting a timer (used by external triggers like an iPhone Shortcut), see [external-api.md](external-api.md) — it shares the exact same start-a-timer logic via `lib/task-log-actions.ts`, described below.

**Auth**: every handler resolves the signed-in user via `lib/session.ts`'s `resolveSessionUser()` — the NextAuth session, falling back to a hardcoded dev user/company *only* when `process.env.SKIP_AUTH === "true"` (never set in production), `401` otherwise. `companyId`/`role` are read fresh from the `User` document on every call (not cached on the JWT), and `companyId: null` (not yet attached to a company) is treated as `403`, never as a shared tenant. All three collections below scope every query by `companyId` — see CLAUDE.md's Multi-Tenancy section.

## Task Lists

Collection: `tasklists`. Schema (`models/TaskList.ts`): `companyId`, `name`, `timeOfDay: "morning" | "evening" | "custom" | "anytime"`, `startTime: string | null` (`HH:MM`), `order`, `isDefault`, `isActive` (default `true`), `scheduledDays: number[]` (0=Sun..6=Sat, default every day — a default pushed down onto every task in the list, see below).

### `GET /api/task-lists`
Returns every active (`isActive: true`) list for the company (`sort: { order: 1 }`), each with its active tasks nested inline.

Response: array of
```ts
{ _id, name, timeOfDay, order, tasks: [{ _id, name, icon, projectedMinutes, order }] }
```

### `POST /api/task-lists`
**Manager-only** (`403` for an employee). Request body: `{ name, startTime?: string | null, scheduledDays?: number[] }` — `400` if `name` is missing. Creates a new list at the end of the company's list order; `timeOfDay` is set to `"custom"` if `startTime` is given, `"anytime"` otherwise. Its tasks are added afterward through `POST /api/tasks` — see [anytime-tasks.md](../features/anytime-tasks.md), the same browse-catalog-or-build-custom flow used everywhere else. Response: `{ _id, name, timeOfDay, startTime, order, scheduledDays }`.

### `PATCH /api/task-lists/[taskListId]`
**Manager-only** (`403` for an employee). Request body: `{ name?: string; startTime?: string | null; scheduledDays?: number[] }`. Updates `TaskList.findOneAndUpdate({ _id: taskListId, companyId }, { $set: { name, startTime, scheduledDays } })`. `404` if not found.

If `scheduledDays` is present, it also pushes that value down onto **every** `Task` currently in the list (`Task.updateMany({ taskListId, companyId }, [{ $set: { scheduledDays, successThreshold: { $min: ["$successThreshold", clampedThreshold] } } }])`) — a manager turning Sunday off for the whole list shouldn't require editing each task by hand. This always overwrites, even a task that had been individually customized independently before this call — simplest option to build (documented as a deliberate choice, not a bug): a task can still be reopened and re-customized afterward on top of the new default, it just doesn't survive the *next* list-level schedule change.

Response: `{ _id, name, startTime, scheduledDays }`.

### `DELETE /api/task-lists/[taskListId]`
**Manager-only** (`403` for an employee). **Soft delete** — sets `TaskList.isActive: false` and saves; the document (and its full `TaskLog`/`TaskListSession` history) is never physically removed, it just drops out of `GET /api/task-lists`'s active set. Response: `{ ok: true }`.

### `GET /api/task-lists/start-next`
Query param `date` (defaults to today, `YYYY-MM-DD`). Read-only: loads all non-anytime lists (`timeOfDay !== "anytime"`, sorted by `order`), their active tasks (filtered through `isTaskVisibleOn`, so a task hidden today by its own `scheduledDays` is never offered), and that date's logs; **any** log for a task — regardless of state, including `in_progress` and `paused` — counts as "already logged" (skipped, not re-offered). Walks lists in order and returns the first task in the first list that has no log yet for that date.

Response: `{ hasNext: boolean, hasLogs: boolean }`.

> ⚠️ **Known issue**: nothing in the current app calls this route — it's dead code, carried over from before the rename. The FAB (`components/BottomNav.tsx`) today is purely an active-timer resume indicator; "Start Tasks"/"Continue Tasks" is a per-list button on `TaskListCard.tsx` that doesn't call this endpoint. Left in place rather than removed since deleting it isn't part of any active work.

## Tasks

Collection: `tasks`. Schema (`models/Task.ts`): `taskListId` (ref), `companyId`, `templateId: ObjectId | null` (ref `TaskTemplate`), `name`, `icon` (default `"✓"`), `projectedMinutes` (default `0`), `order`, `isActive` (default `true`), `taskType: "standard" | "stopwatch" | "checkbox" | "form"` (default `"form"` — `standard`/`stopwatch`/`checkbox` are kept for schema compatibility with pre-pivot data, but nothing in the UI creates them anymore), `scheduledDays: number[]` (0=Sun..6=Sat, default `[0,1,2,3,4,5,6]` — also the field a list-level schedule change overwrites, see above), `successThreshold: number` (how many of this week's *scheduled* days count as a win, default `7`), `formFields: FormFieldDef[]` (only meaningful when `taskType === "form"`; each entry is `{ key, label, type: "number" | "text" | "boolean", unit?, min?, max? }` — default `[]`).

`scheduledDays` gates whether a task actually appears on the Tasks page for a given date (`lib/task-visibility.ts`'s `isTaskVisibleOn`) as well as feeding the weekly analytics/streak math (see [`features/task-lists.md`](../features/task-lists.md#day-of-week-visibility) and [`features/analytics.md`](../features/analytics.md)) — a task not scheduled for today's day-of-week is hidden entirely, not merely dimmed.

**Backward compatibility**: `scheduledDays`/`successThreshold` were added after many tasks already existed. Mongoose schema defaults only apply on document creation, so a `.lean()` read of a pre-existing task can come back with them `undefined` — every server read site that builds a task for the client falls back explicitly (`scheduledDays ?? [0,1,2,3,4,5,6]`, `successThreshold ?? (scheduledDays?.length ?? 7)`) rather than trusting the field is present.

### `POST /api/tasks`
Adds a task to any list (shift-window or anytime — there is no separate anytime-task endpoint). Request body: `{ taskListId, templateId?, name, icon, projectedMinutes?, taskType?, scheduledDays?, successThreshold?, formFields? }` — `400` if `taskListId`/`name`/`icon` are missing.

Behavior: appends at the end of the list (`order` = current max + 1). Forces `projectedMinutes: 0` when `taskType === "checkbox"`, regardless of what was sent; otherwise uses the provided value or defaults to `15`. `scheduledDays` defaults to every day when omitted or empty; `successThreshold` defaults to `scheduledDays.length` and is **clamped** (not rejected) to never exceed it — a request asking for a mathematically impossible threshold is silently capped rather than erroring. `formFields`, if present, is validated shape-first — each entry must have a `key`/`label` string and a `type` of `"number" | "text" | "boolean"`; malformed entries are dropped rather than stored as-is.

Response: `{ _id, name, icon, projectedMinutes, order, taskType, scheduledDays, successThreshold, formFields }`.

### `PATCH /api/tasks/[id]`
Request body: any subset of `{ name, icon, projectedMinutes, taskType, scheduledDays, successThreshold, formFields }` — only these seven keys are read and applied via `$set`; anything else in the body is ignored. `404` if not found. `formFields` gets the same shape validation as `POST` above.

If either `scheduledDays` or `successThreshold` is present, the threshold is re-clamped against whichever `scheduledDays` is now in effect (the one just sent, or the task's existing one if only the threshold changed) — same silent-clamp behavior as `POST`. Clamping only ever lowers the threshold to fit a shrunk schedule; it never bumps a deliberately-lowered threshold back up just because `scheduledDays` changed for an unrelated reason (e.g. a day was re-added).

Response: `{ _id, name, icon, projectedMinutes, taskType, scheduledDays, successThreshold }`.

### `DELETE /api/tasks/[id]`
**Soft delete** — sets `isActive: false` and saves; the document (and its full `TaskLog` history) is never physically removed. Response: `{ ok: true }`.

### `PATCH /api/tasks/reorder`
Request body: `{ tasks: Array<{ _id: string; order: number }> }` — `400` if missing/empty. Runs one `updateOne({ _id, companyId }, { $set: { order } })` per entry (scoped to the authenticated company, so ids belonging to another company are silently no-ops). Response: `{ ok: true }`.

## Task Logs

Collection: `tasklogs`. Schema (`models/TaskLog.ts`): `companyId`, `performedByUserId` (the specific person who did it — an attribute, not part of the uniqueness key below), `taskId` (ref), `date` (`YYYY-MM-DD`), `actualMinutes?`, `startedAt?: Date` (null while `paused`), `completedAt?: Date`, `pausedSeconds` (default `0`), `state: "in_progress" | "paused" | "done" | "missed" | "rest"`, `note?`, `isBackEntry` (default `false`), `sessionTaskListId?: ObjectId | null` (ref `TaskList`, see below), `formData?: Record<string, string | number | boolean> | null` (see below), `tagId?: string | null`, plus timestamps. A **unique** compound index on `{ companyId, taskId, date }` means there is always exactly one log per task per day for the whole company — not per person, since any employee on shift might complete a given task — every write below is an upsert against that key, never a duplicate insert.

`formData` is set only on the terminal log for a `form` task (see `components/TaskFormScreen.tsx`) — the captured values, keyed by each field's `key` from the task's `formFields`. Every other task type leaves it `null`.

`pausedSeconds` banks elapsed time accumulated in an earlier running segment of the same log — total elapsed while `in_progress` is `pausedSeconds + (now - startedAt)`. It's only meaningful while `in_progress` or `paused`; every write below that transitions a log to a terminal state (`done`/`missed`/`rest`) resets it to `0` after folding it into `actualMinutes`.

`sessionTaskListId` is set while `state === "in_progress"` **or** `"paused"`, via either [`external-api.md`](external-api.md)'s `routineGroupId` param or a Task List Session's own in-session navigation (see below) — it anchors the timer inside a Task List Session for that list, so opening the app resumes into the session view at that task instead of the standalone timer. It's cleared (`null`) the moment the log reaches a terminal state, by either PATCH branch below. See [timer.md](../features/timer.md) for the client-side resume logic that reads it.

### `GET /api/task-logs?date=YYYY-MM-DD`
Returns all logs for the company on that date (defaults to today, computed **server-side in UTC** via `toISOString()` — not the client's local date) — company-wide, so any employee's completion of a shared task shows up for everyone.

### `POST /api/task-logs`
Request body: `{ taskId, date, state, actualMinutes?, isBackEntry?, sessionTaskListId?, sessionNav? }`.

- **`state: "in_progress"`** — branches on `sessionNav` in `lib/task-log-actions.ts`:
  - `sessionNav` **not set** (the default — standalone timer, and this route's only mode when called from outside a Task List Session) — delegates to `startInProgressLog(companyId, performedByUserId, taskId, date, sessionTaskListId)`. This enforces a **single-active-timer invariant** before writing anything: it queries for any other `TaskLog` for this specific person (`performedByUserId`) with `state: "in_progress"` and a different `taskId` (any date), and for each one found, **auto-completes** it (`state: "done"`, `completedAt: now`, `actualMinutes` derived from its `startedAt` plus any `pausedSeconds` it had banked, minimum 1, `pausedSeconds` reset to `0`, `sessionTaskListId` cleared) before proceeding. This is enforced server-side unconditionally, per person, not per company — different staff can each have their own timer running at once.
  - `sessionNav: true` (set only by `TaskListSessionView.tsx`'s in-session navigation — advancing or tapping a row to jump) — delegates to `switchActiveLog` instead. Same single-active-timer invariant, but the task being left is **paused**, not completed: `state: "paused"`, `startedAt: null`, `pausedSeconds` incremented by however long it had been running. Nothing on this path ever sets a terminal state — only an explicit Done/Missed/Rest (either POST branch below, or the external API) does that.
  - Either way, the target log is then set to `state: "in_progress"` with a fresh `startedAt: new Date()` (server time — any client-sent start time is ignored) and `completedAt: null, actualMinutes: null, isBackEntry: false, sessionTaskListId, performedByUserId`. If the target log was previously `paused`, its `pausedSeconds` carries forward unchanged (so total elapsed keeps counting up across jumps instead of resetting); a genuinely fresh start has `pausedSeconds: 0`. If the target is already the active `in_progress` log, it's returned untouched.
- **Any other state** — sets `state`, `actualMinutes: actualMinutes ?? null` (trusts the client-sent value directly — no server derivation on this path), `isBackEntry: isBackEntry ?? false`, `sessionTaskListId: null`, `pausedSeconds: 0`, `performedByUserId`.

Response: the upserted log, serialized. Note the response only reflects the log that was requested — any other log resolved as a side effect (auto-completed or paused) is not included, so callers that need the UI to reflect that resolution (e.g. `TasksView.handleStartTimer`, `TaskListSessionView`'s per-task effect) re-fetch the full day's logs afterward rather than relying on this response alone.

### `PATCH /api/task-logs`
Request body: `{ taskId, date, state: "done" | "missed", actualMinutes?, startedAt?, completedAt?, formData? }`.

Every branch also sets `sessionTaskListId: null` and `pausedSeconds: 0` — once a log reaches a terminal state it's no longer session-anchored or resumable, regardless of which branch below handled it.

- If the client supplies **both** `startedAt` and `completedAt` (the manual time-entry path in `TaskRow`/`TaskCard`) — those are trusted directly, `actualMinutes` is computed from their difference, and `formData` (if the task being back-logged is a `form` task) is stored alongside.
- Else if `state === "done"` (the normal timer-completion path) — `completedAt` is set to now, and `actualMinutes` is derived from **the existing log's server-recorded `startedAt`, plus any `pausedSeconds` it had banked** — not the client-sent value. The client's `actualMinutes` is only used as a fallback if the existing log has no `startedAt` and no banked `pausedSeconds` at all. `formData` is stored as sent — no validation against the task's `formFields` shape.
- `state === "missed"` with no time overrides — only `state` (and `sessionTaskListId`/`pausedSeconds`) is updated.
- Also an upsert (`upsert: true`) — a PATCH against a log that doesn't exist yet will create one.

### `DELETE /api/task-logs`
Request body: `{ taskId, date }`. Deletes the matching log (this is how "Undo" works in the UI). Response: `{ ok: true }`.

### `GET /api/task-logs/active`
Returns the signed-in person's single active (`in_progress`) timer, if any — used by the FAB (`components/BottomNav.tsx`) to render its resume pill and live clock without the client polling or holding the full day's logs. Queries `TaskLog.findOne({ companyId, performedByUserId, state: "in_progress" })` sorted by `startedAt` descending (defensive only — the single-active-timer invariant means at most one should ever exist per person). Responds `{ active: false }` if there's no `startedAt`, or if the `Task` it points at can't be found — a dangling log, e.g. after the task was hard-deleted from the database; a merely soft-deleted (`isActive: false`) task still resolves fine, since this lookup doesn't filter on `isActive`.

Response when active — a denormalized shape (task name/icon/type/target inlined) built for direct rendering, unlike the `serializeLog` shape used everywhere else on this page:
```ts
{ active: true, taskId, date, startedAt: <ISO>, pausedSeconds, taskName, taskIcon, taskType, projectedMinutes }
```

## Task List Sessions

Collection: `tasklistsessions`. Schema (`models/TaskListSession.ts`): `companyId`, `performedByUserId` (whoever started this particular run — an attribute, not part of the lookup key below), `taskListId` (ref `TaskList`), `date` (`YYYY-MM-DD`), `startedAt: Date`, `completedAt: Date | null`, `status: "in_progress" | "completed"`, `totalActualMinutes` (default `0`), `completionSequence: [{ taskId, completedAt, state: "done" | "missed" | "rest" }]`, `pauseOrJumpCount` (default `0`), plus timestamps. No unique index on `{ companyId, taskListId, date }` — a list can legitimately be started, finished, and started again the same day (redoing it), and each run gets its own record rather than colliding with the last one; a non-unique index on `{ companyId, taskListId, date, status }` just makes the "find the open session" lookup below cheap. The lookup is **company-wide**, not per-person — any employee can pick up an already-open session, same reasoning as `TaskLog` above.

This is a session-scoped wrapper around a task list *as a whole* — real start/finish timestamps, completion order, and a pause/jump count — sitting one level above `TaskLog`, which stays the source of truth for individual task state and timing. **There is no dedicated API route for it.** It's created and closed entirely as a side effect of the existing task-completion code paths above, via `lib/task-list-session-actions.ts`:

- **`ensureOpenSession(companyId, performedByUserId, taskListId, date)`** — finds the open (`status: "in_progress"`) session for that company/list/date, or creates one (`startedAt: now`, empty `completionSequence`, `totalActualMinutes: 0`, `pauseOrJumpCount: 0`, `performedByUserId` stamped only on creation — a later employee joining the same open session doesn't reassign it). Called by `startInProgressLog` and `switchActiveLog` (`lib/task-log-actions.ts`) whenever either is about to set a task to `in_progress` with a non-null `sessionTaskListId` — i.e. the moment the first task in a list actually starts running for that date. A bare standalone-timer start (`sessionTaskListId: null`) never creates or touches a session.
- **`recordSessionCompletion(companyId, taskListId, date, taskId, state, actualMinutes)`** — appends `{ taskId, completedAt: now, state }` to `completionSequence`; adds `actualMinutes` to `totalActualMinutes` only for `state === "done"` (`missed`/`rest` contribute `0`, the same terminal-but-zero treatment [`timer.md`](../features/timer.md)'s live-projection math uses). Then checks whether every active `Task` in the list now has a terminal log for that date (`isTaskListFullyResolved`, sharing its list/date/logs fetch with `findNextTaskInList` below rather than a third reimplementation) and, if so, sets `completedAt: now, status: "completed"`. No-ops silently if no open session exists for that list/date (a task completing outside any session — tapped directly on the main Tasks list, never anchored via `sessionTaskListId` — has nothing to record against). Called from every terminal-write path that can be session-anchored: `completeInProgressLog` and `startImmediateLog` (`lib/task-log-actions.ts`, reading the log's `sessionTaskListId` before it's cleared), and both `POST` and `PATCH /api/task-logs`'s terminal branches above (same read-before-clear).
- **`incrementSessionPauseOrJump(companyId, taskListId, date)`** — `$inc`s `pauseOrJumpCount` on the open session. Called by `switchActiveLog` (only when it actually paused another task — the very first task of a session has nothing to switch away from, so that opening move doesn't count), and by [`external-api.md`](external-api.md)'s `trigger-task` Case 3 (a different task was active when the tapped one fired, so the previously-active task gets completed out from under its session rather than deliberately finished by the user). Both represent the same thing: attention moved to a different task without the one that was running getting marked done.
- **`findNextTaskInList(companyId, taskListId, date)`** — first task (by list `order`) with no log at all for that date; used by `trigger-task`'s Case 2 auto-advance, not directly by session bookkeeping, but lives alongside it since it shares the same underlying list/date/logs fetch as `isTaskListFullyResolved`.

One known gap, inherent to the creation rule above rather than a bug: a task list whose very first *tapped* task (via `trigger-task`) is a checkbox task never creates a session for that tap, since those tasks complete immediately via `startImmediateLog` without ever passing through the `in_progress` step that `ensureOpenSession` hooks into. If a later task in the same list starts a real timer, a session opens then (anchored slightly after the list's true start) but that first checkbox completion is never retroactively added to its `completionSequence`. Flagging rather than fixing, since it only matters once this data feeds analytics (out of scope for now — see below).

**Not yet exposed anywhere** — no `GET /api/task-list-sessions`, and no UI reads these records. This story only lays the data foundation; surfacing `completionSequence`/`pauseOrJumpCount`/real start-to-finish duration in analytics (e.g. "you keep starting fifteen minutes late") is future work.

## Consumed by

[`features/task-lists.md`](../features/task-lists.md), [`features/anytime-tasks.md`](../features/anytime-tasks.md), [`features/timer.md`](../features/timer.md), [`features/analytics.md`](../features/analytics.md) (`TaskLog` states and the `Task` schedule/threshold fields it aggregates over).
