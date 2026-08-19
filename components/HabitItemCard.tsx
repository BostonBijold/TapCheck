"use client";

import { useState } from "react";
import HabitIcon from "@/components/HabitIcon";
import StreakDots from "@/components/StreakDots";
import type { RowItem } from "@/components/RoutineItemRow";
import type { RoutineLogEntry } from "@/components/RoutinesView";
import type { LogState } from "@/models/RoutineLog";

interface Props {
  item: RowItem;
  log?: RoutineLogEntry;
  weekLogs: Array<{ date: string; state: LogState }>;
  weekDates: string[]; // Sunday→Saturday, fixed calendar week
  today: string; // YYYY-MM-DD — marks today's dot and what counts as "future" in StreakDots
  isBackEntry: boolean;
  onStartTimer: () => void;
  onStateChange: (state: LogState | null, opts?: { actualMinutes?: number; isBackEntry?: boolean }) => void;
}

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function HabitItemCard({
  item, log, weekLogs, weekDates, today, isBackEntry,
  onStartTimer, onStateChange,
}: Props) {
  const state = log?.state ?? null;
  const isCheckbox = item.itemType === "checkbox";
  const isStopwatch = item.itemType === "stopwatch";
  const isTimed = !isCheckbox && !isStopwatch;
  const hasDuration = item.projectedMinutes > 0;
  const actual = log?.actualMinutes ?? null;
  const variance = state === "done" && isTimed && actual != null && hasDuration
    ? actual - item.projectedMinutes
    : null;

  const [backMins, setBackMins] = useState(
    isStopwatch ? "30" : String(item.projectedMinutes || 15)
  );
  const [showSkips, setShowSkips] = useState(false);

  // ── Completed state ────────────────────────────────────────────────────────
  if (state === "done") {
    return (
      <div className="bg-card rounded-card border-l-[3px] border-l-olive px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-7 flex items-center justify-center flex-shrink-0">
            <HabitIcon name={item.icon} size={17} className="text-olive/60" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm text-dim line-through leading-tight">{item.name}</p>
            <div className="mt-1.5">
              <StreakDots
              logs={weekLogs}
              dates={weekDates}
              today={today}
              scheduledDays={item.scheduledDays}
              successThreshold={item.successThreshold}
            />
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <span className="font-mono text-xs text-olive bg-olive/10 px-2 py-0.5 rounded-pill">
              ✓ Done
            </span>
            {isTimed && actual != null && hasDuration && (
              <span className="font-mono text-[10px] text-dim">
                {fmtMins(actual)}
                {variance !== null && variance !== 0 && (
                  <span className={variance > 0 ? " text-tobacco" : " text-gold"}>
                    {" "}{variance > 0 ? `+${variance}m` : `${variance}m`}
                  </span>
                )}
              </span>
            )}
            {isStopwatch && actual != null && actual > 0 && (
              <span className="font-mono text-[10px] text-dim">{fmtMins(actual)}</span>
            )}
          </div>
        </div>
        {/* Undo */}
        <button
          onClick={() => onStateChange(null)}
          className="mt-2 ml-10 font-mono text-[9px] text-dim uppercase tracking-widest"
        >
          Undo
        </button>
      </div>
    );
  }

  // ── Missed state ───────────────────────────────────────────────────────────
  if (state === "missed") {
    return (
      <div className="bg-card rounded-card border-l-[3px] border-l-burgundy px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-7 flex items-center justify-center flex-shrink-0">
            <HabitIcon name={item.icon} size={17} className="text-dim" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm text-dim leading-tight">{item.name}</p>
            <div className="mt-1.5">
              <StreakDots
              logs={weekLogs}
              dates={weekDates}
              today={today}
              scheduledDays={item.scheduledDays}
              successThreshold={item.successThreshold}
            />
            </div>
          </div>
          <span className="font-mono text-xs text-burgundy-light bg-burgundy/10 px-2 py-0.5 rounded-pill flex-shrink-0">
            ✗ Missed
          </span>
        </div>
        <button
          onClick={() => onStateChange(null)}
          className="mt-2 ml-10 font-mono text-[9px] text-dim uppercase tracking-widest"
        >
          Undo
        </button>
      </div>
    );
  }

  // ── Rest state ─────────────────────────────────────────────────────────────
  if (state === "rest") {
    return (
      <div className="bg-card rounded-card border-l-[3px] border-l-blue-muted px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-7 flex items-center justify-center flex-shrink-0">
            <HabitIcon name={item.icon} size={17} className="text-dim" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body text-sm text-dim leading-tight">{item.name}</p>
            <div className="mt-1.5">
              <StreakDots
              logs={weekLogs}
              dates={weekDates}
              today={today}
              scheduledDays={item.scheduledDays}
              successThreshold={item.successThreshold}
            />
            </div>
          </div>
          <span className="font-mono text-xs text-blue-muted bg-blue-muted/10 px-2 py-0.5 rounded-pill flex-shrink-0">
            ~ Rest
          </span>
        </div>
        <button
          onClick={() => onStateChange(null)}
          className="mt-2 ml-10 font-mono text-[9px] text-dim uppercase tracking-widest"
        >
          Undo
        </button>
      </div>
    );
  }

  // ── Pending state ──────────────────────────────────────────────────────────
  return (
    <div className="bg-card rounded-card px-4 py-3.5 space-y-3">
      {/* Top row: icon + name + primary action */}
      <div className="flex items-center gap-3">
        <div className="w-7 flex items-center justify-center flex-shrink-0">
          <HabitIcon name={item.icon} size={17} className="text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm text-text leading-tight">{item.name}</p>
          <div className="mt-1.5">
            <StreakDots
              logs={weekLogs}
              dates={weekDates}
              today={today}
              scheduledDays={item.scheduledDays}
              successThreshold={item.successThreshold}
            />
          </div>
        </div>

        {/* Primary action — always visible, no tap to reveal */}
        {isCheckbox && (
          <button
            onClick={() => onStateChange("done", { isBackEntry })}
            className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-olive/40 text-olive hover:bg-olive/10 transition-colors flex-shrink-0"
            aria-label="Mark done"
          >
            <span className="text-base leading-none">✓</span>
          </button>
        )}

        {!isCheckbox && !isBackEntry && (
          <button
            onClick={onStartTimer}
            className="flex items-center gap-1.5 bg-olive/10 border border-olive/30 text-olive font-mono text-xs px-3 py-2 rounded-card min-h-[40px] flex-shrink-0 hover:bg-olive/20 transition-colors"
          >
            <span>▶</span>
            {hasDuration && !isStopwatch && (
              <span>{fmtMins(item.projectedMinutes)}</span>
            )}
            {isStopwatch && <span>Start</span>}
          </button>
        )}

        {!isCheckbox && isBackEntry && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() =>
                onStateChange("done", {
                  actualMinutes: Math.max(1, parseInt(backMins) || item.projectedMinutes || 1),
                  isBackEntry: true,
                })
              }
              className="flex items-center gap-1.5 bg-olive/10 border border-olive/30 text-olive font-mono text-xs px-3 py-2 rounded-card min-h-[40px] hover:bg-olive/20 transition-colors"
            >
              ✓ Done
            </button>
            {hasDuration && (
              <div className="flex items-center gap-0.5 border border-border rounded-card px-2 py-2 min-h-[40px]">
                <input
                  type="number"
                  min={1}
                  value={backMins}
                  onChange={(e) => setBackMins(e.target.value)}
                  className="w-8 bg-transparent font-mono text-xs text-text outline-none text-right"
                />
                <span className="font-mono text-dim text-[10px]">m</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skip options — shown inline when toggled */}
      {!showSkips ? (
        <button
          onClick={() => setShowSkips(true)}
          className="ml-10 font-mono text-[9px] text-dim uppercase tracking-widest"
        >
          Skip…
        </button>
      ) : (
        <div className="ml-10 flex gap-2">
          <button
            onClick={() => { onStateChange("missed", { isBackEntry }); setShowSkips(false); }}
            className="flex-1 border border-burgundy/30 text-burgundy-light font-body text-xs py-2 rounded-card min-h-[36px]"
          >
            ✗ Missed
          </button>
          <button
            onClick={() => { onStateChange("rest", { isBackEntry }); setShowSkips(false); }}
            className="flex-1 border border-blue-muted/30 text-blue-muted font-body text-xs py-2 rounded-card min-h-[36px]"
          >
            ~ Rest
          </button>
          <button
            onClick={() => setShowSkips(false)}
            className="px-3 text-dim font-mono text-[10px] min-h-[36px]"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
