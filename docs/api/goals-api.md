> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Goals API

Covers goals, milestones, and tasks — the data behind [features/goals.md](../features/goals.md). The task-creation shortcut here (`quick-task`) is also the goal-side destination of `FABTaskSheet`'s shared add-task flow, documented alongside its other destination (standalone `Todo`s) in [todos.md](../features/todos.md).

**Auth**: every handler follows the same pattern used throughout this app — NextAuth session (`session.user.id`), falling back to a hardcoded dev user only when `SKIP_AUTH === "true"`, `401` otherwise — every query additionally scoped to `{ _id, userId }` so cross-user access 404s rather than leaking.

## `GET /api/goals`

Returns every goal for the user, sorted `createdAt: -1` then re-sorted by status priority (`active(0) < paused(1) < complete(2) < abandoned(3)`). Response: array of `serializeGoal` output (see [goals.md](../features/goals.md#data-model-modelsgoalts) for the shape, plus the derived `computedProgress` field).

## `POST /api/goals`

Request body: `{ name, description?, targetDate?, outcomeMetric? }`. `400` if `name` is missing/blank. Creates with `status: "active"`, `progressPct: 0`. This is the **only** place `outcomeMetric` can ever be set — no later `PATCH` call in the actual UI ever sends it, even though the route below technically accepts it. Response: `201` + serialized goal.

## `GET /api/goals/[id]`

Single goal, scoped to the user. `404` if not found.

## `PATCH /api/goals/[id]`

Request body: any subset of `{ name, description, status, targetDate, progressPct, outcomeMetric }`. `progressPct` is clamped to `[0, 100]`. **`status` is not validated against the enum before writing** — any string is passed straight into the `$set`; Mongoose's own schema-level enum validation is the only backstop. **No route ever writes to `outcomeLog`** — there is no periodic-check-in endpoint at all yet (see [goals.md](../features/goals.md#outcome-logging--schema-only-no-way-to-write-to-it-yet)). Response: serialized goal.

## `DELETE /api/goals/[id]`

**Hard delete** (`GoalModel.deleteOne`) — unlike `RoutineItem`'s soft-delete convention elsewhere in this app, this permanently removes the goal and everything nested in it (milestones, tasks, outcome log). No undo.

## `POST /api/goals/[id]/milestones`

Request body: `{ name, targetDate? }`. Appended at `order: milestones.length`, `complete: false` always at creation. Response: serialized goal (with the new milestone in it).

## `PATCH /api/goals/[id]/milestones/[milestoneId]`

Request body: any subset of `{ name, targetDate, complete }`. `complete` is only honored when the milestone currently has zero tasks (see [goals.md](../features/goals.md#progress-lowest-available-unit-wins)) — sent for a milestone with tasks, it's silently ignored.

> ⚠️ **Known issue**: `targetDate` is written as `new Date(body.targetDate)` here, even though the schema field is a plain `YYYY-MM-DD` string — inconsistent with `PATCH /api/goals/[id]`'s `targetDate` handling (which correctly keeps it a string) and with `models/Goal.ts`'s own comment explaining why the top-level `targetDate` is deliberately never a `Date`. Scoped to milestones only.

## `DELETE /api/goals/[id]/milestones/[milestoneId]`

`goal.milestones.pull(...)` — hard-removes the milestone subdocument and every task nested inside it (no separate task cleanup needed; they're embedded, not a separate collection).

## `POST /api/goals/[id]/milestones/[milestoneId]/tasks`

Request body: `{ name, scheduledDate?, scheduledTime?, estimatedMinutes?, note? }`. Recomputes and persists `deriveComplete` on the parent milestone after pushing (a task is never added pre-marked done, so this normally just confirms the milestone stays incomplete).

## `PATCH /api/goals/[id]/milestones/[milestoneId]/tasks/[taskId]`

Request body: any subset of `{ done, name, scheduledDate, scheduledTime, estimatedMinutes, note }`. Setting `done` recomputes `deriveComplete` on the parent milestone afterward — this is how completing every task in a milestone flips `milestone.complete` to `true`.

## `DELETE /api/goals/[id]/milestones/[milestoneId]/tasks/[taskId]`

`milestone.tasks.pull(...)`, then `deriveComplete`.

> ⚠️ **Known issue**: `deriveComplete`'s recompute is guarded by `if (tasks.length > 0)`, so deleting a milestone's *last* task leaves `complete` stuck at its previous value (`true`, if the milestone had just been completed) instead of resetting — `computeProgress()`'s milestones-ratio fallback can then silently overcount that milestone as done with zero tasks in it.

## `POST /api/goals/[id]/quick-task`

Request body: `{ name, scheduledDate?, estimatedMinutes? }`. Finds-or-creates a milestone literally named `"General"` and pushes the task there — the shortcut for adding a task without picking a milestone first, and the goal-side destination of `FABTaskSheet`'s shared creation flow (see [todos.md](../features/todos.md)).

> ⚠️ **Known issues**: this route never calls `deriveComplete` — adding a task to an already-complete `"General"` milestone doesn't reopen it. It also returns a bare `{ ok: true }` (`201`) rather than `serializeGoal(...)` like every other write route here, so the caller can't get the updated goal back without a separate fetch.

## Consumed by

[`features/goals.md`](../features/goals.md).
