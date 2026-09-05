"use client";

import { barColor, dayLabel, type DailyStat } from "@/components/reports/shared";

interface Props {
  daily: DailyStat[];
  totalTasks: number;
  today: string;
}

// Desktop-grid variant of components/reports/TaskListChart.tsx — same
// underlying per-day math (barColor, dayLabel) so the two visuals can
// never disagree on what a bar means, but always shows day labels (a grid
// card has room for them regardless of the 7d/30d toggle, unlike mobile's
// showLabels-only-in-7d-view space constraint) and a slightly taller bar
// area to fill a wider card.
export default function TaskListMiniChart({ daily, totalTasks, today }: Props) {
  return (
    <div className="flex items-end gap-1" style={{ height: 60 }}>
      {daily.map((d) => {
        const isFuture = d.date > today;
        const isToday = d.date === today;
        const pct = totalTasks > 0 ? d.doneCount / totalTasks : 0;
        const heightPct = d.loggedCount > 0 ? Math.max(6, Math.round(pct * 100)) : 6;
        const color = barColor(pct, d.loggedCount > 0);
        return (
          <div key={d.date} className="flex flex-col items-center gap-1 flex-1">
            <div className="w-full flex items-end" style={{ height: 40 }}>
              {isFuture ? (
                <div className="w-full rounded-sm border border-dashed border-dim" style={{ height: "18%", minHeight: 3 }} />
              ) : (
                <div
                  className="w-full rounded-sm"
                  style={{ height: `${heightPct}%`, backgroundColor: color, minHeight: 3, transition: "height 0.4s ease" }}
                />
              )}
            </div>
            <span className={`font-mono text-[9px] ${isToday ? "text-gold font-semibold" : "text-dim"}`}>
              {dayLabel(d.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
