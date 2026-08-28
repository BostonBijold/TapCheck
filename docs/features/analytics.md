> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Analytics

`app/(app)/analytics/page.tsx` → `AnalyticsView` → `AnalyticsContent` (`components/AnalyticsContent.tsx`, `"use client"`) — a task-list-performance and task-breakdown dashboard, backed entirely by `GET /api/analytics` (`app/api/analytics/route.ts`).

## Two windows: 7-day fixed week vs. 30-day rolling

A toggle switches between two fundamentally different date ranges, both computed server-side by `getDates(days, anchorDate)`:

- **7-day** — a **fixed Sunday–Saturday calendar week** containing `anchorDate` (`lib/week-dates.ts`'s `calendarWeekDates`, the same helper `StreakDots` uses — see [task-lists.md](task-lists.md#streaks--variance)). This can include dates *after* `anchorDate` (later this week) — the client renders those as a distinct pending state rather than pretending they're "no data" days. The frame is always 7 slots wide regardless of what day of the week `anchorDate` is.
- **30-day** — the previous behavior, unchanged: a trailing window of the 30 days ending at `anchorDate`. By construction this never contains a future date, so none of the pending-state logic below ever applies to it.

`anchorDate` is the client's local date (`?localDate=`, computed client-side via `toLocaleDateString("en-CA")` in `AnalyticsContent`'s fetch effect) — never derived from server UTC, since a UTC "today" can be off by a day from the user's actual local day. The response echoes it back as `today`, which the client needs to tell a future date in the 7-day window apart from a past/today date with no logs.

## Denominators exclude days that haven't happened yet

Per-day breakdowns (`daily` on both task-list and task stats) always include every date in the window, including future ones — the chart needs a fixed number of slots to render a consistent width. But aggregate denominators — `tasks[].totalDays` and `tasks[].unloggedCount` — are computed over `elapsedDates` (`dates.filter(d => d <= anchorDate)`), not the full `dates` array, so a future date never inflates "X of Y days logged" or counts as unlogged. Task-list-level `avgCompletionRate`/`avgActualMins` didn't need an equivalent fix — they're already derived from `daily.filter(d => d.loggedCount > 0)`, and a future date can never have a log, so it's naturally excluded.

## Rendering: pending days and the today marker

`TaskListChart` (inside `AnalyticsContent.tsx`) renders each task list's `daily` array as a bar chart. For a date after `today`, it renders a dashed hollow placeholder bar instead of the normal solid one — distinct from how a real past/today day with zero logged tasks renders (a solid, minimal-height dark bar via `barColor`'s `!hasLogs` branch). When `showLabels` is on (7-day view only), today's weekday letter is bolded in gold with a small dot beneath it, so today is identifiable without hunting for the right label — a heavier treatment than `StreakDots`' small ring, appropriate for a larger standalone chart per-instance rather than something repeated on every row.

## Task Breakdown: schedule-aware, not a flat gold bar

