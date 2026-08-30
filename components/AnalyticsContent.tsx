"use client";

import { useState, useEffect } from "react";
import AppIcon from "@/components/AppIcon";
import type { WeeklyProgress, DayBreakdown } from "@/lib/task-progress";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyStat {
  date: string;
  doneCount: number;
  missedCount: number;
  restCount: number;
  loggedCount: number;
  projectedMins: number;
  actualMins: number;
}

interface TaskListStats {
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

interface TaskStats {
  _id: string;
  name: string;
  icon: string;
  taskListId: string;
  taskListName: string;
  projectedMinutes: number;
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

interface AnalyticsData {
  dates: string[];
  days: number;
  today: string; // YYYY-MM-DD — the 7-day view's dates[] can include days after this (later this week)
  taskLists: TaskListStats[];
  tasks: TaskStats[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Convert UTC minutes-since-midnight to a local time string.
// startedAt is stored in UTC; the browser knows the user's local offset.
function utcMinsToLocalTime(avgMinutesUtc: number): string {
  const d = new Date();
  d.setUTCHours(Math.floor(avgMinutesUtc / 60) % 24, avgMinutesUtc % 60, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function dayLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" });
}

function barColor(pct: number, hasLogs: boolean): string {
  if (!hasLogs) return "#dbe2ea";
  if (pct >= 1)    return "#3582c1"; // gold — perfect day
  if (pct >= 0.75) return "#1f63b6"; // new olive
  if (pct >= 0.5)  return "#d97706";
  if (pct > 0)     return "#78716c";
  return "#dc2626";
}

function completionBarColor(pct: number): string {
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
function daySegmentStyle(day: DayBreakdown): { background: string; border?: string } {
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

const PACING: Record<WeeklyProgress["pacing"], { color: string; label: string }> = {
  green: { color: "#1f63b6", label: "on track" },
  amber: { color: "#d97706", label: "in reach" },
  red: { color: "#ef4444", label: "will miss" },
};

// ── Bar chart ─────────────────────────────────────────────────────────────────

function TaskListChart({
  daily,
  totalTasks,
  showLabels,
  today,
}: {
  daily: DailyStat[];
  totalTasks: number;
  showLabels: boolean;
  today: string;
}) {
  return (
    <div className="flex items-end gap-1" style={{ height: showLabels ? 64 : 52 }}>
      {daily.map((d) => {
        // Only the fixed 7-day calendar week can contain a date after
        // `today` (later this week) — the 30-day trailing window never does.
        const isFuture = d.date > today;
        const isToday = d.date === today;
        const pct = totalTasks > 0 ? d.doneCount / totalTasks : 0;
        const heightPct = d.loggedCount > 0 ? Math.max(6, Math.round(pct * 100)) : 6;
        const color = barColor(pct, d.loggedCount > 0);
        return (
          <div key={d.date} className="flex flex-col items-center gap-0.5 flex-1">
            <div className="w-full flex items-end" style={{ height: showLabels ? 48 : 44 }}>
              {isFuture ? (
                // Pending — hasn't happened yet, distinct from a past/today
                // day that simply has no logs (which gets a solid dark bar).
                <div
                  className="w-full rounded-sm border border-dashed border-dim"
                  style={{ height: "18%", minHeight: 3 }}
                />
              ) : (
                <div
                  className="w-full rounded-sm"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: color,
                    minHeight: 3,
                    transition: "height 0.4s ease",
                  }}
                />
              )}
            </div>
            {showLabels && (
              <div className="flex flex-col items-center gap-0.5">
                <span className={`font-mono text-[9px] ${isToday ? "text-gold font-semibold" : "text-dim"}`}>
                  {dayLabel(d.date)}
                </span>
                {isToday && <span className="w-[3px] h-[3px] rounded-full bg-gold" />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({ task }: { task: TaskStats }) {
  const wp = task.weeklyProgress;
  const pct = task.completionRate;
  const pctDisplay = Math.round(pct * 100);
  const isCheckbox = task.taskType === "checkbox";
  const isStopwatch = task.taskType === "stopwatch";
  const varianceColor =
    task.avgVariance === null ? "text-dim"
    : task.avgVariance > 5   ? "text-tobacco"
    : task.avgVariance < -5  ? "text-gold"
    : "text-dim";

  // 7-day view: counts come from the schedule-aware weekly breakdown (a
  // stray log on a not_scheduled day, or a not_scheduled day itself, never
  // shows up here) rather than the unscoped fields used by the 30-day
  // fallback below. Every chip on the count line gets its own label so the
  // numbers are self-describing without needing the day-strip's colors —
  // overtimeCount is a subset of doneCount (a done day that ran over
  // target), shown as its own chip rather than silently folded in; missed
  // and unlogged are kept as separate chips too, matching how the strip
  // already tells them apart visually.
  const weekDoneCount = wp?.days.filter((d) => d.state === "done").length ?? task.doneCount;
  const weekOvertimeCount = wp?.days.filter((d) => d.state === "done" && d.timing === "amber").length ?? 0;
  const weekRestCount = wp?.days.filter((d) => d.state === "rest").length ?? task.restCount;
  const weekMissedCount = wp?.days.filter((d) => d.state === "missed").length ?? task.missedCount;
  const weekUnloggedCount = wp?.days.filter((d) => d.state === "unlogged").length ?? task.unloggedCount;

  return (
    <div className="py-3.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-5 flex items-center justify-center flex-shrink-0">
          <AppIcon name={task.icon} size={14} strokeWidth={1.75} className="text-muted" />
        </div>
        <span className="flex-1 font-body text-sm text-text leading-tight">{task.name}</span>
        {!isCheckbox && !isStopwatch && (
          <span className="font-mono text-[10px] text-dim flex-shrink-0">{task.projectedMinutes}m proj</span>
        )}
        {isStopwatch && task.avgActualMins !== null && (
          <span className="font-mono text-[10px] text-muted flex-shrink-0">{task.avgActualMins}m avg</span>
        )}
      </div>

      <div className="flex items-center gap-3 pl-7 mb-2 flex-wrap">
        <span className="font-mono text-xs text-olive">{weekDoneCount} done</span>
        {weekOvertimeCount > 0 && (
          <span className="font-mono text-xs text-amber">{weekOvertimeCount} overtime</span>
        )}
        {weekRestCount > 0 && (
          <span className="font-mono text-xs text-blue-muted">{weekRestCount} rest</span>
        )}
        {weekMissedCount > 0 && (
          <span className="font-mono text-xs text-burgundy-light">{weekMissedCount} missed</span>
        )}
        {weekUnloggedCount > 0 && (
          <span className="font-mono text-xs text-dim">{weekUnloggedCount} unlogged</span>
        )}
        {!isCheckbox && !isStopwatch && task.avgActualMins !== null && (
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <span className="font-mono text-xs text-text">{task.avgActualMins}m avg</span>
            {task.avgVariance !== null && task.avgVariance !== 0 && (
              <span className={`font-mono text-xs font-medium ${varianceColor}`}>
                {task.avgVariance > 0 ? `+${task.avgVariance}m` : `${task.avgVariance}m`}
              </span>
            )}
          </div>
        )}
      </div>

      {wp ? (
        <div className="pl-7">
          <div className="flex items-center gap-2 mb-1">
            {wp.days.map((d) => {
              const { background, border } = daySegmentStyle(d);
              return (
                <div
                  key={d.date}
                  className="flex-1 h-2.5 rounded-sm flex items-center justify-center leading-none"
                  style={{ backgroundColor: background, border }}
                >
                  {d.state === "missed" && (
                    <span className="font-mono text-[7px] text-burgundy-light">✕</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-medium" style={{ color: PACING[wp.pacing].color }}>
              {PACING[wp.pacing].label}
            </span>
            <span className="font-mono text-[9px] text-dim ml-auto">
              {wp.successCount} of {wp.successThreshold}
            </span>
            <span className="font-mono text-[10px] font-medium" style={{ color: PACING[wp.pacing].color }}>
              {Math.round(wp.percentage)}%
            </span>
          </div>
        </div>
      ) : (
        <div className="pl-7">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pctDisplay}%`,
                  backgroundColor: completionBarColor(pct),
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <span className="font-mono text-[10px] w-8 text-right flex-shrink-0" style={{ color: completionBarColor(pct) }}>
              {task.engagedDays > 0 ? `${pctDisplay}%` : "—"}
            </span>
          </div>
          <p className="font-mono text-[9px] text-dim mt-1">
            {task.engagedDays} of {task.totalDays} days logged
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AnalyticsContent() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const localDate = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
    fetch(`/api/analytics?days=${days}&localDate=${localDate}`)
      .then((r) => r.json())
      .then((d: AnalyticsData) => {
        setData(d);
        setLoading(false);
      });
  }, [days]);

  const tasksByList = data
    ? data.taskLists.map((tl) => ({
        taskList: tl,
        tasks: data.tasks.filter((t) => t.taskListId === tl._id),
      }))
    : [];

  const dateRangeLabel =
    data && data.dates.length > 1
      ? `${new Date(data.dates[0] + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(data.dates[data.dates.length - 1] + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "";

  return (
    <>
      {/* Title + day toggle */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-heading text-xl text-text">Analytics</h2>
          {dateRangeLabel && (
            <p className="font-mono text-dim text-[10px] mt-0.5 tracking-wide">{dateRangeLabel}</p>
          )}
        </div>
        <div className="flex bg-card border border-border rounded-pill p-0.5">
          <button
            onClick={() => setDays(7)}
            className={`font-mono text-xs px-3 py-1.5 rounded-pill transition-colors ${
              days === 7 ? "bg-olive text-text" : "text-dim hover:text-muted"
            }`}
          >
            7d
          </button>
          <button
            onClick={() => setDays(30)}
            className={`font-mono text-xs px-3 py-1.5 rounded-pill transition-colors ${
              days === 30 ? "bg-olive text-text" : "text-dim hover:text-muted"
            }`}
          >
            30d
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card rounded-card h-32 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Task List Performance */}
          <section className="mb-10">
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
              Task List Performance
            </p>
            <div className="space-y-3">
              {data.taskLists.filter((tl) => tl.totalTasks > 0).map((taskList) => {
                const activeDays = taskList.daily.filter((d) => d.loggedCount > 0).length;
                const completionPct = Math.round(taskList.avgCompletionRate * 100);
                const variance = taskList.avgActualMins - taskList.totalProjectedMins;

                return (
                  <div key={taskList._id} className="bg-card rounded-card px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-heading text-base text-text">{taskList.name}</h3>
                      <span
                        className="font-mono text-lg font-semibold flex-shrink-0 ml-3"
                        style={{ color: completionBarColor(taskList.avgCompletionRate) }}
                      >
                        {completionPct}%
                      </span>
                    </div>

                    {taskList.avgStartMinutesUtc !== null && taskList.startTimeSampleSize >= 2 && (
                      <p className="font-mono text-[10px] text-dim mb-2">
                        Usually starts{" "}
                        <span className="text-muted">
                          ~{utcMinsToLocalTime(taskList.avgStartMinutesUtc)}
                        </span>
                        <span className="text-dim ml-1">
                          · {taskList.startTimeSampleSize}d sample
                        </span>
                      </p>
                    )}

                    <div className="flex items-center gap-2 mb-4">
                      <span className="font-mono text-xs text-dim">
                        {fmtMins(taskList.totalProjectedMins)} projected
                      </span>
                      <span className="font-mono text-dim text-xs">→</span>
                      {taskList.avgActualMins > 0 ? (
                        <>
                          <span className="font-mono text-xs text-text">
                            {fmtMins(taskList.avgActualMins)} actual avg
                          </span>
                          {variance !== 0 && (
                            <span
                              className="font-mono text-[10px] ml-auto font-medium"
                              style={{ color: variance > 0 ? "#78716c" : "#3582c1" }}
                            >
                              {variance > 0 ? `+${fmtMins(variance)}` : `-${fmtMins(Math.abs(variance))}`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="font-mono text-xs text-dim">no data yet</span>
                      )}
                    </div>

                    <TaskListChart
                      daily={taskList.daily}
                      totalTasks={taskList.totalTasks}
                      showLabels={days === 7}
                      today={data.today}
                    />

                    {days === 30 && (
                      <p className="font-mono text-[9px] text-dim mt-1.5">
                        {dateRangeLabel} · active {activeDays} of {days} days
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Task Breakdown */}
          <section>
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
              Task Breakdown
            </p>
            {tasksByList.filter(({ tasks }) => tasks.length > 0).map(({ taskList, tasks }) => (
              <div key={taskList._id} className="mb-6">
                <p className="font-mono text-[10px] text-muted uppercase tracking-widest mb-2">
                  {taskList.name}
                </p>
                <div className="bg-card rounded-card px-4">
                  {tasks.map((task) => (
                    <TaskRow key={task._id} task={task} />
                  ))}
                </div>
              </div>
            ))}
            {data.tasks.length === 0 && (
              <div className="bg-card rounded-card px-6 py-10 text-center">
                <p className="font-mono text-dim text-sm">
                  Log some tasks to see task data here.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
