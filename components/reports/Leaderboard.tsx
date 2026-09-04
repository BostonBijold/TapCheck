"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { completionBarColor } from "@/components/reports/shared";

interface RankedRow {
  userId: string;
  name: string;
  doneCount: number;
  missedCount: number;
  onTimeCount: number;
  lateCount: number;
  engaged: number;
  completionRate: number;
}

interface InsufficientRow {
  userId: string;
  name: string;
  doneCount: number;
  missedCount: number;
}

interface LeaderboardData {
  ranked: RankedRow[];
  insufficientData: InsufficientRow[];
}

// Manager-only team leaderboard — ranked by completion rate over tasks
// each person actually logged this window (see GET /api/reports/leaderboard
// and docs/features/reports.md's "Reports v2" addendum, Story 1/2). Rendered
// above the existing Task List Performance section in ManagerOverview.tsx;
// never shown on EmployeeOverview.tsx.
export default function Leaderboard({ days }: { days: 7 | 30 }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const localDate = new Date().toLocaleDateString("en-CA");
    fetch(`/api/reports/leaderboard?days=${days}&localDate=${localDate}`)
      .then((r) => r.json())
      .then((d: LeaderboardData) => {
        setData(d);
        setLoading(false);
      });
  }, [days]);

  if (loading) {
    return <div className="bg-card rounded-card h-24 animate-pulse mb-8" />;
  }
  if (!data || (data.ranked.length === 0 && data.insufficientData.length === 0)) return null;

  return (
    <section className="mb-8">
      <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
        Team Leaderboard
      </p>
      <div className="bg-card rounded-card overflow-hidden divide-y divide-border">
        {data.ranked.map((row, i) => {
          const isExpanded = expanded === row.userId;
          const pct = Math.round(row.completionRate * 100);
          return (
            <div key={row.userId}>
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : row.userId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <span className="font-mono text-[11px] text-dim w-4 flex-shrink-0">{i + 1}</span>
                <span className="flex-1 font-body text-sm text-text truncate">{row.name}</span>
                <span className="font-mono text-[11px] text-dim flex-shrink-0">
                  {row.doneCount}/{row.engaged}
                </span>
                <span
                  className="font-mono text-sm font-semibold w-11 text-right flex-shrink-0"
                  style={{ color: completionBarColor(row.completionRate) }}
                >
                  {pct}%
                </span>
                {isExpanded ? (
                  <ChevronDown size={14} className="text-dim flex-shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-dim flex-shrink-0" />
                )}
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 flex items-center gap-4 pl-11">
                  <span className="font-mono text-[10px] text-olive">{row.onTimeCount} on-time</span>
                  <span className="font-mono text-[10px] text-amber">{row.lateCount} late</span>
                  <span className="font-mono text-[10px] text-burgundy-light">{row.missedCount} missed</span>
                </div>
              )}
            </div>
          );
        })}
        {data.insufficientData.map((row) => (
          <div key={row.userId} className="flex items-center gap-3 px-4 py-3 opacity-50">
            <span className="w-4 flex-shrink-0" />
            <span className="flex-1 font-body text-sm text-text truncate">{row.name}</span>
            <span className="font-mono text-[10px] text-dim">Not enough data</span>
          </div>
        ))}
      </div>
    </section>
  );
}
