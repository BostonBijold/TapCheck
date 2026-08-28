> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Facility Checks (standalone check group)

"Facility Checks" is a single, dedicated `RoutineGroup` per user (`timeOfDay: "habit"`, named "Facility Checks") holding checks that aren't tied to a specific shift window — everything about the underlying data model, log states, and timer mechanics is shared with [routines.md](routines.md) and [timer.md](timer.md); this doc covers only what's *different* about this group.

## How it differs from a shift-window group

In `components/RoutineGroupCard.tsx`:

- **Never collapses.** `isHabitGroup = group.timeOfDay === "habit"` forces `effectivelyCollapsed = false` unconditionally — the time-window collapse logic described in routines.md (`startTime`/`deriveCollapseAfter`) never applies, because this group is seeded with `startTime: null`.
- **No "Start Checks" CTA.** The sequential-session button is explicitly excluded for `timeOfDay === "habit"`; `RoutinesView.tsx` passes a no-op (`onStartRoutine={() => {}}`) for this section. The [external API](../api/external-api.md) doesn't share this restriction, though — it's the only current way to open a guided session for this group.
- **Renders `HabitItemCard` instead of `RoutineItemRow`** — a visually different card (always-visible primary action, no tap-to-expand) but the same underlying `RoutineLog` state machine (`pending`/`in_progress`/`paused`/`done`/`missed`/`rest`, same Undo behavior, same back-entry pattern when viewing a past date). This includes the single-active-timer invariant described in [timer.md](timer.md) — starting a check's timer while some other item is still `in_progress` auto-*completes* that other one server-side.

Since this group has no time window, `isBackEntry` for one of its items reduces to just "is this a past calendar date" (there's no "scheduled window already passed today" case).

## Adding a check

`components/AddHabitSheet.tsx` (opened from the "+ Add" link on the Facility Checks section, or "+ Add your first check" when the group is empty) offers two paths:

1. **Browse a template** — `GET /api/habit-templates?groupId=…` returns the catalog of `HabitTemplate` documents (system-seeded + this user's own custom ones), excluding templates already added as an active item in this group. Selecting one creates the new `RoutineItem` as `itemType: "form_check"`, carrying the template's `formFields` straight through, and skips the schedule/threshold prompt below — every day, full threshold, same as any other unconfigured item.
2. **Create a custom check** — the user names it, picks an icon, and builds its checklist fields (number readings with an optional unit/min/max, or yes/no items) via the shared field editor, plus a **schedule + success threshold**: a day-of-week toggle row (default all 7 selected) and a threshold number input that auto-follows the selected-day count until the user deliberately lowers it below that (see [routines.md](routines.md#weekly-schedule--success-threshold) for what these mean). Saving first `POST`s a brand-new `HabitTemplate` (`isSystem: false`, no dedupe against existing custom templates of the same name), then adds a `RoutineItem` referencing it with the chosen fields/schedule/threshold.

Either path ends by calling `POST /api/routine-items` (documented in [routines-api.md](../api/routines-api.md) — there is no group-specific item-creation endpoint). `form_check` is the only creatable item type — the old timer-based types (`standard`/`stopwatch`/`checkbox`) remain in the schema for compatibility but nothing in the UI creates them anymore.

## Editing a check

There's no edit affordance directly on `HabitItemCard` — the edit path is the same one shift-window items use: the gear icon (`aria-label="Manage {group.name}"`) on the group card header, `components/RoutineGroupCard.tsx`, links to `/routines/[groupId]/edit` → `components/RoutineEditView.tsx`, which works the same regardless of `timeOfDay`. That view is completely generic over `RoutineItem`s regardless of the parent group's `timeOfDay`, so a check's name/icon/fields and its `scheduledDays`/`successThreshold` are all editable there exactly like a shift-window item's — see [routines.md](routines.md#editing-groups-and-items).

## Auto-provisioning

`ensureHabitsGroup(userId)` (`lib/seed.ts`) is idempotent and runs unconditionally on every load of the Routines page. If the user has no `timeOfDay: "habit"` group yet, it creates "Facility Checks" pre-seeded with four example `form_check` items (Fridge temp, Freezer temp, Men's Room, Women's Room) — unlike shift groups, this group is never left empty by the seed.

## Files

- `components/RoutinesView.tsx` — splits `groups` into shift groups vs. the standalone "habit"-type group and renders this section.
- `components/RoutineGroupCard.tsx` — the `timeOfDay === "habit"` branch described above.
- `components/HabitItemCard.tsx` — per-item card for this group (done/missed/rest/pending, timer-start, back-entry, skip options).
- `components/AddHabitSheet.tsx` — browse-template / create-custom flow, including the field editor and schedule/threshold controls (custom-create only).
- `components/RoutineEditView.tsx` — also the check-item edit path, see "Editing a check" above.
- `components/HabitIcon.tsx`, `components/StreakDots.tsx` — shared icon renderer/picker and the fixed-calendar-week (Sunday–Saturday) streak strip, see [routines.md](routines.md#streaks--variance).
- `lib/routine-progress.ts` — the shared weekly schedule/threshold math (see [routines.md](routines.md#weekly-schedule--success-threshold)) — same function, same behavior, whether the item lives in this group or a shift-window one.
- `lib/seed.ts` (`ensureHabitsGroup`), `lib/seed-templates.ts` (`ensureSystemTemplates`, the hardcoded `SYSTEM_TEMPLATES` catalog).
- `models/HabitTemplate.ts` — the catalog schema; `RoutineItem.templateId` is the only link back to it, and it's a one-time copy (editing/deleting a template afterward does not affect items already created from it).

## Depends on

- [`docs/api/habits-api.md`](../api/habits-api.md) — `/api/habit-templates`.
- The routine-items and routine-logs sections of [`docs/api/routines-api.md`](../api/routines-api.md) — adding a check and logging its state both go through those shared endpoints, not a group-specific one.
