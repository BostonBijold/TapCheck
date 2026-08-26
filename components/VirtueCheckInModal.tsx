"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Check } from "lucide-react";
import { personalStackOrders } from "@/lib/virtue-dates";

interface Virtue {
  _id: string;
  name: string;
  displayName: string;
  tagline: string;
  order: number;
}

interface Props {
  thisWeekVirtue: { name: string; displayName: string; tagline: string; order?: number } | null;
  date: string; // YYYY-MM-DD being checked in
  onDone: (actualMinutes: number) => void;
  onClose: () => void;
}

type Answer = "yes" | "no";

export default function VirtueCheckInModal({ thisWeekVirtue, date, onDone, onClose }: Props) {
  const [allVirtues, setAllVirtues] = useState<Virtue[]>([]);
  const [stackSize, setStackSize] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/virtues").then((r) => r.json()) as Promise<Virtue[]>,
      fetch("/api/virtue-stack").then((r) => r.json()) as Promise<{ stackSize: number | null }>,
    ]).then(([virtueData, stack]) => {
      setAllVirtues(virtueData.sort((a, b) => a.order - b.order));
      setStackSize(stack.stackSize);
      setLoading(false);
    });
  }, []);

  // Progressive stacking: only the virtues within the caller's personal
  // weeks-active window appear here — never affects `thisWeekVirtue`, the
  // shared highlight shown in the header above, which stays identical for
  // every user. Falls back to the full list if stack info isn't available
  // (e.g. thisWeekVirtue.order missing) rather than blocking check-in.
  const virtues = useMemo(() => {
    if (stackSize == null || thisWeekVirtue?.order == null || allVirtues.length === 0) {
      return allVirtues;
    }
    const orders = new Set(
      personalStackOrders(thisWeekVirtue.order, stackSize, allVirtues.length)
    );
    return allVirtues.filter((v) => orders.has(v.order));
  }, [allVirtues, stackSize, thisWeekVirtue]);

  const answeredCount = Object.keys(answers).length;
  const allAnswered = !loading && virtues.length > 0 && answeredCount === virtues.length;
  const canSubmit = allAnswered && !submitting;

  const setAnswer = (id: string, answer: Answer) => {
    setAnswers((prev) => ({ ...prev, [id]: answer }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/virtue-checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          answers: virtues.map((v) => ({
            virtueId: v._id,
            virtueName: v.name,
            answer: answers[v._id],
          })),
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setError(e.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      onDone(5);
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-mobile">
        <div className="bg-card rounded-t-modal border-t border-border flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-border">
            <div className="flex justify-center mb-3">
              <div className="w-8 h-1 rounded-full bg-border-light" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-widest text-gold mb-1">
                  Daily Check-in
                </p>
                <h2 className="font-heading text-lg italic text-text leading-tight">
                  {thisWeekVirtue?.displayName ?? "Virtue Check-in"}
                </h2>
                {thisWeekVirtue?.tagline && (
                  <p className="font-mono text-[10px] text-muted mt-1">
                    {thisWeekVirtue.tagline}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-dim"
              >
                <X size={18} />
              </button>
            </div>

            {virtues.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1 bg-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-olive transition-all duration-300"
                    style={{ width: `${(answeredCount / virtues.length) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-dim tabular-nums">
                  {answeredCount}/{virtues.length} answered
                </span>
              </div>
            )}
          </div>

          {/* Virtue list */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {loading && (
              <p className="text-dim font-mono text-xs text-center py-8">Loading virtues…</p>
            )}
            <p className="font-mono text-[9px] text-dim px-2 pt-1 pb-2">
              For each virtue — did you live it today? Be honest.
            </p>
            {virtues.map((virtue) => {
              const answer = answers[virtue._id];
              return (
                <div
                  key={virtue._id}
                  className={`flex items-center gap-3 py-2.5 px-2 rounded-lg mb-1 transition-colors ${
                    answer === "yes"
                      ? "bg-olive/10"
                      : answer === "no"
                      ? "bg-burgundy/10"
                      : "bg-bg/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm text-text">{virtue.name}</p>
                    <p className="font-mono text-[9px] text-dim mt-0.5 truncate">{virtue.tagline}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setAnswer(virtue._id, "yes")}
                      className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-bold transition-colors ${
                        answer === "yes"
                          ? "bg-olive text-bg"
                          : "bg-bg text-dim border border-border hover:border-olive hover:text-olive"
                      }`}
                    >
                      YES
                    </button>
                    <button
                      onClick={() => setAnswer(virtue._id, "no")}
                      className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-bold transition-colors ${
                        answer === "no"
                          ? "bg-burgundy text-text"
                          : "bg-bg text-dim border border-border hover:border-burgundy-light hover:text-burgundy-light"
                      }`}
                    >
                      NO
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-4 py-4 border-t border-border">
            {error && (
              <p className="font-mono text-xs text-burgundy-light mb-3">{error}</p>
            )}
            {!error && (
              <p className="font-mono text-[10px] text-dim mb-3 text-center">
                {!allAnswered
                  ? `${virtues.length - answeredCount} virtue${virtues.length - answeredCount !== 1 ? "s" : ""} left to answer`
                  : `${Object.values(answers).filter((a) => a === "yes").length}/${virtues.length} virtues lived today.`}
              </p>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full py-4 rounded-card bg-gold text-bg font-body font-semibold text-sm disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
            >
              {submitting ? (
                "Saving…"
              ) : (
                <><Check size={16} /> Submit Check-in</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
