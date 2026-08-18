"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import VirtueCheckInModal from "@/components/VirtueCheckInModal";
import WeeklyReviewModal from "@/components/WeeklyReviewModal";
import VirtuesHowItWorks from "@/components/VirtuesHowItWorks";

interface VirtueRow {
  virtueId: string;
  virtueName: string;
  slug: string;
  order: number;
  dots: Array<"yes" | "no" | null>;
  yes: number;
  total: number;
  pct: number;
}

interface WindowSummary {
  days: number;
  dates: string[];
  checkInDays: number;
  overallPct: number;
  strongest: { virtueId: string; virtueName: string; pct: number } | null;
  needsWork: { virtueId: string; virtueName: string; pct: number } | null;
  virtues: VirtueRow[];
}

const DOT_COLOR: Record<"yes" | "no", string> = { yes: "bg-olive", no: "bg-burgundy" };

interface CurrentVirtue {
  name: string;
  displayName: string;
  tagline: string;
  order: number;
  slug: string;
}

interface Props {
  userName: string;
  today: string;
  skipAuth: boolean;
  currentVirtue: CurrentVirtue | null;
  checkinItemId: string | null;
  weeklyReviewItemId: string | null;
  initialMode: "checkin" | "weekly" | null;
  initialDate: string | null;
  returnTo: string | null;
  hasCheckedInToday: boolean;
  virtueWalkthroughSeen: boolean;
}

function fmtDateRange(dates: string[]) {
  if (dates.length < 2) return "";
  const fmt = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
}

