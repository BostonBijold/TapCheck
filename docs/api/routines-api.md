> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Routines API

Covers routine groups, routine items, and routine logs — the three collections behind [routines.md](../features/routines.md), [habits.md](../features/habits.md), and [timer.md](../features/timer.md). For the API-key-authenticated variant of starting a timer (used by external triggers like an iPhone Shortcut), see [external-api.md](external-api.md) — it shares the exact same start-a-timer logic via `lib/routine-log-actions.ts`, described below.

**Auth**: every handler resolves the user via the NextAuth session (`session.user.id`); if unauthenticated it falls back to a hardcoded dev user *only* when `process.env.SKIP_AUTH === "true"` (never set in production), otherwise it returns `401`.

## Routine Groups

Collection: `routinegroups`. Schema (`models/RoutineGroup.ts`): `userId`, `name`, `timeOfDay: "morning" | "evening" | "custom" | "habit"`, `startTime: string | null` (`HH:MM`), `order`, `isDefault`.

### `GET /api/routines`
Returns every group for the user (`sort: { order: 1 }`), each with its active items nested inline.

Response: array of
```ts
{ _id, name, type, order, items: [{ _id, name, icon, projectedMinutes, order }] }
```

> ⚠️ **Known issue**: the handler maps `type: group.type` — but `RoutineGroup`'s actual schema field is `timeOfDay`, not `type`. `group.type` doesn't exist on the document, so `type` in this response is always `undefined`. Not yet fixed; flagged here so nothing downstream relies on it.

### `PATCH /api/routines/[groupId]`
Request body: `{ name?: string; startTime?: string | null }`. Updates `RoutineGroup.findOneAndUpdate({ _id: groupId, userId }, { $set: { name, startTime } })`. `404` if not found. Response: `{ _id, name, startTime }`.

### `GET /api/routines/start-next`
Used by the FAB's "Start/Continue Routine" action. Query param `date` (defaults to today, `YYYY-MM-DD`). Read-only: loads all non-habit groups (`timeOfDay !== "habit"`, sorted by `order`), their active items, and that date's logs; **any** log for an item — regardless of state, including `in_progress` and `paused` — counts as "already logged" (skipped, not re-offered). Walks groups in order and returns the first item in the first group that has no log yet for that date.

Response: `{ hasNext: boolean, hasLogs: boolean }` — `hasLogs` is true if *any* log exists for the user/date at all (used to decide whether the FAB button reads "Start Routine" or "Continue Routine").

## Routine Items