Each `TaskRow` (the row component defined inside `AnalyticsContent.tsx` — not to be confused with `components/TaskRow.tsx`, the Tasks page's own per-task row) used to render one solid bar colored by raw completion rate, regardless of whether the task was even expected every day — a Mon–Fri task with two weekday misses looked identical to one with none. For the 7-day view, this is now driven by the same weekly schedule/threshold model documented in [task-lists.md](task-lists.md#weekly-schedule--success-threshold): `app/api/analytics/route.ts` calls the shared `lib/task-progress.ts`'s `computeWeeklyProgress(task.scheduledDays, task.successThreshold, ...)` per task and attaches the result as an optional `weeklyProgress` field, present only when `days === 7` (a weekly threshold has no clean meaning over the 30-day trailing window, so that toggle keeps the original single completion-rate bar unchanged).

When `weeklyProgress` is present, this row replaces the single bar with:
- A **7-segment day strip** — one segment per day of the week, styled by that day's `DayState` and (for `done` days) its `timing` tier via `daySegmentStyle`, mirroring `StreakDots`' `dotClass` exactly (same six states, same solid-fill-vs-hollow-outline logic — see [task-lists.md](task-lists.md#weekly-schedule--success-threshold)) so a segment and a dot always mean the same thing. A `done` day is a solid green/amber fill by how close `actualMinutes` came to `projectedMinutes` — amber covers overtime at any severity, there's no separate "way over" tier; `missed` is a hollow box with a solid red border plus a small ✕ mark (there's room for the glyph here, unlike `StreakDots`' 5px dots, which drop it and rely on the border alone); `unlogged` is the same hollow shape with a solid grey border and no mark; `pending` is grey too but **dashed**, the one thing distinguishing "still open" from "past and never logged." Red is reserved exclusively for `missed` — no other segment, solid or hollow, ever renders red.
- A **pacing badge** (`green` "on track" / `amber` "in reach" / `red` "will miss") plus the uncapped percentage (`successCount / successThreshold * 100`, can read over 100%) — this is a separate, week-level verdict about hitting the threshold count, unrelated to any single day's timing color, and keeps its own 3-tier red for "will miss" independent of the day-strip's 2-tier collapse.

The count line above the bar also switches source for the 7-day view — it reads off `weeklyProgress.days` (schedule-aware: a `not_scheduled` day or an off-schedule stray log is never counted) instead of the unscoped `task.doneCount`-style fields, which stay in place only as the 30-day view's fallback. Every number gets its own label and color, so the line is self-describing without the day-strip: **done** (olive, logged done — on/under target), **overtime** (amber, a *subset* of the done count — a done day that ran over target, broken out into its own chip rather than only hinted at by the strip's segment color), **rest** (blue), **missed** (red — explicit Missed tap only), **unlogged** (dim/grey — strictly-past, never logged; a separate chip from `missed`, not folded together as it briefly was).

## Data shape (`GET /api/analytics?days=7|30&localDate=YYYY-MM-DD`)

```ts
{
  dates: string[];   // all dates in the window, oldest → newest
  days: number;
  today: string;     // == localDate, echoed back
  taskLists: Array<{ _id, name, totalTasks, daily: DailyStat[], avgCompletionRate, avgActualMins, totalProjectedMins, avgStartMinutesUtc, startTimeSampleSize }>;
  tasks: Array<{
    _id, name, icon, taskListId, taskListName, projectedMinutes, daily,
    doneCount, missedCount, restCount, unloggedCount, avgActualMins, avgVariance,
    completionRate, engagedDays, totalDays, taskType,
    weeklyProgress?: WeeklyProgress; // only when days === 7 — see lib/task-progress.ts
  }>;
}
```

`avgStartMinutesUtc` is a task list's average earliest `startedAt` across days it was logged, still in UTC minutes-since-midnight — the client (`utcMinsToLocalTime`) converts using the browser's own timezone offset, the same UTC-storage/local-display split used throughout the timer system (see [timer.md](timer.md)).

## Files

- `app/api/analytics/route.ts` — all aggregation; `getDates` (7-day fixed week vs. 30-day trailing), `elapsedDates` denominator handling, per-task `weeklyProgress`.
- `lib/week-dates.ts` — `calendarWeekDates`, shared with `StreakDots`'s date range.
- `lib/task-progress.ts` — `computeWeeklyProgress`, shared with `StreakDots` — see [task-lists.md](task-lists.md#weekly-schedule--success-threshold).
- `components/AnalyticsContent.tsx` — `TaskListChart` (task-list bar charts, pending/today rendering, unaffected by the schedule/threshold work), `TaskRow` (per-task bar — segmented + pacing for the 7-day view, the original single completion bar for 30-day).
- `components/AnalyticsView.tsx` — thin wrapper adding `Header`.

## Depends on

[`api/task-lists-api.md`](../api/task-lists-api.md) for the `TaskLog` states this all aggregates over, and the `scheduledDays`/`successThreshold` fields on `Task`.
