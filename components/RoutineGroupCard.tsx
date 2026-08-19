"use client";

import { useState, useMemo, useEffect } from "react";
import { Play } from "lucide-react";
import HabitIcon from "@/components/HabitIcon";
import RoutineItemRow, { type RowItem } from "@/components/RoutineItemRow";
import HabitItemCard from "@/components/HabitItemCard";
import type { RoutineLogEntry } from "@/components/RoutinesView";
import type { LogState } from "@/models/RoutineLog";
import { isItemVisibleOn } from "@/lib/routine-visibility";

export interface GroupCardGroup {
  _id: string;
  name: string;
  timeOfDay: "morning" | "evening" | "custom" | "habit";
  startTime: string | null;
  order: number;
  items: RowItem[];
}

interface Props {
  group: GroupCardGroup;
  logs: Record<string, RoutineLogEntry>;
  weekLogs: Record<string, Array<{ date: string; state: LogState }>>;
  weekDates: string[]; // Sunday→Saturday, fixed calendar week (see lib/week-dates.ts)
  isPastDate?: boolean;
  selectedDate: string;
  today: string; // YYYY-MM-DD — marks today's dot and what counts as "future" in StreakDots
  onStateChange: (
    routineItemId: string,
    state: LogState | null,
    opts?: { actualMinutes?: number; isBackEntry?: boolean; startedAt?: string; completedAt?: string }
  ) => void;
  onStartTimer: (item: RowItem) => void;
  onStartRoutine: (group: GroupCardGroup, startIndex: number) => void;
  onOpenCheckIn: (item: RowItem) => void;
  onOpenReview: (item: RowItem) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Derive end time from startTime + total projected minutes of timed items
function deriveCollapseAfter(startTime: string | null, projectedMins: number): string | null {
  if (!startTime || projectedMins <= 0) return null;
  const total = toMinutes(startTime) + projectedMins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function isPastWindow(collapseAfter: string | null): boolean {
  if (!collapseAfter) return false;
  return minutesNow() >= toMinutes(collapseAfter);
}

function isBeforeWindow(startTime: string | null): boolean {
  if (!startTime) return false;
  return minutesNow() < toMinutes(startTime);
}

function isInWindow(startTime: string | null, collapseAfter: string | null): boolean {
  return !isBeforeWindow(startTime) && !isPastWindow(collapseAfter);
}

function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const STATE_COLOR: Record<LogState, string> = {
  in_progress: "text-amber",
  paused:      "text-amber",
  done:        "text-olive",
  missed:      "text-burgundy-light",
  rest:        "text-blue-muted",
};
const STATE_SYMBOL: Record<LogState, string> = {
  in_progress: "▶",
  paused:      "❚❚",
  done:        "✓",
  missed:      "✗",
  rest:        "~",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function RoutineGroupCard({
  group, logs, weekLogs, weekDates,
  isPastDate = false, selectedDate, today,
  onStateChange, onStartTimer, onStartRoutine,
  onOpenCheckIn, onOpenReview,
}: Props) {
  // Derive end time once we know what items are in this group
  const timedItemsAll = group.items.filter((i) => i.itemType !== "checkbox");
  const totalProjectedMins = timedItemsAll.reduce((s, i) => s + i.projectedMinutes, 0);
  const collapseAfter = deriveCollapseAfter(group.startTime, totalProjectedMins);

  const beforeWindow = useMemo(
    () => !isPastDate && isBeforeWindow(group.startTime),
    [group.startTime, isPastDate]
  );
  const pastTimeframe = useMemo(
    () => !isPastDate && isPastWindow(collapseAfter),
    [collapseAfter, isPastDate]
  );
  const inWindow = useMemo(
    () => !isPastDate && isInWindow(group.startTime, collapseAfter),
    [group.startTime, collapseAfter, isPastDate]
  );

  const visibleItems = useMemo(
    () => group.items.filter((i) => isItemVisibleOn(i, selectedDate)),
    [group.items, selectedDate]
  );

  // in_progress doesn't count as complete — the item is actively being timed
  const isComplete = visibleItems.length > 0 && visibleItems.every((i) => {
    const s = logs[i._id]?.state;
    return s === "done" || s === "missed" || s === "rest";
  });

  // Past dates: always start expanded so history is visible
  // Today: expand while inside the time window, collapse before it opens or after it closes
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (isPastDate) return false;
    if (isComplete) return true;
    if (inWindow || beforeWindow) return false; // active or upcoming → start open
    return true; // past window → start collapsed
  });
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Snap to complete summary only on today's view
  useEffect(() => {
    if (isComplete && !isPastDate) {
      const t = setTimeout(() => {
        setIsCollapsed(true);
        setExpandedItemId(null);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [isComplete, isPastDate]);

  const doneCount = visibleItems.filter((i) => logs[i._id]?.state === "done").length;
  const timedItems = visibleItems.filter((i) => i.itemType !== "checkbox");
  const projectedMins = timedItems.reduce((s, i) => s + i.projectedMinutes, 0);
  const actualMins = timedItems.reduce((s, i) => s + (logs[i._id]?.actualMinutes ?? 0), 0);
  const variance = actualMins - projectedMins;
  const actualColor =
    variance > 5 ? "text-tobacco" : variance < -5 ? "text-olive-light" : "text-muted";

  const isHabitGroup = group.timeOfDay === "habit";
  // Habit groups never collapse — each card shows its own state directly
  const effectivelyCollapsed = isCollapsed && !isHabitGroup;
  const toggle = () => { if (!isHabitGroup) setIsCollapsed((c) => !c); setExpandedItemId(null); };

  // Back-entry UX (Done + minutes input instead of timer) applies when:
  // - it's a different calendar day, OR
  // - it's today but the scheduled timeframe has passed
  const isBackEntry = isPastDate || pastTimeframe;

  return (
    <section>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 min-h-[44px]">
        <button className="flex items-center gap-2 text-left flex-1" onClick={toggle}>
          <h2 className="font-heading text-lg text-text">{group.name}</h2>
          {isComplete && !isPastDate ? (
            <span className="font-mono text-[10px] text-olive bg-olive/10 px-2 py-0.5 rounded-pill">
              ✓ Done
            </span>
          ) : beforeWindow && group.startTime ? (
            <span className="font-mono text-[10px] text-dim px-2 py-0.5 rounded-pill border border-border">
              starts {fmtTime(group.startTime)}
            </span>
          ) : pastTimeframe && !isComplete ? (
            <span className="font-mono text-[10px] text-dim px-2 py-0.5 rounded-pill border border-border">
              {collapseAfter ? `by ${fmtTime(collapseAfter)}` : "window passed"}
            </span>
          ) : null}
        </button>

        <div className="flex items-center gap-3">
          {!isComplete && (
            <span className="font-mono text-xs">
              <span className="text-gold">{doneCount}/{visibleItems.length}</span>
              <span className="text-dim"> · {fmtMins(projectedMins)}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Collapsed: complete summary ──────────────────────────────────── */}
      {effectivelyCollapsed && isComplete && (
        <button
          onClick={toggle}
          className="w-full text-left bg-card rounded-card border-l-[3px] border-olive px-4 py-3.5 hover:bg-card-hover transition-colors"
        >
          {projectedMins > 0 && (
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-xs text-dim">
                {fmtMins(projectedMins)} projected
              </span>
              <span className="font-mono text-dim text-xs">→</span>
              <span className={`font-mono text-xs font-medium ${actualColor}`}>
                {fmtMins(actualMins)} actual
              </span>
              {variance !== 0 && actualMins > 0 && (
                <span className={`font-mono text-[10px] ${actualColor} ml-auto`}>
                  {variance > 0 ? `+${fmtMins(variance)}` : `-${fmtMins(Math.abs(variance))}`}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {visibleItems.map((item) => {
              const log = logs[item._id];
              return (
                <span key={item._id} className="flex items-center gap-1">
                  <HabitIcon
                    name={item.icon}
                    size={14}
                    strokeWidth={1.75}
                    className={log ? STATE_COLOR[log.state] : "text-dim"}
                  />
                  <span
                    className={`font-mono text-[10px] leading-none font-semibold ${
                      log ? STATE_COLOR[log.state] : "text-dim"
                    }`}
                  >
                    {log ? STATE_SYMBOL[log.state] : "·"}
                  </span>
                </span>
              );
            })}
          </div>
        </button>
      )}

      {/* ── Collapsed: incomplete icon summary (today, timeframe elapsed) ── */}
      {effectivelyCollapsed && !isComplete && (
        <button
          onClick={toggle}
          className="w-full text-left bg-card rounded-card px-4 py-3.5 flex items-center gap-2 hover:bg-card-hover transition-colors"
        >
          <div className="flex flex-wrap gap-x-3 gap-y-2 flex-1">
            {visibleItems.map((item) => {
              const log = logs[item._id];
              return (
                <span key={item._id} className="flex items-center gap-1">
                  <HabitIcon
                    name={item.icon}
                    size={14}
                    strokeWidth={1.75}
                    className={log ? STATE_COLOR[log.state] : "text-dim opacity-40"}
                  />
                  {log && (
                    <span className={`font-mono text-[10px] leading-none font-semibold ${STATE_COLOR[log.state]}`}>
                      {STATE_SYMBOL[log.state]}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          {beforeWindow && group.startTime ? (
            <span className="ml-auto font-mono text-dim text-xs flex-shrink-0">
              starts {fmtTime(group.startTime)}
            </span>
          ) : collapseAfter ? (
            <span className="ml-auto font-mono text-dim text-xs flex-shrink-0">
              by {fmtTime(collapseAfter)}
            </span>
          ) : null}
        </button>
      )}

      {/* ── Expanded ────────────────────────────────────────────────────── */}
      {!effectivelyCollapsed && (
        <div>
          {group.timeOfDay === "habit" ? (
            <div className="space-y-2">
              {visibleItems.map((item) => (
                <HabitItemCard
                  key={item._id}
                  item={item}
                  log={logs[item._id]}
                  weekLogs={weekLogs[item._id] ?? []}
                  weekDates={weekDates}
                  today={today}
                  isBackEntry={isBackEntry}
                  onStartTimer={() => onStartTimer(item)}
                  onStateChange={(s, opts) => onStateChange(item._id, s, opts)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-card overflow-hidden divide-y divide-border">
              {visibleItems.map((item) => (
                <RoutineItemRow
                  key={item._id}
                  item={item}
                  log={logs[item._id]}
                  weekLogs={weekLogs[item._id] ?? []}
                  weekDates={weekDates}
                  today={today}
                  isExpanded={expandedItemId === item._id}
                  isBackEntry={isBackEntry}
                  selectedDate={selectedDate}
                  onToggleExpand={() =>
                    setExpandedItemId((prev) => (prev === item._id ? null : item._id))
                  }
                  onStartTimer={() => onStartTimer(item)}
                  onStateChange={(s, opts) => onStateChange(item._id, s, opts)}
                  onOpenCheckIn={() => onOpenCheckIn(item)}
                  onOpenReview={() => onOpenReview(item)}
                />
              ))}
            </div>
          )}

          {visibleItems.length > 0 && !isComplete && !isPastDate && group.timeOfDay !== "habit" && (() => {
            const hasStarted = visibleItems.some((i) => !!logs[i._id]);
            const firstIncompleteIdx = Math.max(0, visibleItems.findIndex((i) => logs[i._id]?.state !== "done"));
            return (
              <button
                onClick={() => onStartRoutine(group, firstIncompleteIdx)}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-olive text-text font-body font-medium py-3.5 rounded-card min-h-[48px] active:opacity-90 transition-opacity"
              >
                <Play size={15} fill="currentColor" />
                {hasStarted ? "Continue Routine" : "Start Routine"}
              </button>
            );
          })()}
        </div>
      )}
    </section>
  );
}
