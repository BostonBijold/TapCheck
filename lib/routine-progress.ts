// Pure weekly-progress math — safe to import from client or server code.
// Shared by StreakDots (per-row dot strip) and the Analytics Habit Breakdown
// (segmented bar + pacing verdict) so the two never diverge.

export type DayState = "done" | "rest" | "missed" | "pending" | "not_scheduled";

export interface DayBreakdown {
  date: string;
  state: DayState;
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

// logsByDate: this item's log state for each date it has one, keyed by
// YYYY-MM-DD. A past scheduled day with no entry here reads as "missed" for
// this calculation only — never write a synthetic log to represent that.
export function computeWeeklyProgress(
  scheduledDays: number[],
  successThreshold: number,
  logsByDate: Record<string, "done" | "missed" | "rest" | undefined>,
  weekDates: string[], // Sunday→Saturday, from calendarWeekDates
  today: string
): WeeklyProgress {
  const scheduledSet = new Set(scheduledDays);

  const days: DayBreakdown[] = weekDates.map((date) => {
    const dow = new Date(date + "T12:00:00").getDay();
    // Not expected this day at all — excluded from everything below,
    // regardless of whether a log happens to exist for it (schedule wins
    // over log presence; an off-schedule log is invisible to this math,
    // not a bonus).
    if (!scheduledSet.has(dow)) return { date, state: "not_scheduled" };
    if (date > today) return { date, state: "pending" };
    const log = logsByDate[date];
    if (log === "done" || log === "rest") return { date, state: log };
    if (log === "missed") return { date, state: "missed" };
    // No log at all: today is still open (unresolved, not yet a miss) —
    // only a *strictly past* day with nothing logged defaults to missed.
    if (date === today) return { date, state: "pending" };
    return { date, state: "missed" };
  });

  const weekScheduledCount = days.filter((d) => d.state !== "not_scheduled").length;
  const successCount = days.filter((d) => d.state === "done" || d.state === "rest").length;
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
