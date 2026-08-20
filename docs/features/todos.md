> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Todos

A standalone quick-capture list — `models/Todo.ts` — with **zero data relationship to Goals**, despite sharing a creation UI with them (`FABTaskSheet`, see below). Not really part of CLAUDE.md's original brief at all, which only ever describes goal-linked tasks; this whole feature was added later. No separate API doc — the surface is small enough (two route files, four handlers) to document inline here, the same way [`analytics.md`](analytics.md) folds `/api/analytics` into itself rather than a separate file.

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
- **`?date=YYYY-MM-DD`** — `todosForDateQuery(userId, date)` — today's todos plus overdue carry-forward. This is what the Routines page uses.
- **`?after=YYYY-MM-DD`** — `{ userId, scheduledDate: { $gt: after } }`, strictly future, no carry-forward logic at all. This is the Goals page's "Upcoming To-Dos" backlog query.

Neither param present → `400 "Missing date"`. Both sorted `scheduledDate, order, createdAt`.

### `POST /api/todos`
Request body: `{ name, scheduledDate, estimatedMinutes? }`. `400` if `name` (trimmed) or `scheduledDate` is missing. `order` is computed via `Todo.countDocuments({ userId, scheduledDate })`, not a `max + 1` pattern like `RoutineItem` uses — if a todo on a given date is ever deleted, a later addition to that same date can collide on `order` with a survivor. Low-impact since `order` is never exposed to the client, but inconsistent with the rest of the app's convention. Response: `201` + `serializeTodo`.

### `PATCH /api/todos/[id]`
Request body: any subset of `{ done, name, scheduledDate, estimatedMinutes }`. Setting `done: true` stamps `completedAt: new Date()`; `done: false` clears it back to `null`. `404` if not found (scoped to `userId`). Response: `serializeTodo`.

### `DELETE /api/todos/[id]`
**Hard delete** — unlike `RoutineItem`'s soft-delete (`isActive: false`) convention used elsewhere, this permanently removes the todo with no history. Always responds `{ ok: true }`, even if nothing matched.

## Where todos show up, and why the two lists never overlap

**Routines page (today + overdue)** — `RoutinesView.tsx` fetches `?date=selectedDate`, rendering `TodoSection` **after every time-of-day routine group has rendered**, before the standalone Habits section — not literally "between morning and evening" as CLAUDE.md's Today-View spec describes for goal tasks (see below), and this list is exclusively standalone `Todo`s. A client-side predicate, `isTodoVisibleToday` (mirroring `todosForDateQuery` exactly: `scheduledDate === selectedDate || (!done && scheduledDate < selectedDate)`), decides whether an *edited* todo should vanish from the current view (e.g. rescheduling today's todo to next week removes it immediately, no refetch needed).

**Goals page (future backlog)** — `GoalsView.tsx` fetches `?after=today`, rendering the same `TodoSection` component as "Upcoming To-Dos" with `showDates` on (each row shows its own date instead of an overdue caption, since the list spans many future dates rather than clustering around "today"). Its own visibility predicate, `isTodoUpcoming = scheduledDate > today`, is the exact complement of the Routines page's rule — the moment a backlog todo's date arrives, it drops out of this list and starts appearing on the Routines page instead. The two views are complementary by construction, not two independent copies of one list.

`TodoSection.tsx` reimplements the same overdue predicate a *third* time, purely for styling (`isOverdue = !done && scheduledDate < viewingDate` → burgundy left border/text + an "`Nd overdue`" caption via a `daysLate()` helper) — logically identical to the other two, just not sharing code with them.

## `lib/useTodoActions.ts` — the shared mutation hook

One hook, parameterized by an `isVisible` predicate so it serves both the Routines-page and Goals-page views without duplicating logic:
- **`toggle(id, done)`** — optimistic (flips `done`/`completedAt` locally immediately), `PATCH`, rolls back on failure.
- **`remove(id)`** — optimistic removal, `DELETE`, rolls back on failure.
- **`update(id, { name, scheduledDate, estimatedMinutes })`** — **not** optimistic; awaits the `PATCH` response, then either updates the item in place or drops it from the list if `isVisible(saved)` is now false — the mechanism behind the cross-view-boundary case above (edit a todo's date across the today/future line, it moves lists without a manual refetch). Throws on failure; `EditTodoSheet` catches and shows an inline error.

## `components/TodoSection.tsx`

Fully generic, parameterized via props (`title`, `emptyLabel`, `showDates`, `addButtonLabel`) rather than being two separate components for its two call sites. Row: circular checkbox (→ `toggle`), name + overdue/date caption (click → `onEdit`, opens `EditTodoSheet`), optional estimated-minutes chip, hover-reveal trash icon (→ `remove`, no confirmation dialog). Overdue rows: burgundy left border + text. Done rows: blue-muted left border + strikethrough.

## `components/EditTodoSheet.tsx` — edit only, not create

Takes a required `todo` prop — there is no create mode here. Form: name, scheduled date (native date input), estimated minutes. Save disabled until name + date are present. A trash icon beside Save deletes directly, no separate confirm step.

## Creation — `components/FABTaskSheet.tsx` is the real entry point, and the goal/todo branch point

Opened from the FAB dial's "Task" bubble. Two steps:
1. **Target picker** — the user's `active`-status goals, plus a pinned "Just for today — no goal" option.
2. **Form** — name, scheduled date (defaults to the current page's date), optional estimated minutes.

The target picked in step 1 decides the backend entirely: picking a goal calls `POST /api/goals/[id]/quick-task` (writes into that goal's `milestones[].tasks[]` — see [goals.md](goals.md) — **never touches the `Todo` collection**); picking "no goal" calls `POST /api/todos` above. Same fields, same UI, two structurally unrelated destinations — there is no foreign key or shared id between a goal task and a `Todo` (`models/Todo.ts` has no `goalId` field). A `startWithNoGoal` prop lets a caller (e.g. the Routines page's own FAB context) skip straight to the goal-less form.

**Goal tasks with a `scheduledDate` never appear on the Routines Today view** — nothing in `RoutinesView.tsx`/`app/(app)/routines/page.tsx` queries `Goal.milestones[].tasks[]`. Only standalone `Todo`s (the "no goal" branch above) ever render there, contrary to CLAUDE.md's Goal Rules section, which describes goal tasks themselves appearing in the Today view.

## Files

- `models/Todo.ts` — schema, `todosForDateQuery`, `serializeTodo`.
- `app/api/todos/route.ts` — `GET` (`?date=` today+overdue / `?after=` future backlog), `POST`.
- `app/api/todos/[id]/route.ts` — `PATCH`, `DELETE` (hard delete).
- `app/api/goals/[id]/quick-task/route.ts` — the *other* destination of the shared add-task flow; documented fully in [`api/goals-api.md`](../api/goals-api.md).
- `components/TodoSection.tsx` — shared list renderer for both call sites; owns the overdue styling.
- `components/EditTodoSheet.tsx` — edit-only modal.
- `components/FABTaskSheet.tsx` — the actual creation entry point and the goal/todo branch point.
- `lib/useTodoActions.ts` — shared `toggle`/`remove`/`update`, parameterized by an `isVisible` predicate.
- `components/RoutinesView.tsx` — mounts `TodoSection` for today+overdue, defines `isTodoVisibleToday`.
- `components/GoalsView.tsx` — mounts `TodoSection` for the future backlog, defines `isTodoUpcoming`.

## Depends on

[`features/goals.md`](goals.md) for the other half of the shared `FABTaskSheet` creation flow.
