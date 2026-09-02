"use client";

import { barColor, dayLabel, type DailyStat } from "@/components/reports/shared";

export default function TaskListChart({
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
