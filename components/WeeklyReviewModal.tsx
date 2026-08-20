"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { weekStartDate, isoWeekNumber } from "@/lib/virtue-dates";

interface Score {
  virtueId: string;
  virtueName: string;
  yes: number;
  total: number;
  pct: number;
}

interface Props {
  date: string; // selectedDate (must be Sunday)
  currentVirtue: { name: string; displayName: string; order: number } | null;
  virtueCount: number;
  onDone: (actualMinutes: number) => void;
  onClose: () => void;
}

export default function WeeklyReviewModal({ date, currentVirtue, virtueCount, onDone, onClose }: Props) {
  const [scores, setScores] = useState<Score[]>([]);
  const [checkInDays, setCheckInDays] = useState(0);
  const [loading, setLoading] = useState(true);

  const ws = weekStartDate(new Date(date + "T12:00:00"));

  // Next week's virtue
  const nextWeekNum = isoWeekNumber(new Date(date + "T12:00:00")) + 1;
  const nextVirtueOrder = virtueCount > 0 ? ((nextWeekNum - 1) % virtueCount) + 1 : 1;

  useEffect(() => {
    fetch(`/api/virtue-checkins?weekStart=${ws}`)
      .then((r) => r.json())
      .then((checkIns: Array<{ answers: Array<{ virtueId: string; virtueName: string; answer: string }> }>) => {
        const tally: Record<string, { name: string; yes: number; total: number }> = {};
        for (const ci of checkIns) {
          for (const ans of ci.answers) {
            if (!tally[ans.virtueId]) tally[ans.virtueId] = { name: ans.virtueName, yes: 0, total: 0 };
            tally[ans.virtueId].total++;
            if (ans.answer === "yes") tally[ans.virtueId].yes++;
          }
        }
        const computed = Object.entries(tally).map(([id, v]) => ({
          virtueId: id,
          virtueName: v.name,
          yes: v.yes,
          total: v.total,
          pct: v.total > 0 ? Math.round((v.yes / v.total) * 100) : 0,
        })).sort((a, b) => b.pct - a.pct);
        setScores(computed);
        setCheckInDays(checkIns.length);
        setLoading(false);
      });
  }, [ws]);

  const strongest = scores[0] ?? null;
  const needsWork = scores[scores.length - 1] ?? null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-mobile">
        <div className="bg-card rounded-t-modal border-t border-border flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex-shrink-0 px-5 pt-4 pb-4 border-b border-border">
            <div className="flex justify-center mb-3">
              <div className="w-8 h-1 rounded-full bg-border-light" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-gold mb-1">
                  Weekly Review
                </p>
                <h2 className="font-heading text-lg italic text-text">
                  {currentVirtue?.displayName ?? "This Week"}
                </h2>
                <p className="font-mono text-[10px] text-dim mt-1">
                  {checkInDays}/7 days checked in
                </p>
              </div>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim flex-shrink-0">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {loading ? (
              <p className="text-dim font-mono text-xs text-center py-8">Loading summary…</p>
            ) : scores.length === 0 ? (
              <p className="text-dim font-mono text-xs text-center py-8">
                No check-ins recorded this week.
              </p>
            ) : (
              <>
                {/* Highlights */}
                {strongest && needsWork && strongest.virtueId !== needsWork.virtueId && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-olive/10 border border-olive/30 rounded-card px-3 py-3">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-olive mb-1">
                        Strongest
                      </p>
                      <p className="font-body text-sm text-text font-medium">{strongest.virtueName}</p>
                      <p className="font-mono text-lg text-olive font-bold mt-1">{strongest.pct}%</p>
                    </div>
                    <div className="bg-tobacco/10 border border-tobacco/30 rounded-card px-3 py-3">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-tobacco mb-1">
                        Needs Work
                      </p>
                      <p className="font-body text-sm text-text font-medium">{needsWork.virtueName}</p>
                      <p className="font-mono text-lg text-tobacco font-bold mt-1">{needsWork.pct}%</p>
                    </div>
                  </div>
                )}

                {/* Virtue score table */}
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-dim mb-2">
                    All Virtues
                  </p>
                  <div className="bg-bg rounded-card divide-y divide-border overflow-hidden">
                    {scores.map((s) => (
                      <div key={s.virtueId} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="flex-1 font-body text-sm text-text truncate">{s.virtueName}</span>
                        <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden flex-shrink-0">
                          <div
                            className={`h-full rounded-full ${s.pct >= 70 ? "bg-olive" : s.pct >= 40 ? "bg-amber" : "bg-burgundy"}`}
                            style={{ width: `${s.pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-muted w-10 text-right flex-shrink-0">
                          {s.yes}/{s.total}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Next week preview */}
                <div className="bg-card border border-gold/20 rounded-card px-4 py-3">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-gold mb-1">
                    Next Week
                  </p>
                  <p className="font-body text-sm text-text">
                    Virtue #{nextVirtueOrder} begins Monday
                  </p>
                  <p className="font-mono text-[10px] text-dim mt-0.5">
                    Check the Virtues tab for details
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-4 py-4 border-t border-border">
            <button
              onClick={() => onDone(10)}
              className="w-full py-4 rounded-card bg-olive text-text font-body font-semibold text-sm"
            >
              Got it. Start next week.
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
