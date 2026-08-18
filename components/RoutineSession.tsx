"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronRight } from "lucide-react";
import HabitIcon from "@/components/HabitIcon";
import type { RowItem } from "@/components/RoutineItemRow";
import type { LogState } from "@/models/RoutineLog";
import { emitRoutineLogChanged } from "@/lib/routine-log-events";

interface SessionLog {
  itemId: string;
  state: LogState;
  actualMinutes: number;
}

// Subset of RoutineLogEntry (see RoutinesView) needed to resume a timer that was
// started outside this session (e.g. tapped "Start" on a single habit, then
// entered "Start Routine") and to reflect items already logged before the
// session began.
export interface ExternalLog {
  state: LogState;
  startedAt?: string;
  actualMinutes?: number;
}

interface Props {
  groupId: string;
  groupName: string;
  items: RowItem[];
  logs?: Record<string, ExternalLog>;
  today: string;
  startIndex?: number;
  onClose: () => void;
  onFinish: () => void;
}

function pad(n: number) {
  return Math.max(0, n).toString().padStart(2, "0");
}

function fmtMins(secs: number) {
  const m = Math.floor(Math.abs(secs) / 60);
  const s = Math.abs(secs) % 60;
  return `${pad(m)}:${pad(s)}`;
}

const RING_R = 70;
const RING_CIRC = 2 * Math.PI * RING_R;
const STOPWATCH_SOFT_CAP = 30 * 60;

