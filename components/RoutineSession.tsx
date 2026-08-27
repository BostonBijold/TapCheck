"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronRight } from "lucide-react";
import HabitIcon from "@/components/HabitIcon";
import TimelineBar from "@/components/TimelineBar";
import VirtueCheckInModal from "@/components/VirtueCheckInModal";
import WeeklyReviewModal from "@/components/WeeklyReviewModal";
import type { RowItem } from "@/components/RoutineItemRow";
import type { VirtueData } from "@/components/VirtueSheet";
import type { LogState } from "@/models/RoutineLog";
import { emitRoutineLogChanged } from "@/lib/routine-log-events";
import { updateRoutineActivity, endRoutineActivity } from "@/lib/native/routine-activity";
import { projectedFinishTime, staticBaselineFinish, type ItemProjection } from "@/lib/projected-finish";
import { computeTimeline, type TimelineColorState } from "@/lib/routine-timeline";

// Items of these types have no timer of their own — reaching one mid-session
// should hand off to its own flow (check-in modal, weekly review, or the
// routine review page) instead of falling through to the generic countdown
// ring, which is all that used to happen here.
function isSpecialItemType(itemType?: string): boolean {
  return itemType === "virtue_checkin" || itemType === "weekly_review" || itemType === "routine_review";
}

interface SessionLog {
  itemId: string;
  state: LogState;
  actualMinutes: number;
}

interface DayLogRecord {
  routineItemId: string;
  state: LogState;
  actualMinutes: number;
  startedAt: string | null;
  pausedSeconds: number;
}

// Subset of RoutineLogEntry (see RoutinesView) needed to resume a timer that was
// started outside this session (e.g. tapped "Start" on a single habit, then
// entered "Start Routine") and to reflect items already logged before the
// session began.
export interface ExternalLog {
  state: LogState;
  startedAt?: string;
  actualMinutes?: number;
  pausedSeconds?: number;
}

interface Props {
  groupId: string;
  groupName: string;
  groupStartTime?: string | null; // 'HH:MM' — only used for the optional on-track/behind indicator (see lib/projected-finish.ts)
  items: RowItem[];
  logs?: Record<string, ExternalLog>;
  today: string;
  startIndex?: number;
  thisWeekVirtue?: VirtueData | null; // needed to render a virtue_checkin/weekly_review item inline
  onClose: () => void;
  onFinish: () => void;
  onOpenRoutineReview?: () => void; // routine_review has no inline UI — hands off to the review page
}

function pad(n: number) {
  return Math.max(0, n).toString().padStart(2, "0");
}

function fmtMins(secs: number) {
  const m = Math.floor(Math.abs(secs) / 60);
  const s = Math.abs(secs) % 60;
  return `${pad(m)}:${pad(s)}`;
}

// Finds the next item that isn't done/missed/rest yet, starting just after
// afterIndex and wrapping back to the start if nothing remains going
// forward — so a session never reaches the summary screen just because it
// ran off the end of the list. An item that's paused (jumped away from) or
// was never touched (jumped over) still needs resolving, however far back
// in the list it sits. Returns -1 only when every item is finished.
function nextUnfinishedIndex(items: RowItem[], finishedIds: Set<string>, afterIndex: number): number {
  for (let i = afterIndex + 1; i < items.length; i++) {
    if (!finishedIds.has(items[i]._id)) return i;
  }
  for (let i = 0; i <= afterIndex; i++) {
    if (!finishedIds.has(items[i]._id)) return i;
  }
  return -1;
}

const RING_R = 70;
const RING_CIRC = 2 * Math.PI * RING_R;
const STOPWATCH_SOFT_CAP = 30 * 60;

// Timeline segment fill colors — done and on-track-active both read as
// olive (success/in-hand, same convention RoutineItemRow uses for the done
// badge regardless of variance), pending as a dim neutral fill (not yet
// decided), and only a running-over active segment shifts to amber — the
// one state this bar is actually meant to draw the eye to.
const TIMELINE_COLOR: Record<TimelineColorState, string> = {
  done: "#5a6b35",        // olive
  active: "#5a6b35",      // olive
  "active-over": "#c47a2a", // amber
  pending: "#3d3b2e",     // border-light
};

