"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import StreakDots from "@/components/StreakDots";
import HabitIcon from "@/components/HabitIcon";
import type { RoutineLogEntry } from "@/components/RoutinesView";
import type { LogState } from "@/models/RoutineLog";

export interface RowItem {
  _id: string;
  name: string;
  icon: string;
  projectedMinutes: number;
  order: number;
  itemType?: "standard" | "stopwatch" | "checkbox" | "virtue_checkin" | "weekly_review" | "routine_review";
  scheduledDays: number[];   // 0=Sun..6=Sat — which days this item is expected
  successThreshold: number;  // how many of this week's scheduled days = 100%
}

interface Props {
  item: RowItem;
  log?: RoutineLogEntry;
  weekLogs: Array<{ date: string; state: LogState; actualMinutes: number | null }>;
  weekDates: string[]; // Sunday→Saturday, fixed calendar week
  isExpanded: boolean;
  isBackEntry: boolean;
  selectedDate: string;
  today: string; // YYYY-MM-DD — marks today's dot and what counts as "future" in StreakDots
  onToggleExpand: () => void;
  onStartTimer: () => void;
  onStateChange: (state: LogState | null, opts?: { actualMinutes?: number; isBackEntry?: boolean; startedAt?: string; completedAt?: string }) => void;
  onOpenCheckIn?: () => void;
  onOpenReview?: () => void;
  onOpenRoutineReview?: () => void;
}

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Convert a UTC ISO string to "HH:MM" in the browser's local timezone
function isoToLocalTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

// Compute duration in minutes between two local "HH:MM" inputs on a given local date.
// new Date("YYYY-MM-DDT HH:MM:00") is parsed as local time by JS engines.
function calcMinutes(date: string, start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = new Date(`${date}T${start}:00`).getTime();
  const e = new Date(`${date}T${end}:00`).getTime();
  if (e <= s) return null;
  return Math.max(1, Math.round((e - s) / 60000));
}

const BORDER: Record<LogState, string> = {
  in_progress: "border-l-[3px] border-l-amber",
  paused:      "border-l-[3px] border-l-amber",
  done:        "border-l-[3px] border-l-olive",
  missed:      "border-l-[3px] border-l-burgundy",
  rest:        "border-l-[3px] border-l-blue-muted",
};

const BADGE: Record<LogState, string> = {
  in_progress: "text-amber bg-amber/10",
  paused:      "text-amber bg-amber/10",
  done:        "text-olive bg-olive/10",
  missed:      "text-burgundy-light bg-burgundy/10",
  rest:        "text-blue-muted bg-blue-muted/10",
};

const LABEL: Record<LogState, string> = {
  in_progress: "Active",
  paused:      "Paused",
  done:        "Done",
  missed:      "Missed",
  rest:        "Rest",
};

