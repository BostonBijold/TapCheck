"use client";

import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import type { ReportsData } from "@/components/reports/shared";

// Manager-only exception surfacing — two callouts sourced entirely from
// the ManagerOverview.tsx's already-fetched GET /api/reports data, no new
// endpoint. See docs/features/reports.md's "Reports v2" addendum, Stories
// 3 & 4. Each entry is a shortcut into content already further down the
// same page (scrollIntoView onto an id ManagerOverview.tsx/TaskStatRow.tsx
// stamp onto their own cards/rows), not a new destination.
export default function ExceptionCallouts({ data }: { data: ReportsData }) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Story 3 — worst-performing task lists this window.
  const worstLists = data.taskLists
    .filter((tl) => tl.totalTasks > 0 && tl.avgCompletionRate < 0.9)
    .sort((a, b) => a.avgCompletionRate - b.avgCompletionRate)
    .slice(0, 3);

  // Story 4 — biggest variance outlier(s), needs a minimum sample size so
  // one fluke slow log on a brand-new task doesn't headline the callout.
  const varianceOutliers = data.tasks
    .filter((t) => t.engagedDays >= 3 && t.avgVariance !== null)
    .sort((a, b) => Math.abs(b.avgVariance!) - Math.abs(a.avgVariance!))
    .slice(0, 3);

  if (worstLists.length === 0 && varianceOutliers.length === 0) return null;

  return (
    <section className="mb-8 space-y-3">
      {worstLists.length > 0 && (
        <div className="bg-card rounded-card px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={13} className="text-burgundy-light" strokeWidth={2} />
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
              Needs attention
            </p>
          </div>
          <div className="space-y-1.5">
            {worstLists.map((tl) => (
              <button
                key={tl._id}
                type="button"
                onClick={() => scrollTo(`tasklist-${tl._id}`)}
                className="w-full flex items-center justify-between gap-2 text-left"
              >
                <span className="font-body text-sm text-text truncate">{tl.name}</span>
                <span className="font-mono text-xs text-burgundy-light flex-shrink-0">
                  {Math.round(tl.avgCompletionRate * 100)}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {varianceOutliers.length > 0 && (
        <div className="bg-card rounded-card px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={13} className="text-amber" strokeWidth={2} />
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
              Timing outliers
            </p>
          </div>
          <div className="space-y-1.5">
            {varianceOutliers.map((t) => {
              const running = t.avgVariance! > 0;
              return (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => scrollTo(`task-${t._id}`)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <span className="font-body text-sm text-text truncate">{t.name}</span>
                  <span
                    className={`font-mono text-xs flex-shrink-0 flex items-center gap-1 ${
                      running ? "text-tobacco" : "text-gold"
                    }`}
                  >
                    {running ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {running ? `+${t.avgVariance}m long` : `${t.avgVariance}m fast`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