export default function RoutineSession({ groupId, groupName, groupStartTime = null, items, logs: externalLogs, today, startIndex = 0, thisWeekVirtue = null, onClose, onFinish, onOpenRoutineReview }: Props) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [phase, setPhase] = useState<"running" | "summary">("running");
  const [specialModalOpen, setSpecialModalOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Latest known state of every item's log today, from any source — this
  // session's own actions, an external API call, or a manual tap elsewhere.
  // Kept fresh by advance(), the foreground-revalidation effect, and the
  // jump-to-item handler, all of which re-fetch rather than trust stale state.
  const [latestLogs, setLatestLogs] = useState<Record<string, DayLogRecord>>({});
  const [jumpNotice, setJumpNotice] = useState<string | null>(null);

  const currentItem = items[currentIndex];
  const isCheckbox = currentItem?.itemType === "checkbox";
  const isStopwatch = currentItem?.itemType === "stopwatch";
  const isVirtueCheckin = currentItem?.itemType === "virtue_checkin";
  const isWeeklyReview = currentItem?.itemType === "weekly_review";
  const isRoutineReview = currentItem?.itemType === "routine_review";
  const isSpecial = isVirtueCheckin || isWeeklyReview || isRoutineReview;
  // weekly_review and routine_review are Sunday-only habits — same gate
  // RoutineItemRow uses outside a session; virtue_checkin has no such gate.
  const isSunday = new Date(today + "T12:00:00").getDay() === 0;
  const specialAvailableToday = isVirtueCheckin || ((isWeeklyReview || isRoutineReview) && isSunday);
  const isCountdown = !isCheckbox && !isStopwatch && !isSpecial;

  // Reaching a new item always starts clean — a stale "check-in open" flag
  // left over from the previous item would otherwise pop the wrong modal.
  useEffect(() => { setSpecialModalOpen(false); }, [currentIndex]);

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

  // Don't run the clock for checkbox or special (no-timer) items — there's nothing to time
  useEffect(() => {
    if (isRunning && phase === "running" && !isCheckbox && !isSpecial) {
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
  }, [isRunning, phase, isCheckbox, isSpecial, recompute]);

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

  useEffect(() => {
    if (!jumpNotice) return;
    const t = setTimeout(() => setJumpNotice(null), 2500);
    return () => clearTimeout(t);
  }, [jumpNotice]);

  // Fetches today's full log list (not just ids) and folds it into latestLogs,
  // used for skip-forward decisions, foreground revalidation, and the jump
  // safety check below — always the live server truth, never a stale prop.
  const fetchDayLogs = useCallback(async (): Promise<DayLogRecord[]> => {
    try {
      const res = await fetch(`/api/routine-logs?date=${today}`);
      if (!res.ok) return [];
      const fresh: Array<{ routineItemId: string; state: LogState; actualMinutes: number | null; startedAt: string | null; pausedSeconds?: number }> = await res.json();
      const records: DayLogRecord[] = fresh.map((l) => ({
        routineItemId: l.routineItemId,
        state: l.state,
        actualMinutes: l.actualMinutes ?? 0,
        startedAt: l.startedAt ?? null,
        pausedSeconds: l.pausedSeconds ?? 0,
      }));
      setLatestLogs((prev) => {
        const next = { ...prev };
        for (const r of records) next[r.routineItemId] = r;
        return next;
      });
      return records;
    } catch {
      return [];
    }
  }, [today]);

  // Detects whether the current item was auto-completed out from under this
  // session by something outside it — e.g. the external API starting a
  // different item while this session was backgrounded, which the single-
  // active-timer invariant resolves by auto-completing whatever this session
  // had running. Without this, tapping Done on the now-stale UI would
  // silently overwrite the server's correct completion with a fabricated one
  // from the frozen local clock.
  useEffect(() => {
    const revalidate = async () => {
      if (document.visibilityState !== "visible") return;
      if (phase !== "running" || !currentItem) return;
      const records = await fetchDayLogs();
      const currentLog = records.find((r) => r.routineItemId === currentItem._id);
      // No log yet, or still legitimately running/paused (presumably ours,
      // or another tab/device paused it and it's still resumable) — nothing to do.
      if (!currentLog || currentLog.state === "in_progress" || currentLog.state === "paused") return;

      setSessionLogs((prev) =>
        prev.some((l) => l.itemId === currentItem._id)
          ? prev
          : [...prev, { itemId: currentItem._id, state: currentLog.state, actualMinutes: currentLog.actualMinutes }]
      );

      const finishedIds = new Set(
        records.filter((r) => r.state === "done" || r.state === "missed" || r.state === "rest").map((r) => r.routineItemId)
      );
      const nextIndex = nextUnfinishedIndex(items, finishedIds, currentIndex);
      if (nextIndex !== -1) {
        setCurrentIndex(nextIndex);
      } else {
        setPhase("summary");
        setIsRunning(false);
        endRoutineActivity();
      }
    };

    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    window.addEventListener("pageshow", revalidate);
    // Also poll on a short interval so an external trigger (App Intent /
    // Siri / Shortcuts) is caught even if this tab stays foregrounded the
    // whole time — revalidate() already no-ops unless visible and running.
    const poll = setInterval(revalidate, 2000);
    return () => {
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("pageshow", revalidate);
      clearInterval(poll);
    };
  }, [phase, currentItem, currentIndex, items, fetchDayLogs]);

  // Move to a new item — advancing sequentially, or jumping. Only one timer
  // is ever actively running: switching to a new current item pauses
  // whatever was running before (banking its elapsed time server-side via
  // switchActiveLog / sessionNav: true) rather than leaving it ticking
  // alongside the new one or marking it done. If this item was itself
  // paused earlier (jumped away and back), the server resumes it from its
  // banked time instead of restarting the clock. Nothing here ever sets a
  // terminal state — only an explicit Done/Missed/Rest (or the external API)
  // does that. Re-fetching afterwards (rather than trusting the POST
  // response alone) keeps latestLogs correct for every item, including
  // whichever one was just paused.
  useEffect(() => {
    if (!currentItem) return;
    let cancelled = false;
    const item = currentItem;
    const isCheckboxItem = item.itemType === "checkbox";

    // Blank the display immediately so it doesn't show the previous item's
    // leftover elapsed value while the switch is in flight.
    baseElapsedRef.current = 0;
    runStartRef.current = null;
    setElapsed(0);
    setIsRunning(false);

    (async () => {
      // Stamp the group id too, not just startedAt — this is what lets
      // closing the app mid-item (without tapping X) resume straight back
      // into this session on reopen, instead of falling back to the
      // standalone timer. Mirrors the external API's routineGroupId param;
      // openInProgressTimer already branches on sessionGroupId either way.
      await fetch("/api/routine-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routineItemId: item._id,
          date: today,
          state: "in_progress",
          sessionGroupId: groupId,
          sessionNav: true,
        }),
      });
      emitRoutineLogChanged();
      if (cancelled) return;

      const records = await fetchDayLogs();
      if (cancelled) return;

      const own = records.find((r) => r.routineItemId === item._id);
      const seeded =
        !isCheckboxItem && !isSpecialItemType(item.itemType) && own?.startedAt
          ? (own.pausedSeconds ?? 0) + Math.max(0, Math.floor((Date.now() - new Date(own.startedAt).getTime()) / 1000))
          : 0;
      baseElapsedRef.current = seeded;
      runStartRef.current = Date.now();
      setElapsed(seeded);
      setIsRunning(true);

      // Checkbox/special items have no timer — end rather than show a
      // stale one; update() falls back to starting fresh, so the very
      // first timed item in a session (nothing to update yet) is handled
      // the same call as switching between two timed items mid-session.
      if (isCheckboxItem || isSpecialItemType(item.itemType)) {
        endRoutineActivity();
      } else {
        // Same projection/timeline math the in-app view itself uses (see
        // the render-time projectionItems below) — recomputed here from
        // `records` (the fresh fetch just above) rather than reusing
        // component state, since this runs inside an async effect and
        // `records` is already the live truth for exactly this moment.
        // Only ever refreshed on an item switch, not per-second — see
        // docs/features/live-activity.md's note on this being
        // "eventually consistent," same as the countdown/color already are.
        const virtualStartedAt = Date.now() - seeded * 1000;
        const projectionItems: ItemProjection[] = items.map((it) => {
          if (it._id === item._id) {
            return {
              projectedMinutes: it.projectedMinutes,
              state: "active",
              targetInstant: virtualStartedAt + it.projectedMinutes * 60000,
            };
          }
          const rec = records.find((r) => r.routineItemId === it._id);
          if (rec && (rec.state === "done" || rec.state === "missed" || rec.state === "rest")) {
            return {
              projectedMinutes: it.projectedMinutes,
              state: rec.state,
              actualMinutes: rec.state === "done" ? rec.actualMinutes : undefined,
            };
          }
          return { projectedMinutes: it.projectedMinutes, state: "pending" };
        });
        const nowMs = Date.now();
        const timeline = computeTimeline(
          items.map((it, i) => ({ id: it._id, ...projectionItems[i] })),
          nowMs
        );
        const routineFinishAt = projectedFinishTime(projectionItems, new Date(nowMs));

        updateRoutineActivity({
          routineItemId: item._id,
          routineGroupId: groupId,
          routineLabel: groupName,
          habitName: item.name,
          startedAt: new Date(virtualStartedAt).toISOString(),
          projectedMinutes: item.itemType === "stopwatch" ? 0 : item.projectedMinutes,
          timelineSegments: timeline.segments.map((seg) => ({
            pct: seg.pct,
            colorState: seg.colorState === "active-over" ? "activeOver" : seg.colorState,
          })),
          routineStartedAt: new Date(timeline.startInstant).toISOString(),
          routineFinishAt: routineFinishAt.toISOString(),
        });
      }
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

      // Skip past anything already FINISHED today (done/missed/rest), from
      // ANY source — an earlier API call, a manual tap elsewhere, or this
      // session itself. An in_progress or paused item is deliberately NOT
      // skipped — it becomes current instead, resuming from its real banked
      // time, since it's just something you (or another source) started
      // earlier and haven't finished yet, not something to bypass. The walk
      // below wraps back to the start of the list rather than stopping at
      // the end, so a paused/pending item earlier in the list (jumped away
      // from or jumped over) still gets revisited instead of silently
      // ending the session. Re-fetch rather than trust sessionLogs/
      // externalLogs, since either can be stale relative to an out-of-band
      // completion that just happened.
      const records = await fetchDayLogs();
      const finishedIds = new Set(sessionLogs.map((l) => l.itemId));
      finishedIds.add(currentItem._id);
      for (const r of records) {
        if (r.state === "done" || r.state === "missed" || r.state === "rest") finishedIds.add(r.routineItemId);
      }

      const nextIndex = nextUnfinishedIndex(items, finishedIds, currentIndex);
      if (nextIndex !== -1) {
        setCurrentIndex(nextIndex);
      } else {
        setPhase("summary");
        setIsRunning(false);
        endRoutineActivity();
      }
    },
    [currentItem, currentIndex, items, saveLog, sessionLogs, fetchDayLogs]
  );

  // Jump directly to a different item — pending (never started), in_progress
  // (rare: started earlier via another tab/device and still actively running),
  // or paused (started earlier in this session, left when you jumped away) —
  // without marking the current one done, missed, or rest. The item you're
  // leaving is paused, not completed: the per-item effect above switches the
  // active timer via switchActiveLog (sessionNav: true), which banks its
  // elapsed time and marks it paused. Only an explicit Done/Missed/Rest (or
  // the external API) ever marks an item. Only a FINISHED item (done/missed/
  // rest) can't be jumped to — that's what Undo is for, not a jump.
  const handleJumpTo = useCallback(
    async (index: number) => {
      if (phase !== "running" || index === currentIndex) return;
      const target = items[index];
      if (!target) return;
      // Re-check freshness right before jumping — the row's own displayed
      // state could be a moment stale if something finished it since the last render.
      const records = await fetchDayLogs();
      const targetLog = records.find((r) => r.routineItemId === target._id);
      if (targetLog && (targetLog.state === "done" || targetLog.state === "missed" || targetLog.state === "rest")) {
        setJumpNotice(`${target.name} was already logged — refreshed.`);
        return;
      }
      setCurrentIndex(index);
    },
    [phase, currentIndex, items, fetchDayLogs]
  );

  // Closing mid-item (the X button) just dismisses this view — the current
  // item's log is already in_progress server-side (see the per-item effect
  // above) and keeps running untouched, same as backgrounding the app. The
  // Live Activity keeps tracking it on the Lock Screen too (deliberately
  // not ended here — see docs/features/live-activity.md). The user resumes
  // via the FAB's active-timer indicator (BottomNav.tsx) or by reopening
  // this group's "Start Routine."
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

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
    // Anything this session itself walked through and logged, PLUS anything
    // else that ended up logged today by another source (an external call,
    // e.g.) — without this fallback those items would silently vanish from
    // the summary instead of being shown, and the completed count would be
    // wrong relative to items.length.
    const logMap: Record<string, SessionLog> = {};
    for (const [id, l] of Object.entries(latestLogs)) {
      if (l.state === "done" || l.state === "missed" || l.state === "rest") {
        logMap[id] = { itemId: id, state: l.state, actualMinutes: l.actualMinutes };
      }
    }
    for (const l of sessionLogs) logMap[l.itemId] = l; // this session's own record wins if both exist

    const allLogs = Object.values(logMap);
    const totalActual = allLogs.reduce((s, l) => s + l.actualMinutes, 0);
    const timedItems = items.filter((i) => i.itemType !== "checkbox");
    const totalProjected = timedItems.reduce((s, i) => s + i.projectedMinutes, 0);
    const doneCount = allLogs.filter((l) => l.state === "done").length;

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
  // Same, but from live server state rather than the static prop — covers
  // anything completed mid-session by another source (a jump, an external call).
  const liveDoneIds = new Set(
    Object.entries(latestLogs)
      .filter(([, l]) => l.state === "done" || l.state === "missed" || l.state === "rest")
      .map(([id]) => id)
  );
  const loggedIds = new Set([
    ...sessionLogs.map((l) => l.itemId),
    ...Array.from(externalDoneIds),
    ...Array.from(liveDoneIds),
  ]);

  // Live projected finish time — see lib/projected-finish.ts. The active
  // item's targetInstant is derived from the stable baseElapsedRef/
  // runStartRef pair (only mutated on pause/resume/switch/drag), not from
  // `elapsed` + a fresh Date.now() — so it stays bit-exact across ticks
  // instead of merely canceling out algebraically each render. While
  // actually running: effective start = runStartRef - bankedSeconds, same
  // math the ring's own elapsed display uses. While paused (no interval
  // ticking, so no repeated renders to stay in sync across anyway), falls
  // back to deriving it from the frozen `elapsed` state.
  const activeTargetInstant =
    (runStartRef.current != null
      ? runStartRef.current - baseElapsedRef.current * 1000
      : Date.now() - elapsed * 1000) + (currentItem?.projectedMinutes ?? 0) * 60000;

  // Resolves each item to one of the four projection states using the same
  // sessionLogs > latestLogs > externalLogs > pending precedence the habit
  // list below uses for its own per-row log lookup, generalized to include
  // the current item (always "active", never looked up from a log) and to
  // return the exact terminal state (missed vs. rest) rather than a single
  // boolean, since only "done" and "active" carry a nonzero contribution.
  // Recomputed on every render — including the once-a-second tick that
  // updates `elapsed` — so it's live without a second interval.
  const projectionItems: ItemProjection[] = items.map((item, i) => {
    if (i === currentIndex) {
      return { projectedMinutes: item.projectedMinutes, state: "active", targetInstant: activeTargetInstant };
    }
    const sessionLog = sessionLogs.find((l) => l.itemId === item._id);
    if (sessionLog && (sessionLog.state === "done" || sessionLog.state === "missed" || sessionLog.state === "rest")) {
      return {
        projectedMinutes: item.projectedMinutes,
        state: sessionLog.state,
        actualMinutes: sessionLog.state === "done" ? sessionLog.actualMinutes : undefined,
      };
    }
    const live = latestLogs[item._id];
    if (live && (live.state === "done" || live.state === "missed" || live.state === "rest")) {
      return {
        projectedMinutes: item.projectedMinutes,
        state: live.state,
        actualMinutes: live.state === "done" ? live.actualMinutes : undefined,
      };
    }
    const ext = externalLogs?.[item._id];
    if (ext && (ext.state === "done" || ext.state === "missed" || ext.state === "rest")) {
      return {
        projectedMinutes: item.projectedMinutes,
        state: ext.state,
        actualMinutes: ext.state === "done" ? (ext.actualMinutes ?? 0) : undefined,
      };
    }
    return { projectedMinutes: item.projectedMinutes, state: "pending" };
  });
  // Single "now" sample shared by both the projected-finish label and the
  // timeline below, so the two never disagree by even the few ms between
  // two separately-read Date.now() calls in the same render.
  const nowMs = Date.now();
  const projectedFinish = projectedFinishTime(projectionItems, new Date(nowMs));
  const projectedFinishLabel = projectedFinish.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  // Live routine timeline — see lib/routine-timeline.ts. Same per-item data
  // as the projection above, just turned into proportional segment widths
  // instead of a single remaining-minutes total.
  const timeline = computeTimeline(
    items.map((item, i) => ({ id: item._id, ...projectionItems[i] })),
    nowMs
  );
  const timelineStartLabel = new Date(timeline.startInstant).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Optional on-track/behind indicator — compares the live projection above
  // against a static baseline (startTime + total projected minutes across
  // the group's timed items, same "checkbox excluded" convention
  // RoutineGroupCard already uses for a group's collapse time). null when
  // the group has no startTime (custom groups), in which case no color/
  // verdict is shown, just the plain projected time.
  const timedItems = items.filter((i) => i.itemType !== "checkbox");
  const totalProjectedForBaseline = timedItems.reduce((s, i) => s + i.projectedMinutes, 0);
  const baselineFinish = staticBaselineFinish(today, groupStartTime, totalProjectedForBaseline);
  const isBehindSchedule = baselineFinish ? projectedFinish.getTime() > baselineFinish.getTime() : null;

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

      {/* Live projected finish time — see lib/projected-finish.ts. Amber
          once the live projection is later than the static startTime +
          total-projected-minutes baseline — same "running behind" color the
          timeline bar below uses for an over-target active segment, so the
          two stay one consistent signal instead of two different colors
          meaning the same thing. */}
      <div className="px-4 pb-1 flex-shrink-0 text-center">
        <span
          className={`font-mono text-xs ${
            isBehindSchedule === true ? "text-amber" : isBehindSchedule === false ? "text-olive-light" : "text-dim"
          }`}
        >
          Projected finish: {projectedFinishLabel}
        </span>
      </div>

      {/* Live routine timeline — see lib/routine-timeline.ts. One segment
          per item, left to right in routine order, width = that item's
          current share of the group's running total (not a fixed original
          total) — so the active item visibly eats into the others' share of
          the bar as it runs over, instead of just growing off the end. */}
      <div className="px-4 pb-3 flex-shrink-0">
        <TimelineBar
          segments={timeline.segments.map((seg) => ({ id: seg.id, pct: seg.pct, color: TIMELINE_COLOR[seg.colorState] }))}
          startLabel={timelineStartLabel}
          endLabel={projectedFinishLabel}
        />
      </div>

      <div className="flex flex-col select-none">
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
          {isVirtueCheckin && (
            <p className="font-mono text-dim text-xs mt-1">daily virtue check-in</p>
          )}
          {(isWeeklyReview || isRoutineReview) && (
            <p className="font-mono text-dim text-xs mt-1">
              {specialAvailableToday ? (isWeeklyReview ? "weekly review" : "routine review") : "Sunday habit"}
            </p>
          )}
        </div>

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
                {/* Handle at the arc's tip — purely visual */}
                <circle
                  cx={80 + RING_R * Math.cos(countdownRatio * 2 * Math.PI)}
                  cy={80 + RING_R * Math.sin(countdownRatio * 2 * Math.PI)}
                  r={8}
                  fill={countdownColor}
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
                {/* Handle at the arc's tip — purely visual */}
                <circle
                  cx={80 + RING_R * Math.cos(stopwatchRatio * 2 * Math.PI)}
                  cy={80 + RING_R * Math.sin(stopwatchRatio * 2 * Math.PI)}
                  r={8}
                  fill="#5a6b35"
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

      {/* ── Special items (virtue check-in / weekly review / routine review):
          no timer of their own — hand off to their real flow instead of
          falling through to a bare, meaningless countdown ring. ── */}
      {isSpecial && (
        <div className="flex-1 flex items-center justify-center px-4">
          {specialAvailableToday ? (
            <button
              onClick={() => {
                if (isRoutineReview) { onOpenRoutineReview?.(); return; }
                setSpecialModalOpen(true);
              }}
              className="w-full max-w-[280px] flex items-center justify-center gap-2 bg-gold/10 hover:bg-gold/20 border border-gold/30 text-text py-4 px-4 rounded-card transition-colors min-h-[44px]"
            >
              <span className="font-body text-sm font-medium">
                {isVirtueCheckin ? "✦ Start Check-In" : isWeeklyReview ? "☰ Start Weekly Review" : "☰ Open Routine Review"}
              </span>
            </button>
          ) : (
            <div className="px-4 py-3 rounded-card bg-bg border border-border">
              <p className="font-mono text-xs text-dim">Sunday habit — skip or rest for today</p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-4 flex-shrink-0 space-y-2">
        {/* Checkbox/special: just missed + rest (done is the big button/modal above) */}
        {isCheckbox || isSpecial ? (
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
        {jumpNotice && (
          <p className="font-mono text-[10px] text-burgundy-light text-center mb-2">{jumpNotice}</p>
        )}
        <div className="space-y-1">
          {items.map((item, i) => {
            const isCurrent = i === currentIndex;
            const sessionLog = sessionLogs.find((l) => l.itemId === item._id);
            const live = !isCurrent ? latestLogs[item._id] : undefined;
            const ext = !isCurrent ? externalLogs?.[item._id] : undefined;
            const log: SessionLog | undefined =
              sessionLog ??
              (live && (live.state === "done" || live.state === "missed" || live.state === "rest")
                ? { itemId: item._id, state: live.state, actualMinutes: live.actualMinutes }
                : ext && (ext.state === "done" || ext.state === "missed" || ext.state === "rest")
                  ? { itemId: item._id, state: ext.state, actualMinutes: ext.actualMinutes ?? 0 }
                  : undefined);
            const isDone = loggedIds.has(item._id);
            // Paused: started earlier in this session, left when you jumped
            // away — its elapsed time is banked, not lost, and resumes when
            // you jump back. Distinct from "upcoming" (never started): it
            // shouldn't render dimmed the way a never-started item does.
            const isPausedElsewhere = !isCurrent && !isDone && live?.state === "paused";
            // Rare: genuinely still ticking from another tab/device.
            const isRunningElsewhere = !isCurrent && !isDone && live?.state === "in_progress";
            const isUpcoming = !isDone && !isCurrent && !isPausedElsewhere && !isRunningElsewhere;
            const isItemCheckbox = item.itemType === "checkbox";
            const isItemStopwatch = item.itemType === "stopwatch";
            // Anything not current and not finished can be jumped to —
            // pending items start fresh, paused/in_progress items resume.
            const canJump = (isUpcoming || isPausedElsewhere || isRunningElsewhere) && phase === "running";
            const isActiveElsewhere = isPausedElsewhere || isRunningElsewhere;

            return (
              <div
                key={item._id}
                role={canJump ? "button" : undefined}
                onClick={canJump ? () => handleJumpTo(i) : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-card transition-colors ${
                  isCurrent
                    ? "bg-olive/10 border border-olive/20"
                    : isActiveElsewhere
                      ? "bg-amber/10 border border-amber/20"
                      : isDone
                        ? "opacity-60"
                        : isUpcoming
                          ? "opacity-40"
                          : ""
                } ${canJump ? "cursor-pointer active:opacity-70 active:bg-card-hover" : ""}`}
              >
                <div className="w-6 flex items-center justify-center flex-shrink-0">
                  <HabitIcon name={item.icon} size={15} strokeWidth={1.75} className={isCurrent ? "text-olive" : isActiveElsewhere ? "text-amber" : "text-dim"} />
                </div>
                <span className={`flex-1 font-body text-sm ${isCurrent ? "text-text font-medium" : isActiveElsewhere ? "text-text" : "text-muted"} ${log ? "line-through" : ""}`}>
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
                {isPausedElsewhere && (
                  <span className="font-mono text-amber text-[9px] flex-shrink-0">paused</span>
                )}
                {isRunningElsewhere && (
                  <span className="font-mono text-amber text-[9px] flex-shrink-0">running</span>
                )}
                {isCurrent && !log && <ChevronRight size={14} className="text-olive flex-shrink-0" />}
                {canJump && <span className="font-mono text-dim text-[9px] flex-shrink-0">jump</span>}
              </div>
            );
          })}
        </div>
      </div>

      {specialModalOpen && isVirtueCheckin && (
        <VirtueCheckInModal
          thisWeekVirtue={thisWeekVirtue}
          date={today}
          onDone={(mins) => { setSpecialModalOpen(false); advance("done", mins); }}
          onClose={() => setSpecialModalOpen(false)}
        />
      )}

      {specialModalOpen && isWeeklyReview && (
        <WeeklyReviewModal
          date={today}
          currentVirtue={thisWeekVirtue}
          virtueCount={thisWeekVirtue?.virtueCount ?? 0}
          onDone={(mins) => { setSpecialModalOpen(false); advance("done", mins); }}
          onClose={() => setSpecialModalOpen(false)}
        />
      )}
    </div>
  );
}
