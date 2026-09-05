// Pure weekly-progress math — safe to import from client or server code.
// Shared by StreakDots (per-row dot strip) and the Reports Overview's Task
// Breakdown (segmented bar + pacing verdict) so the two never diverge.

export type DayState = "done" | "missed" | "unlogged" | "pending" | "not_scheduled";

// How close a "done" day came to its target — a display-only tier layered
// on top of `state`; it never affects successCount/pacing below (going over
// time still counts as a win toward the threshold, it just renders
// differently). Only meaningful when state === "done" and the task has a
// real time target (standard/countdown tasks — not checkbox or stopwatch,
// see targetMinutes below); null otherwise.
//
// Only two tiers, deliberately: red is reserved exclusively for `missed`
// (see DayState rendering in StreakDots/components/reports/TaskStatRow.tsx)
// — any amount of overtime, however severe, reads as amber, not a third
// "way over" red tier.
export type TimingTier = "green" | "amber";

export interface DayBreakdown {
  date: string;
  state: DayState;
  timing: TimingTier | null;
}

export interface WeeklyProgress {
  days: DayBreakdown[]; // all 7 week dates (Sunday→Saturday), in order
  weekScheduledCount: number;
  successCount: number;
  successThreshold: number;
  remainingScheduled: number;
  percentage: number; // successCount / successThreshold * 100 — uncapped
  pacing: "green" | "amber" | "red";
}

function timingFor(actualMinutes: number | null, targetMinutes: number | null): TimingTier | null {
  if (targetMinutes == null || targetMinutes <= 0 || actualMinutes == null) return null;
  const ratio = actualMinutes / targetMinutes;
  return ratio <= 1 ? "green" : "amber"; // on time/under vs. over by any amount
}

// logsByDate: this task's log for each date it has one, keyed by
// YYYY-MM-DD — state plus actualMinutes (needed for the timing tier above).
// A past scheduled day with no entry here reads as "unlogged" — visually
// distinct from an explicit "missed" tap, though both are equally "not a
// success" for successCount/pacing below. This is a read-time
// interpretation only — never write a synthetic log to represent it.
//
// targetMinutes: the task's projected/target minutes, or null for task
// types with no real time target (checkbox, stopwatch) — timing is always
// null for those, regardless of actualMinutes.
export function computeWeeklyProgress(
  scheduledDays: number[],
  successThreshold: number,
  logsByDate: Record<string, { state: "done" | "missed"; actualMinutes: number | null } | undefined>,
  weekDates: string[], // Sunday→Saturday, from calendarWeekDates
  today: string,
  targetMinutes: number | null = null
): WeeklyProgress {
  const scheduledSet = new Set(scheduledDays);

  const days: DayBreakdown[] = weekDates.map((date) => {
    const dow = new Date(date + "T12:00:00").getDay();
    // Not expected this day at all — excluded from everything below,
    // regardless of whether a log happens to exist for it (schedule wins
    // over log presence; an off-schedule log is invisible to this math,
    // not a bonus).
    if (!scheduledSet.has(dow)) return { date, state: "not_scheduled", timing: null };
    if (date > today) return { date, state: "pending", timing: null };
    const log = logsByDate[date];
    if (log?.state === "done") return { date, state: "done", timing: timingFor(log.actualMinutes, targetMinutes) };
    if (log?.state === "missed") return { date, state: "missed", timing: null };
    // No log at all: today is still open (unresolved, not yet a miss) —
    // only a *strictly past* day with nothing logged defaults to unlogged.
    if (date === today) return { date, state: "pending", timing: null };
    return { date, state: "unlogged", timing: null };
  });

  const weekScheduledCount = days.filter((d) => d.state !== "not_scheduled").length;
  const successCount = days.filter((d) => d.state === "done").length;
  const remainingScheduled = days.filter((d) => d.state === "pending").length;
  const percentage = successThreshold > 0 ? (successCount / successThreshold) * 100 : 0;

  const pacing: WeeklyProgress["pacing"] =
    successCount >= successThreshold
      ? "green"
      : successCount + remainingScheduled < successThreshold
        ? "red"
        : "amber";

  return { days, weekScheduledCount, successCount, successThreshold, remainingScheduled, percentage, pacing };
}