export default function RoutineItemRow({
  item, log, weekLogs, weekDates,
  isExpanded, isBackEntry, selectedDate, today,
  onToggleExpand, onStartTimer, onStateChange,
  onOpenCheckIn, onOpenReview, onOpenRoutineReview,
}: Props) {
  const state = log?.state ?? null;
  const [backMins, setBackMins] = useState(
    item.itemType === "stopwatch" ? "30" : String(item.projectedMinutes)
  );
  const [editingTime, setEditingTime] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const dow = new Date(selectedDate + "T12:00:00").getDay();
  const isSunday = dow === 0;
  const isCheckbox = item.itemType === "checkbox";
  const isStopwatch = item.itemType === "stopwatch";
  const isSpecial = item.itemType === "virtue_checkin" || item.itemType === "weekly_review" || item.itemType === "routine_review";
  const isTimeable = !isCheckbox && !isSpecial;

  const variance =
    !isCheckbox && !isStopwatch && state === "done" && log?.actualMinutes != null
      ? log.actualMinutes - item.projectedMinutes
      : null;

  // Duration live-calculated from the two time inputs
  const calcedMins = calcMinutes(selectedDate, startTime, endTime);

  function openTimeEdit() {
    if (log?.startedAt) setStartTime(isoToLocalTimeInput(log.startedAt));
    else setStartTime("");
    if (log?.completedAt) setEndTime(isoToLocalTimeInput(log.completedAt));
    else setEndTime("");
    setEditingTime(true);
  }

  function handleSaveTime() {
    if (calcedMins === null) return;
    const startedAt = new Date(`${selectedDate}T${startTime}:00`).toISOString();
    const completedAt = new Date(`${selectedDate}T${endTime}:00`).toISOString();
    onStateChange("done", { startedAt, completedAt });
    setEditingTime(false);
  }

  // Time editing form — shown instead of the normal action panel when active
  const timeEditPanel = (
    <div className="space-y-3">
      <p className="font-mono text-[10px] text-dim uppercase tracking-widest">
        {state === "done" ? "Edit Time" : "Log Time"}
      </p>

      <div className="flex gap-2">
        <div className="flex-1">
          <p className="font-mono text-[9px] text-dim mb-1.5">Started</p>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full bg-bg border border-border-light rounded-card px-3 py-2.5 font-mono text-sm text-text min-h-[44px]"
          />
        </div>
        <div className="flex-1">
          <p className="font-mono text-[9px] text-dim mb-1.5">Finished</p>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full bg-bg border border-border-light rounded-card px-3 py-2.5 font-mono text-sm text-text min-h-[44px]"
          />
        </div>
      </div>

      <div className="flex items-center justify-center h-5">
        {calcedMins !== null ? (
          <span className="font-mono text-xs">
            <span className="text-olive font-medium">{fmtMins(calcedMins)}</span>
            <span className="text-dim"> recorded</span>
          </span>
        ) : startTime && endTime ? (
          <span className="font-mono text-xs text-burgundy-light">End must be after start</span>
        ) : (
          <span className="font-mono text-[10px] text-dim">enter start and end time</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setEditingTime(false)}
          className="flex-1 border border-border-light text-dim py-2.5 rounded-card text-sm font-body min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveTime}
          disabled={calcedMins === null}
          className="flex-1 bg-olive text-text py-2.5 rounded-card text-sm font-body font-medium min-h-[44px] disabled:opacity-30 transition-opacity"
        >
          {calcedMins !== null ? `Save · ${fmtMins(calcedMins)}` : "Save"}
        </button>
      </div>
    </div>
  );

  return (
    <div className={state ? BORDER[state] : ""}>
      {/* Tap row */}
      <button
        onClick={onToggleExpand}
        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[54px] transition-colors ${
          isExpanded ? "bg-card-hover" : ""
        }`}
      >
        <div className="w-7 flex items-center justify-center flex-shrink-0">
          <HabitIcon name={item.icon} size={18} className="text-muted" />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={`font-body text-sm leading-tight ${
              state === "done"
                ? "text-dim line-through"
                : state === "missed"
                ? "text-dim"
                : "text-text"
            }`}
          >
            {item.name}
          </p>
          <div className="mt-1.5">
            <StreakDots
              logs={weekLogs}
              dates={weekDates}
              today={today}
              viewingDate={selectedDate}
              scheduledDays={item.scheduledDays}
              successThreshold={item.successThreshold}
              targetMinutes={!isCheckbox && !isStopwatch && !isSpecial ? item.projectedMinutes : null}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {state ? (
            <>
              {variance !== null && (
                <span
                  className={`font-mono text-xs ${
                    variance > 0 ? "text-tobacco" : "text-olive-light"
                  }`}
                >
                  {variance > 0 ? `+${variance}m` : `${variance}m`}
                </span>
              )}
              <span className={`font-mono text-xs px-2 py-0.5 rounded-pill ${BADGE[state]}`}>
                {LABEL[state]}
              </span>
            </>
          ) : isCheckbox ? (
            <span className="font-mono text-dim text-xs">✓</span>
          ) : isStopwatch ? (
            <span className="font-mono text-dim text-xs">⏱</span>
          ) : (
            <span className="font-mono text-dim text-xs">{fmtMins(item.projectedMinutes)}</span>
          )}
          <span className="text-dim text-[10px] ml-1">{isExpanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {/* Action panel */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {editingTime ? timeEditPanel : state === "in_progress" || state === "paused" ? (
            <>
              <button
                onClick={onStartTimer}
                className="w-full flex items-center justify-between bg-amber/10 hover:bg-amber/20 border border-amber/30 text-text py-3 px-4 rounded-card transition-colors min-h-[44px]"
              >
                <span className="font-body text-sm font-medium">▶ Resume Timer</span>
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => onStateChange("missed", { isBackEntry })}
                  className="flex-1 border border-burgundy/40 hover:border-burgundy text-burgundy-light py-2.5 rounded-card text-sm font-body transition-colors min-h-[44px]"
                >
                  ✗ Missed
                </button>
                <button
                  onClick={() => onStateChange(null)}
                  className="flex-1 border border-border-light text-dim py-2.5 rounded-card text-sm font-body transition-colors min-h-[44px]"
                >
                  Undo
                </button>
              </div>
            </>
          ) : !state ? (
            <>
              {/* Special item types */}
              {item.itemType === "virtue_checkin" && (
                <button
                  onClick={onOpenCheckIn}
                  className="w-full flex items-center justify-between bg-gold/10 hover:bg-gold/20 border border-gold/30 text-text py-3 px-4 rounded-card transition-colors min-h-[44px]"
                >
                  <span className="font-body text-sm font-medium">✦ Check In</span>
                  <span className="font-mono text-gold text-xs">{fmtMins(item.projectedMinutes)}</span>
                </button>
              )}

              {item.itemType === "weekly_review" && (
                isSunday ? (
                  <button
                    onClick={onOpenReview}
                    className="w-full flex items-center justify-between bg-gold/10 hover:bg-gold/20 border border-gold/30 text-text py-3 px-4 rounded-card transition-colors min-h-[44px]"
                  >
                    <span className="font-body text-sm font-medium">☰ Weekly Review</span>
                    <span className="font-mono text-gold text-xs">{fmtMins(item.projectedMinutes)}</span>
                  </button>
                ) : (
                  <div className="px-4 py-3 rounded-card bg-bg border border-border">
                    <p className="font-mono text-xs text-dim">Sunday habit — skip or rest for today</p>
                  </div>
                )
              )}

              {item.itemType === "routine_review" && (
                isSunday ? (
                  <button
                    onClick={onOpenRoutineReview}
                    className="w-full flex items-center justify-between bg-gold/10 hover:bg-gold/20 border border-gold/30 text-text py-3 px-4 rounded-card transition-colors min-h-[44px]"
                  >
                    <span className="font-body text-sm font-medium">☰ Routine Review</span>
                    <span className="font-mono text-gold text-xs">{fmtMins(item.projectedMinutes)}</span>
                  </button>
                ) : (
                  <div className="px-4 py-3 rounded-card bg-bg border border-border">
                    <p className="font-mono text-xs text-dim">Sunday habit — skip or rest for today</p>
                  </div>
                )
              )}

              {/* Checkbox: simple done, no timer */}
              {isCheckbox && (
                <button
                  onClick={() => onStateChange("done", { isBackEntry })}
                  className="w-full flex items-center justify-center gap-2 bg-olive/10 hover:bg-olive/20 border border-olive/30 text-text py-3 px-4 rounded-card transition-colors min-h-[44px]"
                >
                  <span className="font-body text-sm font-medium">✓ Done</span>
                </button>
              )}

              {/* Standard / Stopwatch */}
              {isTimeable && (
                isBackEntry ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        onStateChange("done", {
                          actualMinutes: Math.max(1, parseInt(backMins) || item.projectedMinutes),
                          isBackEntry: true,
                        })
                      }
                      className="flex-1 flex items-center justify-center gap-2 bg-olive/10 hover:bg-olive/20 border border-olive/30 text-text py-3 px-4 rounded-card transition-colors min-h-[44px]"
                    >
                      <span className="font-body text-sm font-medium">✓ Done</span>
                    </button>
                    <div className="flex items-center gap-1 bg-bg border border-border rounded-card px-3 py-2 min-h-[44px]">
                      <input
                        type="number"
                        min={1}
                        value={backMins}
                        onChange={(e) => setBackMins(e.target.value)}
                        className="w-10 bg-transparent font-mono text-sm text-text outline-none text-right"
                      />
                      <span className="font-mono text-dim text-xs">m</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onStartTimer}
                    className="w-full flex items-center justify-between bg-olive/10 hover:bg-olive/20 border border-olive/30 text-text py-3 px-4 rounded-card transition-colors min-h-[44px]"
                  >
                    <span className="font-body text-sm font-medium">▶ {isStopwatch ? "Start Stopwatch" : "Start Timer"}</span>
                    {!isStopwatch && <span className="font-mono text-olive-light text-xs">{fmtMins(item.projectedMinutes)}</span>}
                  </button>
                )
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => onStateChange("missed", { isBackEntry })}
                  className="flex-1 border border-burgundy/40 hover:border-burgundy text-burgundy-light py-2.5 rounded-card text-sm font-body transition-colors min-h-[44px]"
                >
                  ✗ Missed
                </button>
                <button
                  onClick={() => onStateChange("rest", { isBackEntry })}
                  className="flex-1 border border-blue-muted/40 hover:border-blue-muted text-blue-muted py-2.5 rounded-card text-sm font-body transition-colors min-h-[44px]"
                >
                  ~ Rest
                </button>
              </div>

            </>
          ) : (
            // Already logged (done / missed / rest)
            <div className="space-y-2">
              {/* Edit time — primary action for done timeable items */}
              {state === "done" && isTimeable && (
                <button
                  onClick={openTimeEdit}
                  className="w-full flex items-center justify-between bg-card-hover hover:bg-border/40 border border-border-light text-text py-3 px-4 rounded-card transition-colors min-h-[44px]"
                >
                  <span className="font-body text-sm font-medium flex items-center gap-1.5"><Pencil size={13} strokeWidth={1.75} />Edit time</span>
                  {log?.actualMinutes != null && (
                    <span className="font-mono text-dim text-xs">{fmtMins(log.actualMinutes)} logged</span>
                  )}
                </button>
              )}

              {/* Retimer for missed/rest items */}
              {state !== "done" && isTimeable && (
                isBackEntry ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        onStateChange("done", {
                          actualMinutes: Math.max(1, parseInt(backMins) || item.projectedMinutes),
                          isBackEntry: true,
                        })
                      }
                      className="flex-1 border border-olive/40 text-olive py-2.5 rounded-card text-sm font-body min-h-[44px]"
                    >
                      ✓ Done
                    </button>
                    <div className="flex items-center gap-1 bg-bg border border-border rounded-card px-3 py-2 min-h-[44px]">
                      <input
                        type="number"
                        min={1}
                        value={backMins}
                        onChange={(e) => setBackMins(e.target.value)}
                        className="w-10 bg-transparent font-mono text-sm text-text outline-none text-right"
                      />
                      <span className="font-mono text-dim text-xs">m</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onStartTimer}
                    className="flex-1 w-full border border-olive/40 text-olive py-2.5 rounded-card text-sm font-body min-h-[44px]"
                  >
                    ▶ Retimer
                  </button>
                )
              )}

              {/* State-change row */}
              <div className="flex gap-2">
                {state !== "missed" && (
                  <button
                    onClick={() => onStateChange("missed", { isBackEntry })}
                    className="flex-1 border border-burgundy/40 text-burgundy-light py-2.5 rounded-card text-sm font-body min-h-[44px]"
                  >
                    ✗ Missed
                  </button>
                )}
                {state !== "rest" && (
                  <button
                    onClick={() => onStateChange("rest", { isBackEntry })}
                    className="flex-1 border border-blue-muted/40 text-blue-muted py-2.5 rounded-card text-sm font-body min-h-[44px]"
                  >
                    ~ Rest
                  </button>
                )}
                <button
                  onClick={() => onStateChange(null)}
                  className="flex-1 border border-border-light text-dim py-2.5 rounded-card text-sm font-body min-h-[44px]"
                >
                  Undo
                </button>
              </div>

              {/* Log with times for missed/rest items */}
              {state !== "done" && isTimeable && (
                <button
                  onClick={openTimeEdit}
                  className="w-full border border-border text-dim py-2 rounded-card font-mono text-xs min-h-[36px] hover:border-border-light transition-colors"
                >
                  ⏱ Log with specific times
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