export default function RoutineSession({ groupId, groupName, items, logs: externalLogs, today, startIndex = 0, onClose, onFinish }: Props) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [phase, setPhase] = useState<"running" | "summary">("running");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentItem = items[currentIndex];
  const isCheckbox = currentItem?.itemType === "checkbox";
  const isStopwatch = currentItem?.itemType === "stopwatch";
  const isCountdown = !isCheckbox && !isStopwatch;

  const target = isCountdown ? (currentItem?.projectedMinutes ?? 0) * 60 : 0;
  const isOver = isCountdown && target > 0 && elapsed >= target;

  // elapsed is derived from real wall-clock time, not from counting interval ticks —
  // ticks get throttled/suspended when the PWA is backgrounded or the screen locks,
  // so a naive "+1 every 1000ms" counter silently loses however long you were away.
  // baseElapsedRef = seconds banked before the current running segment started.
  // runStartRef = Date.now() when the current running segment began (null if paused).
  const baseElapsedRef = useRef(0);
  const runStartRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    if (runStartRef.current != null) {
      const delta = Math.floor((Date.now() - runStartRef.current) / 1000);
      setElapsed(baseElapsedRef.current + delta);
    }
  }, []);

  // Don't run the clock for checkbox items — there's nothing to time
  useEffect(() => {
    if (isRunning && phase === "running" && !isCheckbox) {
      runStartRef.current = Date.now();
      recompute();
      intervalRef.current = setInterval(recompute, 1000);
    } else {
      if (runStartRef.current != null) {
        baseElapsedRef.current += Math.floor((Date.now() - runStartRef.current) / 1000);
        runStartRef.current = null;
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, phase, isCheckbox, recompute]);

  // Force an immediate resync the moment the app comes back to the foreground —
  // don't wait for the next 1s tick to correct the frozen display.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") recompute();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [recompute]);

  // Move to a new item — unless it already has an in_progress log from outside
  // this session (started via the single-habit timer before "Start Routine" was
  // tapped), stamp a fresh in_progress record on the server (startedAt = now)
  // before starting its clock locally, mirroring the standalone timer's
  // handleStartTimer pattern. This is what lets closing mid-item (below) and
  // the mount-time auto-resume in RoutinesView find an accurate startedAt
  // instead of discarding progress silently.
  useEffect(() => {
    if (!currentItem) return;
    let cancelled = false;
    const item = currentItem;
    const existing = externalLogs?.[item._id];
    const isCheckboxItem = item.itemType === "checkbox";
    const isResuming = !isCheckboxItem && existing?.state === "in_progress" && !!existing.startedAt;

    // Blank the display immediately so it doesn't show the previous item's
    // leftover elapsed value while the in_progress POST (if any) is in flight.
    baseElapsedRef.current = 0;
    runStartRef.current = null;
    setElapsed(0);
    setIsRunning(false);

    (async () => {
      if (!isCheckboxItem && !isResuming) {
        // Stamp the group id too, not just startedAt — this is what lets
        // closing the app mid-item (without tapping X) resume straight back
        // into this session on reopen, instead of falling back to the
        // standalone timer. Mirrors the external API's routineGroupId param;
        // openInProgressTimer already branches on sessionGroupId either way.
        await fetch("/api/routine-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routineItemId: item._id, date: today, state: "in_progress", sessionGroupId: groupId }),
        });
        emitRoutineLogChanged();
      }
      if (cancelled) return;

      const seeded = isResuming
        ? Math.max(0, Math.floor((Date.now() - new Date(existing!.startedAt!).getTime()) / 1000))
        : 0;
      baseElapsedRef.current = seeded;
      runStartRef.current = Date.now();
      setElapsed(seeded);
      setIsRunning(true);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const saveLog = useCallback(
    async (itemId: string, state: LogState, actualMinutes: number) => {
      await fetch("/api/routine-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineItemId: itemId, date: today, state, actualMinutes }),
      });
      emitRoutineLogChanged();
    },
    [today]
  );

  const advance = useCallback(
    async (state: LogState, actualMinutes: number) => {
      if (!currentItem) return;
      const log: SessionLog = { itemId: currentItem._id, state, actualMinutes };
      setSessionLogs((prev) => [...prev, log]);
      await saveLog(currentItem._id, state, actualMinutes);

      // Skip forward past anything already logged today, from ANY source —
      // an earlier API call, a manual tap elsewhere, or this session itself —
      // not just what this session instance happens to know about locally.
      // Re-fetch rather than trust sessionLogs/externalLogs, since either can
      // be stale relative to an out-of-band completion that just happened.
      const loggedIds = new Set(sessionLogs.map((l) => l.itemId));
      loggedIds.add(currentItem._id);
      try {
        const res = await fetch(`/api/routine-logs?date=${today}`);
        if (res.ok) {
          const fresh: Array<{ routineItemId: string }> = await res.json();
          for (const l of fresh) loggedIds.add(l.routineItemId);
        }
      } catch { /* fall back to what we already know locally */ }

      let nextIndex = currentIndex + 1;
      while (nextIndex < items.length && loggedIds.has(items[nextIndex]._id)) {
        nextIndex++;
      }

      if (nextIndex < items.length) {
        setCurrentIndex(nextIndex);
      } else {
        setPhase("summary");
        setIsRunning(false);
      }
    },
    [currentItem, currentIndex, items, today, saveLog, sessionLogs]
  );

  // Closing mid-item (the X button) used to silently discard whatever the
  // current item's timer had accumulated. Now that a server-side in_progress
  // record exists for it (see the effect above), flush it as done with the
  // elapsed time actually run rather than leaving it dangling or losing it.
  const handleClose = useCallback(async () => {
    if (phase === "running" && currentItem && currentItem.itemType !== "checkbox") {
      await fetch("/api/routine-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routineItemId: currentItem._id,
          date: today,
          state: "done",
          actualMinutes: Math.max(1, Math.round(elapsed / 60)),
        }),
      });
      emitRoutineLogChanged();
    }
    onClose();
  }, [phase, currentItem, elapsed, today, onClose]);

  const handleDone = () => {
    if (isCheckbox) {
      advance("done", 0);
    } else {
      advance("done", Math.max(1, Math.round(elapsed / 60)));
    }
  };
  const handleMissed = () => advance("missed", 0);
  const handleRest = () => advance("rest", 0);

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (phase === "summary") {
    const totalActual = sessionLogs.reduce((s, l) => s + l.actualMinutes, 0);
    const timedItems = items.filter((i) => i.itemType !== "checkbox");
    const totalProjected = timedItems.reduce((s, i) => s + i.projectedMinutes, 0);
    const doneCount = sessionLogs.filter((l) => l.state === "done").length;
    const logMap = Object.fromEntries(sessionLogs.map((l) => [l.itemId, l]));

    return (
      <div className="fixed inset-0 bg-bg z-50 flex flex-col max-w-mobile mx-auto">
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="text-center pt-16 pb-10">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="font-heading text-2xl text-text">{groupName}</h2>
            <p className="font-mono text-olive text-sm mt-1 tracking-wide">Complete</p>
            <div className="flex justify-center gap-10 mt-8">
              <div>
                <p className="font-mono text-2xl text-text">{totalActual}m</p>
                <p className="font-mono text-dim text-[10px] uppercase tracking-widest mt-1">actual</p>
              </div>
              {totalProjected > 0 && (
                <div>
                  <p className="font-mono text-2xl text-muted">{totalProjected}m</p>
                  <p className="font-mono text-dim text-[10px] uppercase tracking-widest mt-1">projected</p>
                </div>
              )}
              <div>
                <p className="font-mono text-2xl text-text">{doneCount}/{items.length}</p>
                <p className="font-mono text-dim text-[10px] uppercase tracking-widest mt-1">completed</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-card overflow-hidden divide-y divide-border">
            {items.map((item) => {
              const log = logMap[item._id];
              if (!log) return null;
              const isItemCheckbox = item.itemType === "checkbox";
              const isItemStopwatch = item.itemType === "stopwatch";
              const variance =
                log.state === "done" && !isItemCheckbox && !isItemStopwatch
                  ? log.actualMinutes - item.projectedMinutes
                  : null;
              return (
                <div key={item._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 flex items-center justify-center flex-shrink-0">
                    <HabitIcon name={item.icon} size={16} className="text-muted" />
                  </div>
                  <span className="flex-1 font-body text-sm text-text truncate">{item.name}</span>
                  {log.state === "done" && log.actualMinutes > 0 && (
                    <span className="font-mono text-xs text-muted mr-1">{log.actualMinutes}m</span>
                  )}
                  {variance !== null && (
                    <span className={`font-mono text-xs ${variance > 0 ? "text-tobacco" : variance < 0 ? "text-olive-light" : "text-dim"}`}>
                      {variance > 0 ? `+${variance}m` : variance < 0 ? `${variance}m` : "on target"}
                    </span>
                  )}
                  <span className={`font-mono text-xs ml-1 ${log.state === "done" ? "text-olive" : log.state === "missed" ? "text-burgundy-light" : "text-blue-muted"}`}>
                    {log.state === "done" ? "✓" : log.state === "missed" ? "✗" : "~"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-4 flex-shrink-0 border-t border-border">
          <button onClick={onFinish} className="w-full py-4 rounded-card bg-olive text-text font-body font-medium">
            Finish
          </button>
        </div>
      </div>
    );
  }

  // ── Running ──────────────────────────────────────────────────────────────────
  // Items already logged before this session started (e.g. completed earlier today
  // outside "Start Routine") count as done too, so they don't render as "upcoming".
  const externalDoneIds = new Set(
    Object.entries(externalLogs ?? {})
      .filter(([, l]) => l.state === "done" || l.state === "missed" || l.state === "rest")
      .map(([id]) => id)
  );
  const loggedIds = new Set([...sessionLogs.map((l) => l.itemId), ...Array.from(externalDoneIds)]);

  // Countdown ring values
  const countdownRatio = isCountdown && target > 0 ? Math.min(elapsed / target, 1) : 0;
  const countdownColor = isOver ? "#7a2e2e" : countdownRatio >= 0.75 ? "#c47a2a" : "#5a6b35";
  const countdownOffset = RING_CIRC * (1 - countdownRatio);
  const countdownDisplay = isOver ? `+${fmtMins(elapsed - target)}` : fmtMins(target - elapsed);

  // Stopwatch ring values
  const stopwatchRatio = isStopwatch ? Math.min(elapsed / STOPWATCH_SOFT_CAP, 1) : 0;
  const stopwatchOffset = RING_CIRC * (1 - stopwatchRatio);

  return (
    <div className="fixed inset-0 bg-bg z-50 flex flex-col max-w-mobile mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-10 pb-2 flex-shrink-0">
        <button onClick={handleClose} className="flex items-center justify-center w-9 h-9 rounded-full bg-card text-dim">
          <X size={16} />
        </button>
        <span className="font-mono text-muted text-sm">{currentIndex + 1} of {items.length}</span>
      </div>

      {/* Item info */}
      <div className="text-center px-4 pt-2 pb-3 flex-shrink-0">
        <div className="flex justify-center mb-3">
          <HabitIcon name={currentItem.icon} size={44} strokeWidth={1.25} className="text-text" />
        </div>
        <h2 className="font-heading text-xl text-text leading-tight">{currentItem.name}</h2>
        {isCountdown && (
          <p className="font-mono text-dim text-xs mt-1">{currentItem.projectedMinutes}m target</p>
        )}
        {isStopwatch && (
          <p className="font-mono text-dim text-xs mt-1">stopwatch · no target</p>
        )}
        {isCheckbox && (
          <p className="font-mono text-dim text-xs mt-1">mark when done</p>
        )}
      </div>

      {/* ── Checkbox: big done button instead of ring ── */}
      {isCheckbox && (
        <div className="flex-1 flex items-center justify-center px-4">
          <button
            onClick={handleDone}
            className="w-44 h-44 rounded-full bg-olive/10 border-2 border-olive/40 flex flex-col items-center justify-center gap-2 active:bg-olive/20 transition-colors"
          >
            <span className="text-4xl text-olive">✓</span>
            <span className="font-body text-sm text-olive font-medium">Done</span>
          </button>
        </div>
      )}

      {/* ── Countdown ring ── */}
      {isCountdown && (
        <div className="flex justify-center flex-shrink-0 pb-3">
          <div className="relative w-44 h-44">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={RING_R} fill="none" stroke="#2e2c22" strokeWidth="9" />
              <circle
                cx="80" cy="80" r={RING_R}
                fill="none"
                stroke={countdownColor}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={countdownOffset}
                style={{ transition: "stroke-dashoffset 0.95s linear, stroke 0.4s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-3xl font-semibold leading-none" style={{ color: isOver ? "#a03a3a" : "#e8e0cc" }}>
                {countdownDisplay}
              </span>
              <span className="font-mono text-[10px] text-dim mt-1">{isOver ? "over" : "remaining"}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Stopwatch ring ── */}
      {isStopwatch && (
        <div className="flex justify-center flex-shrink-0 pb-3">
          <div className="relative w-44 h-44">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={RING_R} fill="none" stroke="#2e2c22" strokeWidth="9" />
              <circle
                cx="80" cy="80" r={RING_R}
                fill="none"
                stroke="#5a6b35"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={stopwatchOffset}
                style={{ transition: "stroke-dashoffset 0.95s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-3xl font-semibold leading-none text-text">
                {fmtMins(elapsed)}
              </span>
              <span className="font-mono text-[10px] text-dim mt-1">elapsed</span>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-4 flex-shrink-0 space-y-2">
        {/* Checkbox: just missed + rest (done is the big button above) */}
        {isCheckbox ? (
          <div className="flex gap-2">
            <button onClick={handleMissed} className="flex-1 py-2.5 rounded-card border border-burgundy/30 text-burgundy-light font-body text-sm min-h-[44px]">
              ✗ Missed
            </button>
            <button onClick={handleRest} className="flex-1 py-2.5 rounded-card border border-blue-muted/30 text-blue-muted font-body text-sm min-h-[44px]">
              ~ Rest
            </button>
          </div>
        ) : (
          <>
            <button onClick={handleDone} className="w-full py-3 rounded-card bg-olive text-text font-body font-medium">
              Done · log {Math.max(1, Math.round(elapsed / 60))}m
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setIsRunning((r) => !r)}
                className="flex-1 py-2.5 rounded-card border border-border-light text-muted font-body text-sm min-h-[44px]"
              >
                {isRunning ? "Pause" : "Resume"}
              </button>
              <button onClick={handleMissed} className="flex-1 py-2.5 rounded-card border border-burgundy/30 text-burgundy-light font-body text-sm min-h-[44px]">
                ✗ Missed
              </button>
              <button onClick={handleRest} className="flex-1 py-2.5 rounded-card border border-blue-muted/30 text-blue-muted font-body text-sm min-h-[44px]">
                ~ Rest
              </button>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border mx-4 flex-shrink-0" />

      {/* Habit list */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
        <div className="space-y-1">
          {items.map((item, i) => {
            const isCurrent = i === currentIndex;
            const sessionLog = sessionLogs.find((l) => l.itemId === item._id);
            const ext = !isCurrent ? externalLogs?.[item._id] : undefined;
            const log: SessionLog | undefined =
              sessionLog ??
              (ext && (ext.state === "done" || ext.state === "missed" || ext.state === "rest")
                ? { itemId: item._id, state: ext.state, actualMinutes: ext.actualMinutes ?? 0 }
                : undefined);
            const isDone = loggedIds.has(item._id);
            const isUpcoming = !isDone && !isCurrent;
            const isItemCheckbox = item.itemType === "checkbox";
            const isItemStopwatch = item.itemType === "stopwatch";

            return (
              <div
                key={item._id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-card transition-colors ${
                  isCurrent ? "bg-olive/10 border border-olive/20" : isDone ? "opacity-60" : isUpcoming ? "opacity-40" : ""
                }`}
              >
                <div className="w-6 flex items-center justify-center flex-shrink-0">
                  <HabitIcon name={item.icon} size={15} strokeWidth={1.75} className={isCurrent ? "text-olive" : "text-dim"} />
                </div>
                <span className={`flex-1 font-body text-sm ${isCurrent ? "text-text font-medium" : "text-muted"} ${log ? "line-through" : ""}`}>
                  {item.name}
                </span>
                <span className="font-mono text-dim text-xs flex-shrink-0">
                  {isItemCheckbox ? "✓" : isItemStopwatch ? "⏱" : `${item.projectedMinutes}m`}
                </span>
                {log && (
                  <span className={`font-mono text-xs flex-shrink-0 ml-1 ${log.state === "done" ? "text-olive" : log.state === "missed" ? "text-burgundy-light" : "text-blue-muted"}`}>
                    {log.state === "done" ? "✓" : log.state === "missed" ? "✗" : "~"}
                  </span>
                )}
                {isCurrent && !log && <ChevronRight size={14} className="text-olive flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
