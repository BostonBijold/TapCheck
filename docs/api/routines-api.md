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
Used by the FAB's "Start/Continue Routine" action. Query param `date` (defaults to today, `YYYY-MM-DD`). Read-only: loads all non-habit groups (`timeOfDay !== "habit"`, sorted by `order`), their active items, and that date's logs; an `in_progress` log counts as "already logged" (skipped, not re-offered). Walks groups in order and returns the first item in the first group that has no log yet for that date.

Response: `{ hasNext: boolean, hasLogs: boolean }` — `hasLogs` is true if *any* log exists for the user/date at all (used to decide whether the FAB button reads "Start Routine" or "Continue Routine").

## Routine Items

Collection: `routineitems`. Schema (`models/RoutineItem.ts`): `groupId` (ref), `userId`, `templateId: ObjectId | null` (ref `HabitTemplate`), `name`, `icon` (default `"✓"`), `projectedMinutes` (default `0`), `order`, `isActive` (default `true`), `linkedGoalId: ObjectId | null`, `itemType: "standard" | "stopwatch" | "checkbox" | "virtue_checkin" | "weekly_review"` (default `"standard"`).

### `POST /api/routine-items`
Adds an item to any group (routine or habit — there is no separate habit-item endpoint). Request body: `{ groupId, templateId?, name, icon, projectedMinutes?, itemType? }` — `400` if `groupId`/`name`/`icon` are missing.

Behavior: appends at the end of the group (`order` = current max + 1). Forces `projectedMinutes: 0` when `itemType === "checkbox"`, regardless of what was sent; otherwise uses the provided value or defaults to `15`.

Response: `{ _id, name, icon, projectedMinutes, order }`.

### `PATCH /api/routine-items/[id]`
Request body: any subset of `{ name, icon, projectedMinutes, itemType }` — only these four keys are read and applied via `$set`; anything else in the body is ignored. `404` if not found. Response: `{ _id, name, icon, projectedMinutes, itemType }`.

### `DELETE /api/routine-items/[id]`
**Soft delete** — sets `isActive: false` and saves; the document (and its full `RoutineLog` history) is never physically removed. Response: `{ ok: true }`.

### `PATCH /api/routine-items/reorder`
Request body: `{ items: Array<{ _id: string; order: number }> }` — `400` if missing/empty. Runs one `updateOne({ _id, userId }, { $set: { order } })` per entry (scoped to the authenticated user, so ids belonging to another user are silently no-ops). Response: `{ ok: true }`.

## Routine Logs

Collection: `routinelogs`. Schema (`models/RoutineLog.ts`): `userId`, `routineItemId` (ref), `date` (`YYYY-MM-DD`), `actualMinutes?`, `startedAt?: Date`, `completedAt?: Date`, `state: "in_progress" | "done" | "missed" | "rest"`, `note?`, `isBackEntry` (default `false`), `sessionGroupId?: ObjectId | null` (ref `RoutineGroup`, see below), plus timestamps. A **unique** compound index on `{ userId, routineItemId, date }` means there is always exactly one log per item per day — every write below is an upsert against that key, never a duplicate insert.

`sessionGroupId` is set only while `state === "in_progress"` and only via [`external-api.md`](external-api.md)'s `routineGroupId` param — it anchors the timer inside a Routine Session for that group, so opening the app resumes into the session view at that item instead of the standalone timer. It's cleared (`null`) the moment the log leaves `in_progress`, by either PATCH branch below. See [timer.md](../features/timer.md) for the client-side resume logic that reads it.

### `GET /api/routine-logs?date=YYYY-MM-DD`
Returns all logs for the user on that date (defaults to today, computed **server-side in UTC** via `toISOString()` — not the client's local date).

### `POST /api/routine-logs`
Request body: `{ routineItemId, date, state, actualMinutes?, isBackEntry? }`.

- **`state: "in_progress"`** — delegates entirely to `startInProgressLog(userId, routineItemId, date, sessionGroupId)` in `lib/routine-log-actions.ts` (this route always passes `sessionGroupId: null` — only [`external-api.md`](external-api.md) can set it). That helper enforces a **single-active-timer invariant** before writing anything: it queries for any other `RoutineLog` for this user with `state: "in_progress"` and a different `routineItemId` (any date), and for each one found, auto-completes it (`state: "done"`, `completedAt: now`, `actualMinutes` derived from its `startedAt` to now, minimum 1, `sessionGroupId` cleared) before proceeding. This is enforced server-side unconditionally — it does not trust the client to have closed out whatever it left running. It then sets `startedAt: new Date()` (server time — any client-sent start time is ignored) on the requested log, and resets `completedAt: null, actualMinutes: null, isBackEntry: false, sessionGroupId`. Starting/restarting a timer always clears any prior completion data on that day's log. Because this logic lives in one shared function, the internal and external start-a-timer paths behave identically by construction, not by convention.
- **Any other state** — sets `state`, `actualMinutes: actualMinutes ?? null` (trusts the client-sent value directly — no server derivation on this path), `isBackEntry: isBackEntry ?? false`, `sessionGroupId: null` (a log that's no longer `in_progress` can't still be session-anchored).

Response: the upserted log, serialized. Note the response only reflects the log that was requested — any other log auto-completed as a side effect is not included, so callers that need the UI to reflect that resolution (e.g. `RoutinesView.handleStartTimer`) re-fetch the full day's logs afterward rather than relying on this response alone.

### `PATCH /api/routine-logs`
Request body: `{ routineItemId, date, state: "done" | "missed", actualMinutes?, startedAt?, completedAt? }`.

Every branch also sets `sessionGroupId: null` — once a log leaves `in_progress` it's no longer session-anchored, regardless of which branch below handled it.

- If the client supplies **both** `startedAt` and `completedAt` (the manual time-entry path in `RoutineItemRow`) — those are trusted directly, and `actualMinutes` is computed from their difference.
- Else if `state === "done"` (the normal timer-completion path) — `completedAt` is set to now, and `actualMinutes` is derived from **the existing log's server-recorded `startedAt`**, not the client-sent value. The client's `actualMinutes` is only used as a fallback if the existing log has no `startedAt` at all.
- `state === "missed"` with no time overrides — only `state` (and `sessionGroupId`) is updated.
- Also an upsert (`upsert: true`) — a PATCH against a log that doesn't exist yet will create one.

### `DELETE /api/routine-logs`
Request body: `{ routineItemId, date }`. Deletes the matching log (this is how "Undo" works in the UI). Response: `{ ok: true }`.

## Consumed by

[`features/routines.md`](../features/routines.md), [`features/habits.md`](../features/habits.md), [`features/timer.md`](../features/timer.md).
