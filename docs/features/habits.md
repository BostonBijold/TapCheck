> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Habits

"Habits" is a single, dedicated `RoutineGroup` per user (`timeOfDay: "habit"`, named "Habits") holding items that aren't tied to a specific time-of-day window — everything about the underlying data model, log states, and timer mechanics is shared with [routines.md](routines.md) and [timer.md](timer.md); this doc covers only what's *different* about habit groups.

## How it differs from a time-of-day routine group

In `components/RoutineGroupCard.tsx`:

- **Never collapses.** `isHabitGroup = group.timeOfDay === "habit"` forces `effectivelyCollapsed = false` unconditionally — the time-window collapse logic described in routines.md (`startTime`/`deriveCollapseAfter`) never applies, because habit groups are seeded with `startTime: null`.
- **No "Start Routine" CTA.** The sequential-session button is explicitly excluded for `timeOfDay === "habit"`; `RoutinesView.tsx` passes a no-op (`onStartRoutine={() => {}}`) for the Habits section. The [external API](../api/external-api.md) doesn't share this restriction, though — it's the only current way to open a Routine Session for a Habit group.
- **Renders `HabitItemCard` instead of `RoutineItemRow`** — a visually different card (always-visible primary action, no tap-to-expand) but the same underlying `RoutineLog` state machine (`pending`/`in_progress`/`paused`/`done`/`missed`/`rest`, same Undo behavior, same back-entry minutes-input pattern when viewing a past date). This includes the single-active-timer invariant described in [timer.md](timer.md) — starting a habit's timer while some other item (routine or habit) is still `in_progress` auto-*completes* that other one server-side. A habit item left `paused` (only reachable via a Routine Session opened for a Habit group through the external API, since "Start Routine" itself isn't offered in-app — see below) resumes the same way a routine item does: `handleStartTimer` sees the log is `in_progress`/`paused` with a `sessionGroupId` and reopens the Routine Session anchored at that item rather than a standalone timer. Unlike `RoutineItemRow` (which surfaces this as an explicit "Resume Timer" button in its expanded action panel), `HabitItemCard` has no separate paused visual — the same always-visible primary action button (▶ + duration, or "Start" for a stopwatch) is tapped either way.

Since habit groups have no time window, `isBackEntry` for a habit item reduces to just "is this a past calendar date" (there's no "scheduled window already passed today" case).

## Adding a habit

`components/AddHabitSheet.tsx` (opened from the "+ Add" link on the Habits section, or the FAB's dial) offers two paths:

1. **Browse a template** — `GET /api/habit-templates?groupId=…` returns the catalog of `HabitTemplate` documents (system-seeded + this user's own custom ones), excluding templates already added as an active item in this group. Selecting one always creates the new `RoutineItem` with `itemType: "standard"`, and skips the schedule/threshold prompt below — every day, full threshold, same as any other unconfigured item — editable afterward (see "Editing a habit" below).
2. **Create a custom habit** — the user picks a type (`standard`/`stopwatch`/`checkbox`), icon, name, (for `standard`) a target duration, and a **schedule + success threshold**: a day-of-week toggle row (default all 7 selected) and a threshold number input that auto-follows the selected-day count until the user deliberately lowers it below that (see [routines.md](routines.md#weekly-schedule--success-threshold) for what these mean). Saving first `POST`s a brand-new `HabitTemplate` (`isSystem: false`, no dedupe against existing custom templates of the same name), then adds a `RoutineItem` referencing it with the chosen schedule/threshold.

Either path ends by calling `POST /api/routine-items` (documented in [routines-api.md](../api/routines-api.md) — there is no habit-specific item-creation endpoint).

## Editing a habit

There's no edit affordance directly on `HabitItemCard` — the edit path is the same one time-of-day routine items use: the "⚙ Manage" button (in the Routine groups section header) opens `ManageRoutinesSheet`, which lists **every** group including the "Habits" group, linking to `/routines/[groupId]/edit` → `components/RoutineEditView.tsx`. That view is completely generic over `RoutineItem`s regardless of the parent group's `timeOfDay`, so a habit item's name/icon/type/minutes and its `scheduledDays`/`successThreshold` are all editable there exactly like a routine item's — see [routines.md](routines.md#reordering--editing-groups).

## Quick-log flow (FAB → "Habit")

`components/FABHabitSheet.tsx` is a separate, lighter-weight modal (opened from the FAB dial, not from the Habits section itself) for quickly marking habits done without visiting the Routines page:

- `GET /api/habits?date=…` returns every active item across all of the user's habit groups for that date, each with a plain `done: boolean` derived from `state === "done"` — `"missed"`, `"rest"`, `"in_progress"`, and `"paused"` all read as `done: false` here, since this sheet has no way to represent them.
- Tapping a row `POST`s `{ state: "done", actualMinutes: 0 }` to `/api/routine-logs` — **always** zero minutes, no timer, no manual entry.
- **This is a one-way toggle.** Once `done`, the button is disabled — there is no Undo from this sheet (unlike `HabitItemCard`'s full state machine on the main Routines page).
- The `date` query param defaults to the *server's* UTC date if omitted, not the client's local date — worth remembering if this sheet is ever called without an explicit date near midnight.

## Auto-provisioning

`ensureHabitsGroup(userId)` (`lib/seed.ts`) is idempotent and runs unconditionally on every load of the Routines page. If the user has no `timeOfDay: "habit"` group yet, it creates exactly one, empty, ordered after all existing groups. Habit *items* are never seeded automatically — a user's Habits section starts empty and is populated entirely by hand via `AddHabitSheet`.

## Files

- `components/BottomNav.tsx` — FAB dial entry point that opens `FABHabitSheet`.
- `components/FABHabitSheet.tsx` — quick "mark done" modal (see above).
- `components/RoutinesView.tsx` — splits `groups` into `routineGroups` vs `habitGroups` and renders the Habits section.
- `components/RoutineGroupCard.tsx` — the `timeOfDay === "habit"` branch described above.
- `components/HabitItemCard.tsx` — per-item card for habit groups (done/missed/rest/pending, timer-start or checkbox-done, back-entry minutes input, skip options).
- `components/AddHabitSheet.tsx` — browse-template / create-custom flow, including the schedule/threshold controls (custom-create only).
- `components/RoutineEditView.tsx` — also the habit-item edit path, see "Editing a habit" above.
- `components/HabitIcon.tsx`, `components/StreakDots.tsx` — shared icon renderer/picker and the fixed-calendar-week (Sunday–Saturday) streak strip, see [routines.md](routines.md#streaks--variance).
- `lib/routine-progress.ts` — the shared weekly schedule/threshold math (see [routines.md](routines.md#weekly-schedule--success-threshold)) — same function, same behavior, whether the item lives in a habit group or a time-of-day one.
- `lib/seed.ts` (`ensureHabitsGroup`), `lib/seed-templates.ts` (`ensureSystemTemplates`, the hardcoded `SYSTEM_TEMPLATES` catalog).
- `models/HabitTemplate.ts` — the catalog schema; `RoutineItem.templateId` is the only link back to it, and it's a one-time copy (editing/deleting a template afterward does not affect items already created from it).

## Depends on

- [`docs/api/habits-api.md`](../api/habits-api.md) — `/api/habits`, `/api/habit-templates`.
- The routine-items and routine-logs sections of [`docs/api/routines-api.md`](../api/routines-api.md) — adding a habit item and logging its state both go through those shared endpoints, not a habits-specific one.
