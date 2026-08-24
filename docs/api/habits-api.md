> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Habits API

Covers the habit-item list and the habit-template catalog — the data consumed by [habits.md](../features/habits.md). Adding an item to a habit group, and logging a habit's daily state, both go through the shared endpoints documented in [routines-api.md](routines-api.md) (`/api/routine-items`, `/api/routine-logs`) — not duplicated here. This includes `scheduledDays`/`successThreshold` (routines-api.md's Routine Items section) — habit items are `RoutineItem`s in a `timeOfDay: "habit"` group, same collection, same fields, same clamping behavior, nothing habit-specific about them.

**Auth**: same pattern as routines-api.md — NextAuth session, with a `SKIP_AUTH`-gated dev fallback, `401` otherwise.

## `GET /api/habits`

Powers `FABHabitSheet`'s quick-log list. Only `GET` is implemented on this route — there is no POST/PATCH/DELETE here.

Query param: `date` (`YYYY-MM-DD`) — **defaults to the server's UTC date if omitted**, not the client's local date. Callers that need "today" in the user's timezone must pass `date` explicitly (as `FABHabitSheet` does).

Logic: finds all of the user's `RoutineGroup`s with `timeOfDay: "habit"`; loads every active `RoutineItem` in those groups plus every `RoutineLog` for the user on that date; joins them in the route handler by `routineItemId` (a plain JS `Map` lookup, not a Mongo-side `$lookup`).

Response: array of
```ts
{
  _id: string,
  name: string,
  icon: string,
  itemType: string,
  projectedMinutes: number,
  done: boolean,        // true only if the log's state === "done"
  logId: string | null, // the RoutineLog _id, if one exists
}
```
Note `done` collapses `"missed"`, `"rest"`, `"in_progress"`, and `"paused"` all down to `false` — this endpoint has no way to represent those states, which is why `FABHabitSheet` only ever offers a one-way "mark done" action.

## `GET /api/habit-templates?groupId=…`

Returns the browsable catalog for `AddHabitSheet`: system-seeded templates (`isSystem: true`, visible to everyone) plus this user's own custom templates (`isSystem: false, createdBy: userId`), **excluding** any template already used by an active item in the given group.

## `POST /api/habit-templates`

Creates a new custom `HabitTemplate`. Request body: `{ name, icon, defaultProjectedMinutes, category: "custom", timeOfDay: "any" }`. Always inserts a new document — **no dedupe** against an existing custom template with the same name. Server sets `isSystem: false, createdBy: userId`.

Collection: `habittemplates` (`models/HabitTemplate.ts`). Fields: `name`, `icon`, `defaultProjectedMinutes`, `category` (enum), `timeOfDay: "morning" | "evening" | "any"` (a display/catalog hint only — unrelated to `RoutineGroup.timeOfDay`, which has different possible values), `description?`, `isSystem`, `createdBy: userId | null`, `isActive`.

`RoutineItem.templateId` is the only link back to a template, and it's a one-time copy made at creation time (`POST /api/routine-items`, in routines-api.md) — editing or deleting a template afterward does not cascade to items already created from it.

## Consumed by

[`features/habits.md`](../features/habits.md).
