> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Routines

The Today/Routines page groups a user's daily habits into time-of-day `RoutineGroup`s (Morning, Afternoon, Evening, and any user-created "custom" groups), each containing an ordered list of `RoutineItem`s. Each item's status for a given date is tracked by a separate `RoutineLog` document, so history is never overwritten — every day gets its own log per item.

## Item types

`RoutineItem.itemType` is one of:

- **`standard`** — has a `projectedMinutes` target; tapping it opens the [timer](timer.md).
- **`stopwatch`** — no target; opens the timer in stopwatch (count-up only) mode.
- **`checkbox`** — no timer at all; a single tap marks it done.
- **`virtue_checkin`** — opens the virtue check-in modal instead of a timer (not covered by this doc).
- **`weekly_review`** — only actionable on Sundays; on other days it shows "Sunday habit — skip or rest for today" instead of its normal action panel.

## Log states

A `RoutineLog` (see [routines-api.md](../api/routines-api.md)) has `state: "in_progress" | "done" | "missed" | "rest"`, or simply has no log yet ("pending"). `in_progress` does **not** count as complete for a group's completion check — it means the item is actively being timed.

- **pending** → tap opens the row and shows: Start Timer/Start Stopwatch (standard/stopwatch), a plain Done button (checkbox), or Missed/Rest buttons. If the group's scheduled window has passed ("back-entry" mode, see below), the timer button is replaced by a Done button plus a manual minutes input.
- **in_progress** → shows "▶ Resume Timer" (reopens the timer, seeded with elapsed time from the server's `startedAt`) plus Missed/Undo. The API enforces that **at most one log can be `in_progress` at a time per user** — starting a timer elsewhere auto-completes whatever was left running instead of leaving two things active at once (see [timer.md](timer.md)).
- **done** → shows an "Edit time" button (standard/stopwatch items) that opens a manual start/end time editor, plus Missed/Rest/Undo.
- **missed** / **rest** → shows a retry action (Start Timer, or Done+minutes if in back-entry mode) plus the other skip state and Undo.
- **Undo** (any logged state) calls `onStateChange(null)`, which `DELETE`s the log entirely — the item returns to pending.
- **Manual time entry** ("Edit time" / "Log with specific times") lets the user type a start and end clock time directly; it computes minutes client-side and calls `onStateChange("done", { startedAt, completedAt })`, which bypasses the timer UI entirely and PATCHes explicit timestamps (see routines-api.md).

Implemented in `components/RoutineItemRow.tsx` (`app/api/routine-logs` is the log endpoint used by every action above — see [routines-api.md](../api/routines-api.md)).

## Time-aware collapse (today only)

Each group (except Habits, see [habits.md](habits.md)) has a `startTime` (`HH:MM`) and an implied end time, `deriveCollapseAfter`, computed as `startTime + sum(projectedMinutes of all non-checkbox items)` (`components/RoutineGroupCard.tsx`). On today's view:

- **Before `startTime`** — collapsed, shown as "starts `HH:MM`".
- **Between `startTime` and the derived end time** — expanded by default.
- **After the derived end time** — collapsed by default, and items switch into **back-entry mode**: the timer-start action is replaced by a Done button with a manual minutes input, since the scheduled window has passed.
- Once every visible item in the group is `done`/`missed`/`rest`, the card auto-collapses to a summary view after a 600ms delay (today's view only).
- **Past dates** (via the date nav) always render expanded, unconditionally, so history is fully visible — the time-window logic above only applies when viewing today.

Custom groups without a `startTime` never derive a collapse window and simply stay expanded/manually-toggleable.

## Streaks & variance

Each row shows `StreakDots` (`components/StreakDots.tsx`) — a 7-day dot strip built from `weekLogs`. For timed items marked done, the row also shows the variance between `actualMinutes` and `projectedMinutes` (e.g. `+8m` in an "over" color, `-3m` in an "under" color).

## Reordering & editing groups

- `components/ManageRoutinesSheet.tsx` — sheet for adding/reordering/renaming groups and items.
- `components/RoutineEditView.tsx` (`app/(app)/routines/[groupId]/edit/page.tsx`) — dedicated group-edit page.
- Deleting an item is a **soft delete** (`isActive: false`, via `DELETE /api/routine-items/[id]`) — history in `RoutineLog` is preserved even after an item is removed from the active list.

## The "Start Routine" sequential session

Tapping "Start Routine"/"Continue Routine" on a group (not shown for Habit groups) opens `components/RoutineSession.tsx`, which steps through that group's items one at a time in a single full-screen flow rather than expanding rows individually. Each item gets its own server-side `in_progress` record as it becomes current, and closing the session mid-item flushes that item's progress rather than discarding it — full mechanics in [timer.md](timer.md).

## Files

- `app/(app)/routines/page.tsx` — server component: auth, seeding, loads groups/items/logs for the selected date.
- `components/RoutinesView.tsx` — top-level client state: selected date, logs map, opens/closes the timer and session overlays, all the `handleStateChange`/`handleStartTimer`/… handlers.
- `components/RoutineGroupCard.tsx` — per-group card: collapse logic, completion check, renders `RoutineItemRow` (or `HabitItemCard` for Habit groups).
- `components/RoutineItemRow.tsx` — per-item row and its full action panel (all states above).
- `components/RoutineSession.tsx` — sequential multi-item session (see [timer.md](timer.md)).
- `components/DateNav.tsx` — the `< Today >` date picker driving `selectedDate`.
- `components/ManageRoutinesSheet.tsx`, `components/RoutineEditView.tsx` — group/item management.
- `lib/routine-visibility.ts` — determines whether an item is visible on a given date (custom recurrence).
- `lib/seed.ts` — idempotent seeding of default groups/items for new users.

## Depends on

[`docs/api/routines-api.md`](../api/routines-api.md) — routine groups, routine items, and routine logs endpoints.
