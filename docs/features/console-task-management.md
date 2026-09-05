> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Console — Task & Task List Management

**Status: BUILT.** A page inside the existing
[`admin-console.md`](admin-console.md) section, plus the auth-gate change
that page required (see below) — see "Current state" below for what
actually exists vs. the original spec's phrasing.

## User story

As a manager or owner, create, rename, schedule, and edit task lists and
tasks from a desktop browser — using the exact same rules and data as the
mobile app — so that whoever's more comfortable at a keyboard can do this
work there. Nothing about the phone changed: a manager mid-checklist who
realizes "Bathrooms" needs to become "Men's"/"Women's" still edits it right
there on the spot, no forced trip to a computer. NFC tag binding is the one
deliberate exception, since it requires physically tapping a tag with a
phone — the console shows binding *status*, never a scan action.

## Change: the console is no longer owner-only

Every console page used to be owner-only at
`app/(console)/console/layout.tsx`. Task/task-list management, unlike
Locations/Team & Access/Rollup Dashboard, is a **manager-and-up**
capability on mobile already (`ManageTasksView.tsx`, `TaskListEditView.tsx`
are both manager-gated, not owner-gated), so the console version couldn't
tighten that.

- **`app/(console)/console/layout.tsx`**: the redirect condition is now
  `!isManagerOrAbove(sessionUser.role)` (was `!isOwner(...)`) — an employee
  still bounces to `/tasks`; a manager now renders the shell same as an
  owner does.
- **`locations/page.tsx`, `team/page.tsx`, `rollup/page.tsx`**: each now
  does its own `if (!sessionUser || !isOwner(sessionUser.role))
  redirect("/console/tasks")` check, since the blanket layout gate no
  longer covers this for them.
- **`components/console/ConsoleSidebar.tsx`**: takes an `isOwner: boolean`
  prop (threaded from the layout through `ConsoleShell`). An owner sees all
  four items (Locations, Team & Access, Task Management, Rollup Dashboard —
  in that order, Task Management inserted between Team & Access and
  Rollup); a manager sees only **Task Management**.
- **`app/(console)/console/page.tsx`**: its redirect is now role-aware —
  owner → `/console/locations` (unchanged), manager → `/console/tasks`.
- **`components/ProfileView.tsx`**: the "Admin Console" card now shows for
  `isManager` (was `isOwner`) — `isManager` is already
  `isManagerOrAbove(role)` from `app/(app)/profile/page.tsx`, so this one
  change covers both tiers. Its subtitle is role-aware: an owner keeps
  (an updated version of) the original copy, a manager gets "Manage task
  lists and tasks — best on a computer" instead, since they'll only ever
  reach the one page behind it.

## Page: `/console/tasks`

Owner or manager (not employee). Reuses every existing route below
as-is — **no new backend** for the management functionality itself, with
one small additive exception (see below):

- `GET /api/task-lists`
- `POST /api/task-lists`
- `PATCH /api/task-lists/[taskListId]`
- `DELETE /api/task-lists/[taskListId]`
- `GET /api/task-definitions`
- `POST /api/tasks` (both paths — place an existing definition, or build a
  new one)
- `PATCH /api/tasks/[id]`
- `DELETE /api/tasks/[id]`
- `PATCH /api/tasks/reorder`

**One additive field, not a new route**: `GET /api/task-lists`'s response
gained `scheduledDays` on each list itself (it previously returned this
only per-task, never on the list) — the console's list editor needs the
list's own current value to show accurate toggle state when a manager
reopens it to edit, the same way `PATCH /api/task-lists/[taskListId]`
already returns it. Ignored by the offline SQLite cache, which only reads
fields its own schema mirrors.

