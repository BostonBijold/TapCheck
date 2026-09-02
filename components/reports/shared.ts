import type { WeeklyProgress, DayBreakdown } from "@/lib/task-progress";

// Shared types + pure helpers for the Reports Overview tabs (Manager and
// Employee variants) — split out so neither copy drifts from the other.

export interface DailyStat {
  date: string;
  doneCount: number;
  missedCount: number;
  restCount: number;
  loggedCount: number;
  projectedMins: number;
  actualMins: number;
}

export interface TaskListStats {
  _id: string;
  name: string;
  totalTasks: number;
  daily: DailyStat[];
  avgCompletionRate: number;
  avgActualMins: number;
  totalProjectedMins: number;
  avgStartMinutesUtc: number | null;
  startTimeSampleSize: number;
}

export interface TaskStats {
  _id: string;
  name: string;
  icon: string;
  taskListId: string;
  taskListName: string;
  projectedMinutes: number;
  daily: Array<{ date: string; state: "done" | "missed" | "rest" | null; actualMinutes: number | null }>;
  doneCount: number;
  missedCount: number;
  restCount: number;
  unloggedCount: number;
  avgActualMins: number | null;
  avgVariance: number | null;
  completionRate: number;
  engagedDays: number;
  totalDays: number;
  taskType: string;
  // Only present for the 7-day (fixed calendar week) view — a weekly
  // threshold has no clean meaning over a 30-day trailing window.
  weeklyProgress?: WeeklyProgress;
}

export interface ReportsData {
  dates: string[];
  days: number;
  today: string; // YYYY-MM-DD — the 7-day view's dates[] can include days after this (later this week)
  taskLists: TaskListStats[];
  tasks: TaskStats[];
  // Employee-only — consecutive all-clear days, see lib/streak.ts. Absent
  // (undefined) on the manager response.
  currentStreak?: number;
}

// Convert UTC minutes-since-midnight to a local time string.
// startedAt is stored in UTC; the browser knows the user's local offset.
export function utcMinsToLocalTime(avgMinutesUtc: number): string {
  const d = new Date();
  d.setUTCHours(Math.floor(avgMinutesUtc / 60) % 24, avgMinutesUtc % 60, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function dayLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" });
}

export function barColor(pct: number, hasLogs: boolean): string {
  if (!hasLogs) return "#dbe2ea";
  if (pct >= 1)    return "#3582c1"; // gold — perfect day
  if (pct >= 0.75) return "#1f63b6"; // new olive
  if (pct >= 0.5)  return "#d97706";
  if (pct > 0)     return "#78716c";
  return "#dc2626";
}

export function completionBarColor(pct: number): string {
  if (pct >= 0.8) return "#3582c1"; // gold — strong performance
  if (pct >= 0.5) return "#d97706";
  return "#dc2626";
}

// Same day-state palette as StreakDots — a segment here should read as the
// same thing a dot there does. Done is colored by timing (how close to the
// target), not a flat color — amber covers "overtime" at any severity, red
// is reserved exclusively for `missed` below, no other state ever renders
// red. Everything that isn't a solid-fill success (done or rest) is a
// hollow, no-fill box instead — border style/color carries the meaning,
// since a close-but-different fill color (the old tobacco-vs-amber problem)
// is hard to tell apart at a glance: dashed grey border = still open
// (pending), solid grey border = past and simply never logged, solid red
// border = explicitly marked missed.
export function daySegmentStyle(day: DayBreakdown): { background: string; border?: string } {
  if (day.state === "done") {
    return { background: day.timing === "amber" ? "#d97706" : "#1f63b6" };
  }
  switch (day.state) {
    case "rest": return { background: "#71717a" };
    case "missed": return { background: "transparent", border: "1px solid #ef4444" };
    case "unlogged": return { background: "transparent", border: "1px solid #94a3b8" };
    case "pending": return { background: "transparent", border: "1px dashed #94a3b8" };
    case "not_scheduled": return { background: "#dbe2ea33" };
    default: return { background: "#dbe2ea33" };
  }
}

export const PACING: Record<WeeklyProgress["pacing"], { color: string; label: string }> = {
  green: { color: "#1f63b6", label: "on track" },
  amber: { color: "#d97706", label: "in reach" },
  red: { color: "#ef4444", label: "will miss" },
};
