> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Routine Review

A separate weekly reflection loop from the virtue weekly review ([virtues.md](virtues.md)) — this one looks at whether a routine *group*'s goal times, start time, and item order still match reality, using each item's real rolling-average duration as evidence. It reuses the `virtue_checkin`/`weekly_review` item-type pattern rather than inventing a parallel mechanism.

## Item type & seeding

`RoutineItem.itemType: "routine_review"` — seeded once per user via `lib/seed.ts`'s `ensureRoutineReviewItem`, an exact copy of `ensureVirtueCheckInItems`'s pattern: idempotent (bails if a `routine_review` item already exists for the user), appended to the end of the evening group. Kept as its own seed function rather than folded into `ensureVirtueCheckInItems` since it shipped later and the two are independently toggleable.

Like `weekly_review`, it's only actionable on Sundays — `lib/routine-visibility.ts`'s `isItemVisibleOn` hides it entirely on any other day, and `RoutineItemRow.tsx`'s Sunday-gated render block is a copy of `weekly_review`'s (see [routines.md](routines.md#item-types)).

## Entry points

Three, all opening the same flow at `app/(app)/routines/review/page.tsx` → `components/RoutineReviewFlow.tsx`:

- **`sunday_prompt`** — tapping the seeded evening item on a Sunday. `RoutinesView.tsx` routes to `/routines/review?date=…&entryPoint=sunday_prompt&return=routines` with **no `groupId`** — the seeded item isn't scoped to one routine group, so the flow opens on a group-picker step instead (below).
- **`analytics_button`** — a "Review" pill next to each routine group's completion % on the Analytics page (`components/AnalyticsContent.tsx`). Already has a `groupId`, so it skips the picker and opens straight to the timeline screen.
- **`notification`** — not built. Reserved in the `ReviewEntryPoint` type (`models/RoutineLog.ts`) for a future "it's been over a month since your last review" nudge, computed per group from the most recent `done` `routine_review` log — the same `RoutineLog.findOne({ userId, routineItemId, state: "done" }).sort({ date: -1 })` pattern used everywhere else in the app for "when did I last do X," not something bespoke.

## Step 0 — group picker

Only rendered when no `groupId` was passed in. Lists the user's routine groups (name + count of "timeable" items — see below), loaded server-side in `app/(app)/routines/review/page.tsx` directly from `RoutineGroup`/`RoutineItem` rather than through `GET /api/routines` (that route is stale — see [routines-api.md](../api/routines-api.md) — and doesn't need touching for this feature). A group with zero timeable items is filtered out of the list entirely.

## The data: `GET /api/routine-review?groupId=X&localDate=YYYY-MM-DD`

A sibling to `/api/analytics`, not a parameter on it — see [routines-api.md](../api/routines-api.md#routine-review) for the full response shape. Two choices worth calling out:

- **Timeable items only** — items with `itemType` `checkbox`/`virtue_checkin`/`weekly_review`/`routine_review` are excluded from the review entirely, the same "no real time target" convention `RoutineItemRow.tsx`'s `isTimeable` already uses.
- **28-day trailing window, no outlier rejection** — a deliberate choice, not an oversight. The window is long enough for a rolling average to be meaningful without trimmed means or outlier exclusion, on the reasoning that weekly-or-longer aggregation already smooths over one-off anomalies. In practice, a single extreme stray log (e.g. a forgotten-and-later-closed timer) *can* still skew an average when the window has very few samples — that's accepted, not a bug, per the same reasoning `lib/routine-progress.ts` and the Analytics dashboard already apply elsewhere.

## Screen 1 — timeline comparison

Two `components/TimelineBar.tsx` bars (see [timer.md](timer.md#live-routine-timeline) for the shared component) stacked: **Goal** (gold, `#c4a84a`) built from each item's current `projectedMinutes`, and **Actual avg** (blue-muted, `#4a7a9a`) built from each item's `avgActualMins` (falling back to its goal when there's no logged average yet). Both are static, retrospective layouts — `lib/routine-review-timeline.ts`'s `computeReviewTimeline` just turns a flat `{id, minutes}[]` into proportional segments, with none of `lib/routine-timeline.ts`'s live done/active/pending state, since there's no session in progress here. Deliberately a different two-color scheme from the live green/amber/red pacing bar — this view means "goal vs. average," not "on pace."

The goal bar's end time comes from `lib/projected-finish.ts`'s `staticBaselineFinish` (reused verbatim — same function the live on-track/behind indicator uses) fed the *current* start-time input and the goal segments' total. The average bar's start/end times are computed directly from the API's `avgStartMinutesUtc` (UTC minutes, converted to a local clock label) plus the average segments' total — it doesn't go through `staticBaselineFinish`, since that function expects a local `HH:MM` string tied to a stored schedule, and the average side already has to do its own UTC-to-local conversion regardless.

## Screen 2 — per-item goal editing

One row per item: name, current goal, computed average side by side. Tapping a row expands a numeric input pre-filled with the current goal, a "Use average" quick-fill button, and Save. Reuses only the minutes-input-plus-save-button pattern from `RoutineEditView.tsx`'s per-item edit form (`components/RoutineReviewFlow.tsx`'s `GoalEditRow`) — not that form's full type-toggle/icon-picker/schedule-days fields, none of which apply to a goal-time review. Save calls the existing `PATCH /api/routine-items/[id]` (already accepts `projectedMinutes`) immediately, same as `RoutineEditView` does, and records the `{routineItemId, oldMinutes, newMinutes}` pair into the flow's local state for the eventual log write.

## Screen 3 — start time & order

Shows the group's average start/end time (from the API's `avgStartMinutesUtc` plus the average timeline's total) next to an editable start-time input; a "Projected finish" label recalculates live as the input changes, from `startTime + sum(current goal minutes)` via `staticBaselineFinish`. Below it, a drag-to-reorder list using the same `@dnd-kit` primitives/pattern as `RoutineEditView.tsx`'s `SortableRow` (`components/RoutineReviewFlow.tsx`'s `OrderRow` — display-only, no inline edit form). Unlike `RoutineEditView`, which PATCHes `/api/routine-items/reorder` on every drop, this screen stages the new order locally and only commits it (along with the start time) when the review finishes — "effective starting the next occurrence" per the original ask, not applied mid-drag.

Reordering here is scoped to just this screen's timeable items — their `order` values are reassigned `0..n-1` among themselves via the existing `PATCH /api/routine-items/reorder`, reused verbatim. A group's non-timeable items (checkbox items, the special item types) keep whatever `order` they already had, which can leave duplicate order values across the two subsets; both subsets still sort correctly within themselves; a mixed-list rendering elsewhere in the app that doesn't separate timeable from non-timeable could see a tie. Not addressed here — flagging so it isn't mistaken for a regression if noticed later.

## Finishing, or declining

Closing the flow (the header's ✕) at any screen, or reaching Screen 3's "Finish review," both call the same `finish()` in `components/RoutineReviewFlow.tsx` — there's no separate "decline" code path. It writes the terminal log for the day's `routine_review` item via the existing `POST /api/routine-logs`, extended to accept an optional `reviewMetadata` field (see [routines-api.md](../api/routines-api.md#routine-logs)):

- **`state: "done"`** if anything was actually changed (a goal-time edit already saved via Screen 2, or — only reachable by finishing from Screen 3 — a start-time or order change committed just before the log write).
- **`state: "rest"`** otherwise — mirrors the existing Rest/Life convention (an intentional skip that doesn't break a streak), not `"missed"`; `"missed"` only ever arises the passive way any item goes unlogged for the day, not from inside this flow.
- **`actualMinutes`** is the flow's own real wall-clock duration (`Date.now() - flowStartedAt`, minimum 1), not a hardcoded value.
- **`reviewMetadata`** is only attached once a group has actually been loaded (i.e. past the group picker) — declining from the picker before selecting anything writes a plain `rest` log with no metadata, since there's nothing meaningful to attribute it to yet.

`reviewMetadata` shape (`models/RoutineLog.ts`): `entryPoint`, `groupId` (which group this session actually reviewed — added beyond what a routine_review log otherwise needs, since without it a log can't say which group it was about), `changesMade`, and optional `itemGoalChanges`/`startTimeChange`/`reorder` — populated only when that particular kind of change happened. See [routines-api.md](../api/routines-api.md#routine-logs) for the full field shapes.

## Future work, not built now

A recommendation comparing the actual completion order captured in `RoutineSession.completionSequence` (see [timer.md](timer.md#a-persisted-session-record)) against the intended order, surfaced on Screen 3 — e.g. "you tend to finish ten minutes faster in this order." No read endpoint exists yet for `RoutineSession` records (see routines-api.md); this is where that logic should live once one does.

## Files

- `models/RoutineItem.ts` — `"routine_review"` added to the `itemType` union/enum.
- `models/RoutineLog.ts` — `reviewMetadata` (optional, only ever set on a `routine_review` item's log) and the `ReviewEntryPoint` type.
- `lib/seed.ts` — `ensureRoutineReviewItem`.
- `lib/routine-visibility.ts` — Sunday-only gating, shared with `weekly_review`.
- `components/RoutineItemRow.tsx` — the Sunday-gated dispatch button (`onOpenRoutineReview`).
- `components/RoutinesView.tsx`, `components/RoutineGroupCard.tsx` — wiring `onOpenRoutineReview` down to the row and building the `sunday_prompt` URL.
- `components/AnalyticsContent.tsx` — the per-group "Review" button building the `analytics_button` URL.
- `app/(app)/routines/review/page.tsx` — server page: resolves the `routine_review` item id, and the group-picker's group list when no `groupId` is given.
- `components/RoutineReviewFlow.tsx` — the four-screen client flow itself.
- `lib/routine-review-timeline.ts` — `computeReviewTimeline`, the static goal/average segment math.
- `components/TimelineBar.tsx` — the shared presentational bar, also used by the live session (see [timer.md](timer.md)).
- `app/api/routine-review/route.ts` — the per-group goal-vs-average data endpoint.
- `app/api/routine-logs/route.ts` — `POST` extended to accept and store `reviewMetadata`.

## Depends on

[`docs/api/routines-api.md`](../api/routines-api.md) — the `routine_review` item type, the `reviewMetadata` log shape, and `GET /api/routine-review`. [`timer.md`](timer.md) for `TimelineBar`/`staticBaselineFinish` reuse. [`virtues.md`](virtues.md) for the parallel (but separate) weekly virtue review this sits alongside.
