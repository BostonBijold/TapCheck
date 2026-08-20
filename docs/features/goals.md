> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Goals

`/goals` (`GoalsView.tsx`) and `/goals/[id]` (`GoalDetailView.tsx`) — longer-horizon goals broken into milestones and tasks, with progress derived from whichever unit actually exists rather than tracked separately. Also hosts the "Upcoming To-Dos" backlog (future-dated standalone `Todo`s — see [todos.md](todos.md)) and is one of the two destinations `FABTaskSheet`'s "+ Task" flow can write to.

## Data model (`models/Goal.ts`)

```ts
Goal {
  userId, name, description: string | null,
  status: "active" | "complete" | "paused" | "abandoned" (default "active"),
  targetDate: string | null,   // YYYY-MM-DD — a plain string, never a Date; the model's own
                                // comment explains why: avoids UTC-midnight date-shift bugs
  progressPct: number (default 0, clamped 0-100),   // the manual fallback, see below
  outcomeMetric: { label, targetValue: number, unit } | null,
  outcomeLog: [{ _id, value: number, date: string, note: string | null }],
  milestones: [{
    _id, name, targetDate: string | null, order,
    complete: boolean (default false),   // derived — see below
    completedAt: Date | null,
    tasks: [{ _id, name, done: boolean, completedAt: Date | null,
              scheduledDate: string | null, scheduledTime: string | null,
              estimatedMinutes: number | null, note: string | null }]
  }],
  createdAt, updatedAt
}
```

`serializeGoal()` (same file) is the single choke point every route funnels its response through — it also attaches a `computedProgress` field that **isn't a real schema field**, just derived fresh at serialize time (see below).

## Progress: lowest available unit wins

`computeProgress()` (`models/Goal.ts`), called by `serializeGoal` on every read — never cached, never stored:

```
no milestones at all           → progressPct (the manual fallback)
milestones exist, no tasks     → milestones-complete / milestones-total
any task exists anywhere       → tasks-done / tasks-total, flattened across every
                                  milestone (not averaged per-milestone)
```

The "flattened across every milestone" detail matters: a goal with milestone A (2/2 tasks done) and milestone B (0/3 tasks done) reads as 2/5 = 40% overall — not an average of two 100%/0% milestones. `GoalDetailView`'s manual progress slider only appears when the goal has **zero** milestones and **zero** tasks — i.e. only when `progressPct` is actually the value in effect, consistent with the derivation order above.

