> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Anytime task lists (standalone, never collapse)

An "anytime" task list is a `TaskList` with `timeOfDay: "anytime"` and `startTime: null`, holding tasks that aren't tied to a specific shift window — everything about the underlying data model, log states, and timer mechanics is shared with [task-lists.md](task-lists.md) and [timer.md](timer.md); this doc covers only what's *different* about this kind of list. Every company gets one auto-provisioned anytime list named "Anytime Tasks" (see "Auto-provisioning" below), and a manager can create additional ones the same way as any other task list (see [task-lists.md](task-lists.md#manager-created-task-lists)) by leaving the start time blank.

## How it differs from a shift-window list

In `components/TaskListCard.tsx`:

- **Never collapses.** `isAnytimeList = taskList.timeOfDay === "anytime"` forces `effectivelyCollapsed = false` unconditionally — the time-window collapse logic described in task-lists.md (`startTime`/`deriveCollapseAfter`) never applies, because this kind of list is created with `startTime: null`.
- **No "Start Tasks" CTA.** The sequential-session button is explicitly excluded for `timeOfDay === "anytime"`; `TasksView.tsx` passes a no-op (`onStartTaskList={() => {}}`) for this section. The [external API](../api/external-api.md) doesn't share this restriction, though — it's the only current way to open a guided session for one of these lists.
- **Renders `TaskCard` instead of `TaskRow`** — a visually different card (always-visible primary action, no tap-to-expand) but the same underlying `TaskLog` state machine (`pending`/`in_progress`/`paused`/`done`/`missed`/`rest`, same Undo behavior, same back-entry pattern when viewing a past date). This includes the single-active-timer invariant described in [timer.md](timer.md) — starting a task's timer while some other task is still `in_progress` for that same person auto-*completes* that other one server-side.

Since this kind of list has no time window, `isBackEntry` for one of its tasks reduces to just "is this a past calendar date" (there's no "scheduled window already passed today" case).

## Adding a task

`components/AddTaskSheet.tsx` (opened from the "+ Add" link on an anytime section, or "+ Add your first task" when the list is empty — and reused verbatim by the "Add Task List" flow, see [task-lists.md](task-lists.md#manager-created-task-lists)) offers two paths:

1. **Browse a template** — `GET /api/task-templates?taskListId=…` returns the catalog of `TaskTemplate` documents (system-seeded + this company's own custom ones), excluding templates already added as an active task in this list. Selecting one creates the new `Task` as `taskType: "form"`, carrying the template's `formFields` straight through, and skips the schedule/threshold prompt below — every day, full threshold, same as any other unconfigured task.
2. **Create a custom task** — the user names it, picks an icon, and builds its checklist fields (number readings with an optional unit/min/max, or yes/no items) via the shared field editor, plus a **schedule + success threshold**: a day-of-week toggle row (default all 7 selected) and a threshold number input that auto-follows the selected-day count until the user deliberately lowers it below that (see [task-lists.md](task-lists.md#weekly-schedule--success-threshold) for what these mean). Saving first `POST`s a brand-new `TaskTemplate` (`isSystem: false`, no dedupe against existing custom templates of the same name), then adds a `Task` referencing it with the chosen fields/schedule/threshold.

Either path ends by calling `POST /api/tasks` (documented in [task-lists-api.md](../api/task-lists-api.md) — there is no list-specific task-creation endpoint). `form` is the only creatable task type — the old timer-based types (`standard`/`stopwatch`/`checkbox`) remain in the schema for compatibility but nothing in the UI creates them anymore.

## Editing a task

There's no edit affordance directly on `TaskCard` — the edit path is the same one shift-window tasks use: the gear icon (`aria-label="Manage {taskList.name}"`) on the list card header, `components/TaskListCard.tsx`, links to `/tasks/[taskListId]/edit` → `components/TaskListEditView.tsx`, which works the same regardless of `timeOfDay`. That view is completely generic over `Task`s regardless of the parent list's `timeOfDay`, so a task's name/icon/fields and its `scheduledDays`/`successThreshold` are all editable there exactly like a shift-window task's — see [task-lists.md](task-lists.md#editing-renaming-and-deleting-task-lists).

## Auto-provisioning

`ensureAnytimeTaskList(companyId)` (`lib/seed.ts`) is idempotent and runs unconditionally on every load of the Tasks page. If the company has no `timeOfDay: "anytime"` list yet, it creates "Anytime Tasks" pre-seeded with four example form tasks (Fridge temp, Freezer temp, Men's Room, Women's Room) — unlike shift lists, this list is never left empty by the seed.

## Files

- `components/TasksView.tsx` — splits `taskLists` into scheduled shift lists vs. standalone anytime lists and renders this section.
- `components/TaskListCard.tsx` — the `timeOfDay === "anytime"` branch described above.
- `components/TaskCard.tsx` — per-task card for this kind of list (done/missed/rest/pending, timer-start, back-entry, skip options).
- `components/AddTaskSheet.tsx` — browse-template / create-custom flow, including the field editor and schedule/threshold controls (custom-create only).
- `components/TaskListEditView.tsx` — also the task edit path, see "Editing a task" above.
- `components/AppIcon.tsx`, `components/StreakDots.tsx` — shared icon renderer/picker and the fixed-calendar-week (Sunday–Saturday) streak strip, see [task-lists.md](task-lists.md#streaks--variance).
- `lib/task-progress.ts` — the shared weekly schedule/threshold math (see [task-lists.md](task-lists.md#weekly-schedule--success-threshold)) — same function, same behavior, whether the task lives in this kind of list or a shift-window one.
- `lib/seed.ts` (`ensureAnytimeTaskList`), `lib/seed-templates.ts` (`ensureSystemTemplates`, the hardcoded `SYSTEM_TEMPLATES` catalog).
- `models/TaskTemplate.ts` — the catalog schema; `Task.templateId` is the only link back to it, and it's a one-time copy (editing/deleting a template afterward does not affect tasks already created from it).

## Depends on

- [`docs/api/task-templates-api.md`](../api/task-templates-api.md) — `/api/task-templates`.
- The tasks and task-logs sections of [`docs/api/task-lists-api.md`](../api/task-lists-api.md) — adding a task and logging its state both go through those shared endpoints, not a list-specific one.
