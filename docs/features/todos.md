> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Todos

A standalone quick-capture list — `models/Todo.ts`. No separate API doc — the surface is small enough (two route files, four handlers) to document inline here, the same way [`analytics.md`](analytics.md) folds `/api/analytics` into itself rather than a separate file.

There used to be a Goals feature (goal-linked tasks, a `GoalsView.tsx` "future backlog" list sharing this same creation UI) — it's been removed from the app entirely. `Todo`s never had a data relationship to it (no `goalId` field, never did), so removing Goals didn't touch the `Todo` model or its core read/write routes, but it did leave a few now-single-purpose pieces behind — flagged inline below rather than silently pretending they were always this simple.

## Data model (`models/Todo.ts`)

```ts
Todo {
  userId,
  name,
  scheduledDate: string,        // YYYY-MM-DD — required; there is no "someday"/unscheduled bucket
  done: boolean (default false),
  completedAt: Date | null,
  estimatedMinutes: number | null,
  note: string | null,          // dead field — see below
  order: number (default 0),    // write-only, never serialized to the client
  createdAt
}
```
Index: `{ userId: 1, scheduledDate: 1 }`.

> ⚠️ **Known issue**: `note` is declared on the schema but no API route ever reads or writes it, and no UI (`EditTodoSheet`, `FABTaskSheet`) ever renders a field for it — fully unreachable, dead weight on the model.

Two helpers live alongside the schema, used directly by the API routes and by `app/(app)/routines/page.tsx`:

- **`todosForDateQuery(userId, date)`** — `{ userId, $or: [{ scheduledDate: date }, { scheduledDate: { $lt: date }, done: false }] }`. "Today's todos, plus every undone todo from any earlier date, unbounded" — a todo that's never checked off or deleted carries forward forever, with no cap.
- **`serializeTodo(t)`** — `{ _id, name, scheduledDate, done, completedAt, estimatedMinutes, note }`. `order` is deliberately excluded — sort-only, never a client concern.

## API

Auth follows the same pattern as everywhere else: NextAuth session, `SKIP_AUTH`-gated dev fallback, `401` otherwise.

### `GET /api/todos`
Two mutually exclusive modes:
- **`?date=YYYY-MM-DD`** — `todosForDateQuery(userId, date)` — today's todos plus overdue carry-forward. This is what the Routines page uses, and the only mode any current UI calls.
- **`?after=YYYY-MM-DD`** — `{ userId, scheduledDate: { $gt: after } }`, strictly future, no carry-forward logic at all.

> ⚠️ **Known issue**: `?after=` was the now-removed Goals page's "Upcoming To-Dos" backlog query. Nothing in the current app calls it — it's dead code left in the route handler, not a live feature. Left in place rather than removed since deleting it isn't part of any active work; flagging here so it isn't mistaken for a currently-used mode.

Neither param present → `400 "Missing date"`. Both sorted `scheduledDate, order, createdAt`.

### `POST /api/todos`
Request body: `{ name, scheduledDate, estimatedMinutes? }`. `400` if `name` (trimmed) or `scheduledDate` is missing. `order` is computed via `Todo.countDocuments({ userId, scheduledDate })`, not a `max + 1` pattern like `RoutineItem` uses — if a todo on a given date is ever deleted, a later addition to that same date can collide on `order` with a survivor. Low-impact since `order` is never exposed to the client, but inconsistent with the rest of the app's convention. Response: `201` + `serializeTodo`.

### `PATCH /api/todos/[id]`
Request body: any subset of `{ done, name, scheduledDate, estimatedMinutes }`. Setting `done: true` stamps `completedAt: new Date()`; `done: false` clears it back to `null`. `404` if not found (scoped to `userId`). Response: `serializeTodo`.

### `DELETE /api/todos/[id]`
**Hard delete** — unlike `RoutineItem`'s soft-delete (`isActive: false`) convention used elsewhere, this permanently removes the todo with no history. Always responds `{ ok: true }`, even if nothing matched.

## Where todos show up

**Routines page (today + overdue), the only place they render** — `RoutinesView.tsx` fetches `?date=selectedDate`, rendering `TodoSection` after every shift group has rendered, before the standalone Facility Checks section. A client-side predicate, `isTodoVisibleToday` (mirroring `todosForDateQuery` exactly: `scheduledDate === selectedDate || (!done && scheduledDate < selectedDate)`), decides whether an *edited* todo should vanish from the current view (e.g. rescheduling today's todo to next week removes it immediately, no refetch needed).

`TodoSection.tsx` reimplements the same overdue predicate a *second* time, purely for styling (`isOverdue = !done && scheduledDate < viewingDate` → burgundy left border/text + an "`Nd overdue`" caption via a `daysLate()` helper) — logically identical, just not sharing code with it.

## `lib/useTodoActions.ts` — the shared mutation hook

One hook, parameterized by an `isVisible` predicate. That parameterization used to serve two different views (this Routines-page list and the now-removed Goals page's future backlog); today `RoutinesView.tsx` is its only caller, so the abstraction is wider than strictly needed but hasn't been simplified away:
- **`toggle(id, done)`** — optimistic (flips `done`/`completedAt` locally immediately), `PATCH`, rolls back on failure.
- **`remove(id)`** — optimistic removal, `DELETE`, rolls back on failure.
- **`update(id, { name, scheduledDate, estimatedMinutes })`** — **not** optimistic; awaits the `PATCH` response, then either updates the item in place or drops it from the list if `isVisible(saved)` is now false. Throws on failure; `EditTodoSheet` catches and shows an inline error.

## `components/TodoSection.tsx`

Fully generic, parameterized via props (`title`, `emptyLabel`, `showDates`, `addButtonLabel`) rather than hardcoded to one call site — a leftover from when it served two views, but harmless with just one. Row: circular checkbox (→ `toggle`), name + overdue/date caption (click → `onEdit`, opens `EditTodoSheet`), optional estimated-minutes chip, hover-reveal trash icon (→ `remove`, no confirmation dialog). Overdue rows: burgundy left border + text. Done rows: blue-muted left border + strikethrough.

## `components/EditTodoSheet.tsx` — edit only, not create

Takes a required `todo` prop — there is no create mode here. Form: name, scheduled date (native date input), estimated minutes. Save disabled until name + date are present. A trash icon beside Save deletes directly, no separate confirm step.

## Creation — `components/FABTaskSheet.tsx`

Opened from the FAB's "Task" bubble. A single-step form: name, scheduled date (defaults to the current page's date), optional estimated minutes — `POST /api/todos` directly. (There used to be a target-picker step here for choosing between a goal and a plain todo, back when Goals existed; that branching is gone along with the feature it served.)

## Files

- `models/Todo.ts` — schema, `todosForDateQuery`, `serializeTodo`.
- `app/api/todos/route.ts` — `GET` (`?date=` today+overdue; `?after=` is dead code, see above), `POST`.
- `app/api/todos/[id]/route.ts` — `PATCH`, `DELETE` (hard delete).
- `components/TodoSection.tsx` — list renderer; owns the overdue styling.
- `components/EditTodoSheet.tsx` — edit-only modal.
- `components/FABTaskSheet.tsx` — the creation entry point.
- `lib/useTodoActions.ts` — shared `toggle`/`remove`/`update`, parameterized by an `isVisible` predicate.
- `components/RoutinesView.tsx` — mounts `TodoSection` for today+overdue, defines `isTodoVisibleToday`.