export default function ReviewView({
  userName, today, skipAuth,
  currentVirtue, checkinItemId, weeklyReviewItemId,
  initialMode, initialDate, returnTo, hasCheckedInToday,
  virtueWalkthroughSeen,
}: Props) {
  const router = useRouter();
  const [days, setDays] = useState<7 | 30>(7);
  const [summary, setSummary] = useState<WindowSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"history" | "checkin" | "weekly">(initialMode ?? "history");
  const [checkedInToday, setCheckedInToday] = useState(hasCheckedInToday);

  const activeDate = initialDate ?? today;
  const isSunday = new Date(today + "T12:00:00").getDay() === 0;

  const loadSummary = useCallback((window: 7 | 30) => {
    setLoading(true);
    fetch(`/api/virtue-checkins?days=${window}&localDate=${today}`)
      .then((r) => r.json())
      .then((data: WindowSummary) => {
        setSummary(data);
        setLoading(false);
      });
  }, [today]);

  useEffect(() => { loadSummary(days); }, [days, loadSummary]);

  const markDone = useCallback(
    async (itemId: string | null, date: string, actualMinutes: number) => {
      if (!itemId) return;
      await fetch("/api/routine-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineItemId: itemId, date, state: "done", actualMinutes }),
      });
    },
    []
  );

  const exitFlow = useCallback(() => {
    setMode("history");
    loadSummary(days);
    if (returnTo === "routines") router.push("/routines");
    else router.replace("/virtues");
  }, [returnTo, router, loadSummary, days]);

  return (
    <div className="min-h-dvh bg-bg">
      {mode === "checkin" && (
        <VirtueCheckInModal
          thisWeekVirtue={currentVirtue}
          date={activeDate}
          onDone={async (mins) => {
            await markDone(checkinItemId, activeDate, mins);
            setCheckedInToday(true);
            exitFlow();
          }}
          onClose={() => { setMode("history"); router.replace("/virtues"); }}
        />
      )}

      {mode === "weekly" && (
        <WeeklyReviewModal
          date={activeDate}
          currentVirtue={currentVirtue}
          onDone={async (mins) => {
            await markDone(weeklyReviewItemId, activeDate, mins);
            exitFlow();
          }}
          onClose={() => { setMode("history"); router.replace("/virtues"); }}
        />
      )}

      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        {/* This week's virtue — same focus banner as Routines */}
        {currentVirtue && (
          <Link
            href={`/virtues/${currentVirtue.slug}`}
            className="w-full text-left bg-card border border-gold/25 rounded-card px-4 py-3 mt-6 mb-4 hover:bg-card-hover active:opacity-90 transition-colors flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-widest text-gold mb-0.5">
                This Week&apos;s Virtue
              </p>
              <p className="font-heading text-base italic text-text leading-tight truncate">
                {currentVirtue.displayName}
              </p>
            </div>
            <span className="text-gold/60 text-sm flex-shrink-0">›</span>
          </Link>
        )}

        {/* Page title */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h1 className="font-heading text-2xl italic text-text">
              Virtues
            </h1>
            <VirtuesHowItWorks autoOpen={!virtueWalkthroughSeen} iconOnly />
          </div>
          {!virtueWalkthroughSeen && (
            <p className="font-mono text-[10px] text-dim mt-2">
              Daily YES / NO, tap a virtue to read more
            </p>
          )}
        </div>

        {/* Today's Check-in — always available unless already submitted */}
        <button
          onClick={() => !checkedInToday && setMode("checkin")}
          disabled={checkedInToday}
          className={`w-full mb-3 py-4 rounded-card font-body font-semibold text-sm transition-colors min-h-[48px] ${
            checkedInToday
              ? "bg-card border border-olive/30 text-olive cursor-default"
              : "bg-card border border-gold/40 text-gold hover:bg-card-hover"
          }`}
        >
          {checkedInToday ? "✓ Checked in today" : "🧭 Today's Check-in"}
        </button>

        {/* Start Review — unlocked Sundays only */}
        <button
          onClick={() => isSunday && setMode("weekly")}
          disabled={!isSunday}
          className={`w-full mb-6 py-4 rounded-card font-body font-semibold text-sm transition-colors min-h-[48px] ${
            isSunday
              ? "bg-gold text-bg hover:opacity-90"
              : "bg-card border border-border text-dim cursor-not-allowed"
          }`}
        >
          {isSunday ? "☰ Start This Week's Review" : "🔒 Review unlocks on Sunday"}
        </button>

        {/* Window toggle + summary */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-lg text-text">
              {days === 7 ? "This Week" : "This Month"}
            </h2>
            {summary && (
              <p className="font-mono text-dim text-[10px] mt-0.5 tracking-wide">
                {fmtDateRange(summary.dates)}
              </p>
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
          <p className="text-dim font-mono text-xs text-center py-16">Loading…</p>
        )}

        {!loading && summary && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <span className="font-mono text-base font-bold text-text">{summary.overallPct}%</span>
              <span className="font-mono text-[10px] text-dim">
                {summary.checkInDays}/{summary.days} days checked in
              </span>
              {summary.strongest && (
                <span className="font-mono text-[9px] text-olive ml-auto">
                  ↑ {summary.strongest.virtueName}
                </span>
              )}
              {summary.needsWork && summary.needsWork.virtueId !== summary.strongest?.virtueId && (
                <span className="font-mono text-[9px] text-tobacco">
                  ↓ {summary.needsWork.virtueName}
                </span>
              )}
            </div>

            {summary.checkInDays === 0 && (
              <p className="font-mono text-[10px] text-dim mb-4">
                Complete the Virtue Check-in in your Evening Routine to start tracking.
              </p>
            )}

            {/* One card per virtue — tap to read more */}
            <div className="space-y-2">
              {summary.virtues.map((v) => (
                <Link
                  key={v.virtueId}
                  href={`/virtues/${v.slug}`}
                  className="flex items-center gap-3 bg-card rounded-card border border-border px-4 py-3.5 hover:bg-card-hover transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="font-body text-sm text-text truncate">{v.virtueName}</span>
                      <span className="font-mono text-xs font-bold text-dim flex-shrink-0">
                        {v.total > 0 ? `${v.pct}%` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {v.dots.map((d, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d ? DOT_COLOR[d] : "bg-border"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-dim text-xs flex-shrink-0">›</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