**Not reused, by design**: `POST`/`DELETE /api/tasks/[id]/nfc-tag` and
`POST`/`DELETE /api/task-definitions/[id]/nfc-tag`. These keep working
exactly as before from the phone — they're just not callable from this
page, since there's no scanner to call them with. `DELETE
/api/task-definitions/[id]` (removing a saved task from the catalog
entirely, independent of any list) is also not called here — that's the
Company Task Catalog browsing view, deferred (see Open Questions below).

### Layout — two panes

`components/console/TaskManagementView.tsx` is the page-level
coordinator (client component, same "fetch client-side, refetch after
every mutation" convention as `TeamConsoleView.tsx`/`RollupTable.tsx`).
It fetches `GET /api/task-lists` (raw placements) and `GET
/api/task-definitions` (the resolved catalog) and joins them itself
(`resolveTasksForList`) — mirroring `lib/task-definitions.ts`'s
`resolveTasks` server-side join (same "Deleted task"/`help-circle`
fallback for a stray reference) — rather than adding a new resolved
backend route. Refetches both collections after every task-affecting
mutation rather than optimistically patching local state the way mobile's
`TaskListEditView.tsx` does: a task's name/icon/formFields edit writes
through to the shared `TaskDefinition` and so can change what *other* list
placements show too, which is easy to get right with a refetch and easy
to get subtly wrong with a hand-rolled local patch.

- **Left pane** — `components/console/TaskListsPane.tsx`: every task list
  (shift-window and anytime), in the same order `GET /api/task-lists`
  already returns (`startTime` then `order`). Selecting one loads its
  tasks into the right pane. "+ New Task List" expands an inline create
  row (name, optional start time, scheduled days) — the same fields `POST
  /api/task-lists` already accepts; blank start time = a never-collapsing
  anytime list. Each row gets an inline pencil (rename/reschedule, calling
  `PATCH /api/task-lists/[taskListId]`) and trash (soft-delete, with the
  same confirm-dialog copy as `TaskListEditView.tsx`'s mobile delete)
  icon — replacing the need for a separate navigation the way mobile's
  dedicated page requires, a desktop-layout difference only.

- **Right pane** — `components/console/TaskListDetailPane.tsx`: the
  selected list's tasks, in order, each editable inline: name, icon
  (`AppIcon`/`IconPicker`, reused as-is), form fields (`TaskFieldsEditor`,
  reused as-is — same building block mobile's field editor uses, so the
  two can't drift on what a field shape supports), `projectedMinutes`
  (this placement's override), `scheduledDays`, `successThreshold`. A drag
  handle per row (`@dnd-kit`, same library mobile uses) calls `PATCH
  /api/tasks/reorder`, with an optimistic local reorder before the request
  resolves so a drag release feels instant. **Task type is not editable
  here** — nothing in the mobile UI lets a manager change a task's type
  after creation either. "+ Add Task" reuses `components/AddTaskSheet.tsx`
  directly, unmodified — its two-path flow (browse the template catalog,
  browse "Your Saved Tasks," or build a custom one) needed no console-side
  reimplementation since it's already just Tailwind markup with no mobile
  viewport assumptions baked in, and it fetches its own data via
  `useEffect` the same way it does on mobile.

- **NFC status, not NFC action**: a task with a bound tag (`nfcTagUid`,
  already inlined via the join) shows a plain "Linked" badge inline in the
  row, and "Bound · `<uid>`" in the expanded edit panel; one with none
  shows "Not linked — link NFC on mobile device," no button. This is the
  one deliberate capability gap versus mobile, called out in the UI itself
  rather than left as a silent missing feature. The tap-to-trigger
  `nfcTagCode` system and Task ↔ Inventory Linking are both **not shown at
  all** here — out of the spec's enumerated scope for this pane (name,
  icon, form fields, `projectedMinutes`, `scheduledDays`,
  `successThreshold`, reorder, add task, NFC status only), unaffected on
  mobile.

### What's explicitly unaffected

`ManageTasksView.tsx`, `TaskListEditView.tsx`, `AddTaskSheet.tsx` (reused,
not modified), `ManageTaskDetailSheet.tsx` — untouched. Same APIs, same
capabilities, same NFC binding flow, same on-the-fly mid-checklist
editing, same Task ↔ Inventory Linking. This page is a parallel entry
point into the same data, not a replacement for any of it.

## Deferred (not built this pass)

1. **Company Task Catalog browsing** — mobile's `ManageTasksView.tsx` also
   shows every saved `TaskDefinition` regardless of whether it's currently
   placed in any list (with the delete-blocked-while-placed rule). Not on
   this console page — the "lists on the left, tasks on the right" shape
   maps cleanly to per-list editing; the catalog is a meaningfully separate
   view, left mobile-only for now.
2. **`ProfileView.tsx` card copy** — shipped with role-aware subtitle text
   (see above) rather than one shared label, resolving what the original
   spec flagged as an open question.
3. **Manager's `/console` landing experience** — shipped as the spec's own
   lean: a bare two-pane task editor, no summary/dashboard content above
   it.

## Depends on

[`admin-console.md`](admin-console.md) — the layout/auth gate this
modifies, and the `components/console/` folder convention this adds to.
[`api/task-lists-api.md`](../api/task-lists-api.md) — every reused route.
[`features/task-lists.md`](../features/task-lists.md) — the mobile
UI/behavior this must not diverge from. [`features/nfc.md`](../features/nfc.md)
— why tag binding stays phone-only.
