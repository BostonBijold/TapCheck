"use client";

import AppIcon from "@/components/AppIcon";
import { PACING, completionBarColor, daySegmentStyle, type TaskStats } from "@/components/reports/shared";

// Renamed from AnalyticsContent.tsx's private inline `TaskRow` specifically
// to end its naming collision with `components/TaskRow.tsx` (the Tasks
// page's own per-day row) — a different component entirely, previously
// flagged as "not to be confused with" in docs/features/analytics.md.
export default function TaskStatRow({ task }: { task: TaskStats }) {
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
  const weekMissedCount = wp?.days.filter((d) => d.state === "missed").length ?? task.missedCount;
  const weekUnloggedCount = wp?.days.filter((d) => d.state === "unlogged").length ?? task.unloggedCount;

  return (
    <div id={`task-${task._id}`} className="py-3.5 border-b border-border last:border-0">
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