`milestone.complete` is derived too, but **write-time-derived and persisted**, not recomputed at read time: a `deriveComplete(milestone)` helper (independently duplicated in the task `POST` and task `PATCH`/`DELETE` routes — not shared) sets `complete = tasks.every(t => t.done)` and stamps/clears `completedAt` after every task mutation. The one documented exception — manually toggling `complete` is allowed only when a milestone has **zero** tasks — is enforced both server-side (`PATCH /api/goals/[id]/milestones/[milestoneId]`) and client-side (`GoalDetailView`'s `MilestoneCard`, whose checkbox is only interactive when `tasks.length === 0`).

> ⚠️ **Known issue**: `deriveComplete`'s recompute is guarded by `if (tasks.length > 0)` — so deleting a milestone's *last remaining task* leaves `complete` stuck at whatever it was before (`true`, if the milestone had just finished) even though it now has zero tasks. `computeProgress()`'s milestones-ratio fallback would then silently overcount that milestone as done.

> ⚠️ **Known issue**: `POST /api/goals/[id]/quick-task` (see below) never calls `deriveComplete` at all — adding a task to an already-complete `"General"` milestone through the quick-add flow doesn't reopen it.

## Outcome logging — schema-only, no way to write to it yet

`outcomeMetric` can only ever be set once, at goal creation, via `AddGoalSheet`'s optional toggle (label/target/unit) — no UI ever edits it afterward, and `PATCH /api/goals/[id]` accepts it in its body type but nothing sends it post-creation. `outcomeLog` is worse: **no API route writes to it at all** — it will stay `[]` forever for every goal created through the app today. `GoalDetailView`'s outcome card only ever *reads* the last entry (`outcomeLog[outcomeLog.length - 1].value`) next to the target, showing `—` since the array is always empty. This isn't a partial feature with a UI gap on top of working data — it's schema-only with a dead-end display; there is currently no periodic-check-in flow at all.

## `/goals` — list + the Upcoming To-Dos backlog

`app/(app)/goals/page.tsx` is a thin server shell (auth redirect, `today`) — the goal list itself loads **client-side** via `GET /api/goals` in `GoalsView.tsx`, unlike goal *detail* (below), which loads server-side.

Two sections, in the order the API already sorts by status priority (`active < paused < complete < abandoned`): **Active**, then **Other**. Each `GoalCard` shows a status badge, a progress bar (`computedProgress`, colored by status: blue=active, olive=complete, amber=paused, dim=abandoned), a summary line that mirrors `computeProgress`'s own priority (`X/Y tasks`, else `X/Y milestones`, else `Z% done` or `"No milestones yet"`), and a due-date chip (Overdue / Due today / `Nd left` / `Due Mon D`). "New Goal" opens `AddGoalSheet`.

Below the goal list, this page also renders **"Upcoming To-Dos"** — every standalone `Todo` with `scheduledDate` strictly after today (`GET /api/todos?after=...`), via the same shared `TodoSection` component the Routines page uses (see [todos.md](todos.md) for the full carry-forward/visibility model — this page only ever shows the *future* slice of it). "+ Add Task" here opens `FABTaskSheet`.

## `/goals/[id]` — detail

`app/(app)/goals/[id]/page.tsx` loads the goal **server-side** (`GoalModel.findOne({_id, userId}).lean()`, `.catch(() => null)` so a malformed id renders a clean `notFound()` instead of a 500) and passes `serializeGoal(goal)` straight into `GoalDetailView` as `initialGoal`.

Shows: click-to-edit name; a status dropdown (plain `PATCH`, no confirmation or side effects like auto-archiving on any transition); progress bar + percentage, with the manual slider surfacing only when it's the active progress source (see above); description as read-only text (the API accepts a `description` PATCH, but no inline-edit UI ever sends one); an outcome-metric card (read-only display, see above); and the milestone list — each `MilestoneCard` supports expand/collapse, inline rename, delete-with-confirm, a task-gated completion checkbox, and an inline `AddTaskForm` with an optional schedule date. Task rows are a checkbox + strikethrough-on-done + a hover-reveal delete button.

## Habit-goal linking — not built yet

`RoutineItem.scheduledDays`... no — `RoutineItem.linkedGoalId` exists in the schema, but `POST /api/routine-items` hardcodes it to `null` and never reads it from the request body — **there is currently no way to ever set it to a real goal id** through any API route, and nothing reads it even if it were set by hand in Mongo. This is stronger than "no adherence UI built on top of a working link" — the link itself can't be created at all yet. `HabitGoalLink` (the separate correlation model CLAUDE.md describes) doesn't exist anywhere in code; CLAUDE.md's own build checklist already marks it unchecked, so this is confirmation, not a discrepancy.

## Goal tasks vs. standalone Todos — a real seam, not an overlap

A "task" created via `FABTaskSheet` when a goal is selected goes to `POST /api/goals/[id]/quick-task` (pushed into that goal's `milestones[].tasks[]`, auto-creating a `"General"` milestone if none exists) — **not** into the `Todo` collection at all. There is no foreign key or shared id between the two; `models/Todo.ts` has no `goalId` field. Goal tasks with a `scheduledDate` are **never surfaced on the Routines Today view** — nothing in `RoutinesView.tsx`/`app/(app)/routines/page.tsx` queries `Goal.milestones[].tasks[]`, despite CLAUDE.md describing "Tasks appear in Today view between morning and evening routines" for exactly this case. Only standalone `Todo`s (the "no goal" branch of the same `FABTaskSheet` flow) appear there — see [todos.md](todos.md).

## API surface summary

Full request/response documentation lives in [`api/goals-api.md`](../api/goals-api.md). One inconsistency worth flagging at the feature level: `DELETE /api/goals/[id]` and `DELETE .../milestones/[milestoneId]` are **hard deletes** (unlike `RoutineItem`'s soft-delete-via-`isActive` convention used elsewhere in this app) — deleting a goal or a milestone removes it and its history permanently, with no undo.

## Files

- `models/Goal.ts` — schema, `computeProgress()`, `serializeGoal()`.
- `app/api/goals/route.ts` — `GET` (list, status-sorted) / `POST` (create).
- `app/api/goals/[id]/route.ts` — `GET` / `PATCH` / `DELETE` (hard delete).
- `app/api/goals/[id]/milestones/route.ts` — `POST` (add milestone).
- `app/api/goals/[id]/milestones/[milestoneId]/route.ts` — `PATCH` (rename/reschedule/manual-complete-when-no-tasks) / `DELETE` (hard delete, cascades its tasks).
- `app/api/goals/[id]/milestones/[milestoneId]/tasks/route.ts` — `POST` (add task) + its own `deriveComplete`.
- `app/api/goals/[id]/milestones/[milestoneId]/tasks/[taskId]/route.ts` — `PATCH` (toggle/edit) / `DELETE`, + a second, independent copy of `deriveComplete`.
- `app/api/goals/[id]/quick-task/route.ts` — adds a task to an auto-created/reused `"General"` milestone, skipping milestone selection; the goal-side destination for `FABTaskSheet`'s shared add-task flow.
- `app/(app)/goals/page.tsx` — thin server shell; goal list itself is client-fetched.
- `app/(app)/goals/[id]/page.tsx` — server-loads one goal, passes it to `GoalDetailView`.
- `components/GoalsView.tsx` — goal list (Active/Other), `AddGoalSheet`, and the embedded Upcoming To-Dos backlog.
- `components/GoalDetailView.tsx` — full detail page.
- `components/FABTaskSheet.tsx` — the shared creation entry point for both goal tasks and standalone todos (see [todos.md](todos.md) for the todo side of this branch).

## Depends on

[`api/goals-api.md`](../api/goals-api.md) for the full route documentation. [`todos.md`](todos.md) for the standalone-todo backlog embedded on this page and the shared `FABTaskSheet` creation flow.