Collection: `routineitems`. Schema (`models/RoutineItem.ts`): `groupId` (ref), `userId`, `templateId: ObjectId | null` (ref `HabitTemplate`), `name`, `icon` (default `"✓"`), `projectedMinutes` (default `0`), `order`, `isActive` (default `true`), `linkedGoalId: ObjectId | null`, `itemType: "standard" | "stopwatch" | "checkbox" | "virtue_checkin" | "weekly_review" | "routine_review"` (default `"standard"`), `scheduledDays: number[]` (0=Sun..6=Sat, default `[0,1,2,3,4,5,6]`), `successThreshold: number` (how many of this week's *scheduled* days count as a win, default `7`).

`scheduledDays`/`successThreshold` are purely a weekly analytics/streak concept (see [`features/routines.md`](../features/routines.md#streaks--variance) and [`features/analytics.md`](../features/analytics.md)) — they never affect whether an item appears in the Today view or whether a `RoutineGroup` reads as complete for the day; an item still shows and still needs an explicit Done/Missed/Rest every day regardless of its schedule.

**Backward compatibility**: these two fields were added after many items already existed. Mongoose schema defaults only apply on document creation, so a `.lean()` read of a pre-existing item can come back with them `undefined` — every server read site that builds an item for the client falls back explicitly (`scheduledDays ?? [0,1,2,3,4,5,6]`, `successThreshold ?? (scheduledDays?.length ?? 7)`) rather than trusting the field is present.

### `POST /api/routine-items`
Adds an item to any group (routine or habit — there is no separate habit-item endpoint). Request body: `{ groupId, templateId?, name, icon, projectedMinutes?, itemType?, scheduledDays?, successThreshold? }` — `400` if `groupId`/`name`/`icon` are missing.

Behavior: appends at the end of the group (`order` = current max + 1). Forces `projectedMinutes: 0` when `itemType === "checkbox"`, regardless of what was sent; otherwise uses the provided value or defaults to `15`. `scheduledDays` defaults to every day when omitted or empty; `successThreshold` defaults to `scheduledDays.length` and is **clamped** (not rejected) to never exceed it — a request asking for a mathematically impossible threshold is silently capped rather than erroring.

Response: `{ _id, name, icon, projectedMinutes, order, scheduledDays, successThreshold }`.

### `PATCH /api/routine-items/[id]`
Request body: any subset of `{ name, icon, projectedMinutes, itemType, scheduledDays, successThreshold }` — only these six keys are read and applied via `$set`; anything else in the body is ignored. `404` if not found.

If either `scheduledDays` or `successThreshold` is present, the threshold is re-clamped against whichever `scheduledDays` is now in effect (the one just sent, or the item's existing one if only the threshold changed) — same silent-clamp behavior as `POST`. Clamping only ever lowers the threshold to fit a shrunk schedule; it never bumps a deliberately-lowered threshold back up just because `scheduledDays` changed for an unrelated reason (e.g. a day was re-added).

Response: `{ _id, name, icon, projectedMinutes, itemType, scheduledDays, successThreshold }`.

### `DELETE /api/routine-items/[id]`
**Soft delete** — sets `isActive: false` and saves; the document (and its full `RoutineLog` history) is never physically removed. Response: `{ ok: true }`.

### `PATCH /api/routine-items/reorder`
Request body: `{ items: Array<{ _id: string; order: number }> }` — `400` if missing/empty. Runs one `updateOne({ _id, userId }, { $set: { order } })` per entry (scoped to the authenticated user, so ids belonging to another user are silently no-ops). Response: `{ ok: true }`.

## Routine Logs

Collection: `routinelogs`. Schema (`models/RoutineLog.ts`): `userId`, `routineItemId` (ref), `date` (`YYYY-MM-DD`), `actualMinutes?`, `startedAt?: Date` (null while `paused`), `completedAt?: Date`, `pausedSeconds` (default `0`), `state: "in_progress" | "paused" | "done" | "missed" | "rest"`, `note?`, `isBackEntry` (default `false`), `sessionGroupId?: ObjectId | null` (ref `RoutineGroup`, see below), `reviewMetadata?` (see below), plus timestamps. A **unique** compound index on `{ userId, routineItemId, date }` means there is always exactly one log per item per day — every write below is an upsert against that key, never a duplicate insert.

`reviewMetadata` is set only on the terminal log for a `routine_review` item (see [routine-review.md](../features/routine-review.md)) — every other log leaves it `null`. Shape:
```ts
{
  entryPoint: "sunday_prompt" | "analytics_button" | "notification";
  groupId: ObjectId;       // which routine group this session actually reviewed
  changesMade: boolean;
  itemGoalChanges?: Array<{ routineItemId: ObjectId; oldMinutes: number; newMinutes: number }>;
  startTimeChange?: { old: string | null; new: string | null };
  reorder?: { old: ObjectId[]; new: ObjectId[] };
}
```

`pausedSeconds` banks elapsed time accumulated in an earlier running segment of the same log — total elapsed while `in_progress` is `pausedSeconds + (now - startedAt)`. It's only meaningful while `in_progress` or `paused`; every write below that transitions a log to a terminal state (`done`/`missed`/`rest`) resets it to `0` after folding it into `actualMinutes`.

`sessionGroupId` is set while `state === "in_progress"` **or** `"paused"`, via either [`external-api.md`](external-api.md)'s `routineGroupId` param or a Routine Session's own in-session navigation (see below) — it anchors the timer inside a Routine Session for that group, so opening the app resumes into the session view at that item instead of the standalone timer. It's cleared (`null`) the moment the log reaches a terminal state, by either PATCH branch below. See [timer.md](../features/timer.md) for the client-side resume logic that reads it.

### `GET /api/routine-logs?date=YYYY-MM-DD`
Returns all logs for the user on that date (defaults to today, computed **server-side in UTC** via `toISOString()` — not the client's local date).

### `POST /api/routine-logs`
Request body: `{ routineItemId, date, state, actualMinutes?, isBackEntry?, sessionGroupId?, sessionNav?, reviewMetadata? }`. `reviewMetadata` (see above) is passed straight into the upsert's `$set` when present — used only by the Routine Review flow's finish/decline write (see [routine-review.md](../features/routine-review.md)), never by any other caller of this route.

- **`state: "in_progress"`** — branches on `sessionNav` in `lib/routine-log-actions.ts`:
  - `sessionNav` **not set** (the default — standalone timer, and this route's only mode when called from outside a Routine Session) — delegates to `startInProgressLog(userId, routineItemId, date, sessionGroupId)`. This enforces a **single-active-timer invariant** before writing anything: it queries for any other `RoutineLog` for this user with `state: "in_progress"` and a different `routineItemId` (any date), and for each one found, **auto-completes** it (`state: "done"`, `completedAt: now`, `actualMinutes` derived from its `startedAt` plus any `pausedSeconds` it had banked, minimum 1, `pausedSeconds` reset to `0`, `sessionGroupId` cleared) before proceeding. This is enforced server-side unconditionally — it does not trust the client to have closed out whatever it left running.
  - `sessionNav: true` (set only by `RoutineSession.tsx`'s in-session navigation — advancing or tapping a row to jump) — delegates to `switchActiveLog` instead. Same single-active-timer invariant, but the item being left is **paused**, not completed: `state: "paused"`, `startedAt: null`, `pausedSeconds` incremented by however long it had been running. Nothing on this path ever sets a terminal state — only an explicit Done/Missed/Rest (either POST branch below, or the external API) does that.
  - Either way, the target log is then set to `state: "in_progress"` with a fresh `startedAt: new Date()` (server time — any client-sent start time is ignored) and `completedAt: null, actualMinutes: null, isBackEntry: false, sessionGroupId`. If the target log was previously `paused`, its `pausedSeconds` carries forward unchanged (so total elapsed keeps counting up across jumps instead of resetting); a genuinely fresh start has `pausedSeconds: 0`. If the target is already the active `in_progress` log, it's returned untouched.
- **Any other state** — sets `state`, `actualMinutes: actualMinutes ?? null` (trusts the client-sent value directly — no server derivation on this path), `isBackEntry: isBackEntry ?? false`, `sessionGroupId: null`, `pausedSeconds: 0`.

Response: the upserted log, serialized. Note the response only reflects the log that was requested — any other log resolved as a side effect (auto-completed or paused) is not included, so callers that need the UI to reflect that resolution (e.g. `RoutinesView.handleStartTimer`, `RoutineSession`'s per-item effect) re-fetch the full day's logs afterward rather than relying on this response alone.

### `PATCH /api/routine-logs`
Request body: `{ routineItemId, date, state: "done" | "missed", actualMinutes?, startedAt?, completedAt? }`.

Every branch also sets `sessionGroupId: null` and `pausedSeconds: 0` — once a log reaches a terminal state it's no longer session-anchored or resumable, regardless of which branch below handled it.

- If the client supplies **both** `startedAt` and `completedAt` (the manual time-entry path in `RoutineItemRow`) — those are trusted directly, and `actualMinutes` is computed from their difference.
- Else if `state === "done"` (the normal timer-completion path) — `completedAt` is set to now, and `actualMinutes` is derived from **the existing log's server-recorded `startedAt`, plus any `pausedSeconds` it had banked** — not the client-sent value. The client's `actualMinutes` is only used as a fallback if the existing log has no `startedAt` and no banked `pausedSeconds` at all.
- `state === "missed"` with no time overrides — only `state` (and `sessionGroupId`/`pausedSeconds`) is updated.
- Also an upsert (`upsert: true`) — a PATCH against a log that doesn't exist yet will create one.

### `DELETE /api/routine-logs`
Request body: `{ routineItemId, date }`. Deletes the matching log (this is how "Undo" works in the UI). Response: `{ ok: true }`.

### `GET /api/routine-logs/active`
Returns the user's single active (`in_progress`) timer, if any — used by the FAB (`components/BottomNav.tsx`) to render its resume pill and live clock without the client polling or holding the full day's logs. Queries `RoutineLog.findOne({ userId, state: "in_progress" })` sorted by `startedAt` descending (defensive only — the single-active-timer invariant means at most one should ever exist). Responds `{ active: false }` if there's no `startedAt`, or if the `RoutineItem` it points at can't be found — a dangling log, e.g. after the item was hard-deleted from the database; a merely soft-deleted (`isActive: false`) item still resolves fine, since this lookup doesn't filter on `isActive`.

Response when active — a denormalized shape (item name/icon/type/target inlined) built for direct rendering, unlike the `serializeLog` shape used everywhere else on this page:
```ts
{ active: true, routineItemId, date, startedAt: <ISO>, pausedSeconds, itemName, itemIcon, itemType, projectedMinutes }
```

## Routine Sessions

Collection: `routinesessions`. Schema (`models/RoutineSession.ts`): `userId` (string, same convention as every other model here — **not** an `ObjectId`, since `SKIP_AUTH`'s dev user id isn't one), `groupId` (ref `RoutineGroup`), `date` (`YYYY-MM-DD`), `startedAt: Date`, `completedAt: Date | null`, `status: "in_progress" | "completed"`, `totalActualMinutes` (default `0`), `completionSequence: [{ routineItemId, completedAt, state: "done" | "missed" | "rest" }]`, `pauseOrJumpCount` (default `0`), plus timestamps. No unique index on `{ userId, groupId, date }` — a group can legitimately be started, finished, and started again the same day (redoing a routine), and each run gets its own record rather than colliding with the last one; a non-unique index on `{ userId, groupId, date, status }` just makes the "find the open session" lookup below cheap.

This is a session-scoped wrapper around a routine *as a whole* — real start/finish timestamps, completion order, and a pause/jump count — sitting one level above `RoutineLog`, which stays the source of truth for individual item state and timing. **There is no dedicated API route for it.** It's created and closed entirely as a side effect of the existing item-completion code paths above, via `lib/routine-session-actions.ts`:

- **`ensureOpenSession(userId, groupId, date)`** — finds the open (`status: "in_progress"`) session for that user/group/date, or creates one (`startedAt: now`, empty `completionSequence`, `totalActualMinutes: 0`, `pauseOrJumpCount: 0`). Called by `startInProgressLog` and `switchActiveLog` (`lib/routine-log-actions.ts`) whenever either is about to set an item to `in_progress` with a non-null `sessionGroupId` — i.e. the moment the first item in a group actually starts running for that date. A bare standalone-timer start (`sessionGroupId: null`) never creates or touches a session.
- **`recordSessionCompletion(userId, groupId, date, routineItemId, state, actualMinutes)`** — appends `{ routineItemId, completedAt: now, state }` to `completionSequence`; adds `actualMinutes` to `totalActualMinutes` only for `state === "done"` (`missed`/`rest` contribute `0`, the same terminal-but-zero treatment [`timer.md`](../features/timer.md)'s live-projection math uses). Then checks whether every active `RoutineItem` in the group now has a terminal log for that date (`isGroupFullyResolved`, sharing its group/date/logs fetch with `findNextItemInGroup` below rather than a third reimplementation) and, if so, sets `completedAt: now, status: "completed"`. No-ops silently if no open session exists for that group/date (an item completing outside any session — tapped directly on the main Routines list, never anchored via `sessionGroupId` — has nothing to record against). Called from every terminal-write path that can be session-anchored: `completeInProgressLog` and `startImmediateLog` (`lib/routine-log-actions.ts`, reading the log's `sessionGroupId` before it's cleared), and both `POST` and `PATCH /api/routine-logs`'s terminal branches above (same read-before-clear).
- **`incrementSessionPauseOrJump(userId, groupId, date)`** — `$inc`s `pauseOrJumpCount` on the open session. Called by `switchActiveLog` (only when it actually paused another item — the very first item of a session has nothing to switch away from, so that opening move doesn't count), and by [`external-api.md`](external-api.md)'s `trigger-habit` Case 3 (a different item was active when the tapped one fired, so the previously-active item gets completed out from under its session rather than deliberately finished by the user). Both represent the same thing: attention moved to a different item without the one that was running getting marked done.
- **`findNextItemInGroup(userId, groupId, date)`** — first item (by group `order`) with no log at all for that date; used by `trigger-habit`'s Case 2 auto-advance, not directly by session bookkeeping, but lives alongside it since it shares the same underlying group/date/logs fetch as `isGroupFullyResolved`.

One known gap, inherent to the creation rule above rather than a bug: a routine group whose very first *tapped* item (via `trigger-habit`) is a checkbox/`virtue_checkin`/`weekly_review` item never creates a session for that tap, since those items complete immediately via `startImmediateLog` without ever passing through the `in_progress` step that `ensureOpenSession` hooks into. If a later item in the same group starts a real timer, a session opens then (anchored slightly after the routine's true start) but that first checkbox completion is never retroactively added to its `completionSequence`. Flagging rather than fixing, since it only matters once this data feeds analytics (out of scope for now — see below).

**Not yet exposed anywhere** — no `GET /api/routine-sessions`, and no UI reads these records. This story only lays the data foundation; surfacing `completionSequence`/`pauseOrJumpCount`/real start-to-finish duration in analytics (e.g. "you keep starting fifteen minutes late") is future work.

## Routine Review

### `GET /api/routine-review?groupId=X&localDate=YYYY-MM-DD`
Backs the Routine Review flow's timeline/goal-editing screens (see [routine-review.md](../features/routine-review.md)) — a sibling to `GET /api/analytics`, not a parameter on it. Scoped to one group and a fixed 28-day trailing window (not the 7/30-day windows `/api/analytics` offers), long enough for a rolling average to be stable without outlier rejection or a trimmed mean.

Only "timeable" items are included — `checkbox`, `virtue_checkin`, `weekly_review`, and `routine_review` items are filtered out, since none of them carry a real time goal to review.

Response:
```ts
{
  group: { _id, name, startTime: string | null };
  items: Array<{ _id, name, icon, order, projectedMinutes, avgActualMins: number | null }>; // null = no done logs in the window yet
  avgStartMinutesUtc: number | null; // earliest startedAt per day, averaged, same math as /api/analytics's groupAvgStart — null if no startedAt in the window
  startTimeSampleSize: number;
}
```

## Consumed by

[`features/routines.md`](../features/routines.md), [`features/habits.md`](../features/habits.md), [`features/timer.md`](../features/timer.md), [`features/analytics.md`](../features/analytics.md) (`RoutineLog` states and the `RoutineItem` schedule/threshold fields it aggregates over), [`features/routine-review.md`](../features/routine-review.md) (the `routine_review` item type, `reviewMetadata`, and `GET /api/routine-review`).
