"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { X, GripVertical, ChevronRight } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import HabitIcon from "@/components/HabitIcon";
import TimelineBar from "@/components/TimelineBar";
import { computeReviewTimeline } from "@/lib/routine-review-timeline";
import { staticBaselineFinish } from "@/lib/projected-finish";
import type { ReviewEntryPoint } from "@/models/RoutineLog";

// Distinct from the live green/amber/red pacing palette (RoutineSession.tsx)
// — this view is goal vs average, not live pacing, so it gets its own two
// flat colors instead of a per-segment state map.
const GOAL_COLOR = "#c4a84a"; // gold
const AVERAGE_COLOR = "#4a7a9a"; // blue-muted

interface GroupOption {
  _id: string;
  name: string;
  itemCount: number;
}

interface ReviewItem {
  _id: string;
  name: string;
  icon: string;
  order: number;
  projectedMinutes: number;
  avgActualMins: number | null;
}

interface ReviewData {
  group: { _id: string; name: string; startTime: string | null };
  items: ReviewItem[];
  avgStartMinutesUtc: number | null;
  startTimeSampleSize: number;
}

interface Props {
  date: string;
  initialGroupId: string | null;
  groupOptions: GroupOption[];
  entryPoint: ReviewEntryPoint;
  returnTo: string | null;
  reviewItemId: string | null;
}

type Screen = "pick" | "timeline" | "goals" | "order";

function fmtClockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function utcMinsToLocalLabel(utcMins: number): string {
  const d = new Date();
  d.setUTCHours(Math.floor(utcMins / 60) % 24, utcMins % 60, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function utcMinsPlusDurationToLocalLabel(utcMins: number, durationMins: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMinutes(utcMins + durationMins);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// ── Screen 2 row — tap to expand goal-time editor ────────────────────────────

function GoalEditRow({
  item,
  onSave,
}: {
  item: ReviewItem;
  onSave: (newMinutes: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(item.projectedMinutes));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const mins = Math.max(1, parseInt(value) || item.projectedMinutes);
    setSaving(true);
    await onSave(mins);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="bg-card">
      <button
        onClick={() => {
          setValue(String(item.projectedMinutes));
          setEditing((e) => !e);
        }}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[54px]"
      >
        <div className="w-7 flex items-center justify-center flex-shrink-0">
          <HabitIcon name={item.icon} size={17} className="text-muted" />
        </div>
        <span className="flex-1 font-body text-sm text-text truncate">{item.name}</span>
        <div className="text-right flex-shrink-0">
          <p className="font-mono text-xs text-gold">{item.projectedMinutes}m goal</p>
          <p className="font-mono text-[10px] text-blue-muted">
            {item.avgActualMins !== null ? `${item.avgActualMins}m avg` : "no data yet"}
          </p>
        </div>
      </button>

      {editing && (
        <div className="px-4 pb-4 pt-1 border-t border-border flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20 bg-bg border border-border rounded-card px-3 py-2 font-mono text-sm text-text outline-none focus:border-olive"
          />
          <span className="font-mono text-xs text-dim">min</span>
          {item.avgActualMins !== null && (
            <button
              onClick={() => setValue(String(item.avgActualMins))}
              className="font-mono text-[10px] text-blue-muted border border-blue-muted/40 rounded-pill px-3 py-1.5"
            >
              Use average
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto bg-olive/15 border border-olive/30 text-olive font-mono text-xs px-4 py-2 rounded-pill disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Screen 3 row — drag to reorder, display only ─────────────────────────────

function OrderRow({ item }: { item: ReviewItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-card flex items-center gap-3 px-4 py-3.5 min-h-[54px]">
      <button
        {...listeners}
        {...attributes}
        className="text-dim cursor-grab active:cursor-grabbing flex-shrink-0 p-1 touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <div className="w-7 flex items-center justify-center flex-shrink-0">
        <HabitIcon name={item.icon} size={17} className="text-muted" />
      </div>
      <span className="flex-1 font-body text-sm text-text truncate">{item.name}</span>
      <span className="font-mono text-dim text-xs flex-shrink-0">{item.projectedMinutes}m</span>
    </div>
  );
}

// ── Main flow ─────────────────────────────────────────────────────────────────

export default function RoutineReviewFlow({
  date, initialGroupId, groupOptions, entryPoint, returnTo, reviewItemId,
}: Props) {
  const router = useRouter();
  const flowStartedAt = useRef(Date.now());

  const [screen, setScreen] = useState<Screen>(initialGroupId ? "timeline" : "pick");
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(!!initialGroupId);

  const [items, setItems] = useState<ReviewItem[]>([]);
  const [itemGoalChanges, setItemGoalChanges] = useState<Array<{ routineItemId: string; oldMinutes: number; newMinutes: number }>>([]);

  const [startTime, setStartTime] = useState("");
  const [originalStartTime, setOriginalStartTime] = useState<string | null>(null);

  const [order, setOrder] = useState<string[]>([]);
  const [originalOrder, setOriginalOrder] = useState<string[]>([]);

  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    fetch(`/api/routine-review?groupId=${groupId}&localDate=${date}`)
      .then((r) => r.json())
      .then((data: ReviewData) => {
        setReviewData(data);
        setItems(data.items);
        setStartTime(data.group.startTime ?? "");
        setOriginalStartTime(data.group.startTime ?? null);
        const ids = data.items.map((i) => i._id);
        setOrder(ids);
        setOriginalOrder(ids);
        setLoading(false);
      });
  }, [groupId, date]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.findIndex((id) => id === active.id);
    const newIndex = order.findIndex((id) => id === over.id);
    setOrder(arrayMove(order, oldIndex, newIndex));
  }

  async function handleSaveGoal(item: ReviewItem, newMinutes: number) {
    if (newMinutes === item.projectedMinutes) return;
    await fetch(`/api/routine-items/${item._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectedMinutes: newMinutes }),
    });
    setItemGoalChanges((prev) => [
      ...prev.filter((c) => c.routineItemId !== item._id),
      { routineItemId: item._id, oldMinutes: item.projectedMinutes, newMinutes },
    ]);
    setItems((prev) => prev.map((i) => (i._id === item._id ? { ...i, projectedMinutes: newMinutes } : i)));
  }

  const orderedItems = useMemo(
    () => order.map((id) => items.find((i) => i._id === id)).filter((i): i is ReviewItem => !!i),
    [order, items]
  );

  const orderChanged = order.length > 0 && order.some((id, i) => id !== originalOrder[i]);
  const startTimeChanged = (startTime || null) !== originalStartTime;

  async function finish() {
    if (finishing) return;
    setFinishing(true);

    let startTimeChange: { old: string | null; new: string | null } | undefined;
    let reorder: { old: string[]; new: string[] } | undefined;

    // Only screen 3 can produce start-time/order changes — everything else
    // (goal edits) is already committed per-row as it happens.
    if (screen === "order") {
      if (startTimeChanged && reviewData) {
        await fetch(`/api/routines/${reviewData.group._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startTime: startTime || null }),
        });
        startTimeChange = { old: originalStartTime, new: startTime || null };
      }
      if (orderChanged) {
        await fetch("/api/routine-items/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: order.map((id, idx) => ({ _id: id, order: idx })) }),
        });
        reorder = { old: originalOrder, new: order };
      }
    }

    const changesMade = itemGoalChanges.length > 0 || !!startTimeChange || !!reorder;
    const actualMinutes = Math.max(1, Math.round((Date.now() - flowStartedAt.current) / 60000));

    if (reviewItemId) {
      await fetch("/api/routine-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routineItemId: reviewItemId,
          date,
          state: changesMade ? "done" : "rest",
          actualMinutes,
          reviewMetadata: reviewData
            ? {
                entryPoint,
                groupId: reviewData.group._id,
                changesMade,
                ...(itemGoalChanges.length > 0 ? { itemGoalChanges } : {}),
                ...(startTimeChange ? { startTimeChange } : {}),
                ...(reorder ? { reorder } : {}),
              }
            : undefined,
        }),
      });
    }

    router.push(returnTo === "analytics" ? "/analytics" : "/routines");
  }

  const goalTimeline = computeReviewTimeline(orderedItems.map((i) => ({ id: i._id, minutes: i.projectedMinutes })));
  const avgTimeline = computeReviewTimeline(orderedItems.map((i) => ({ id: i._id, minutes: i.avgActualMins ?? i.projectedMinutes })));

  const goalStartLabel = startTime ? fmtClockLabel(startTime) : "—";
  const goalEndDate = startTime ? staticBaselineFinish(date, startTime, goalTimeline.totalMinutes) : null;
  const goalEndLabel = goalEndDate
    ? goalEndDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : "—";

  const hasAvgStart = reviewData != null && reviewData.avgStartMinutesUtc != null && reviewData.startTimeSampleSize >= 2;
  const avgStartLabel = hasAvgStart ? utcMinsToLocalLabel(reviewData!.avgStartMinutesUtc!) : "—";
  const avgEndLabel = hasAvgStart
    ? utcMinsPlusDurationToLocalLabel(reviewData!.avgStartMinutesUtc!, avgTimeline.totalMinutes)
    : "—";

  const liveProjectedEnd = useMemo(() => {
    if (!startTime) return null;
    const totalGoalMins = orderedItems.reduce((s, i) => s + i.projectedMinutes, 0);
    return staticBaselineFinish(date, startTime, totalGoalMins);
  }, [startTime, orderedItems, date]);

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile">
        <header className="flex items-center gap-3 px-4 pt-10 pb-4 border-b border-border">
          <div className="flex-1">
            <p className="font-mono text-[9px] uppercase tracking-widest text-gold mb-0.5">Routine Review</p>
            <h1 className="font-heading text-lg text-text">{reviewData?.group.name ?? "Choose a routine"}</h1>
          </div>
          <button
            onClick={finish}
            disabled={finishing}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-card text-dim disabled:opacity-50"
            aria-label="Not now"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-4 pt-5 pb-28">
          {/* Step 0 — group picker */}
          {screen === "pick" && (
            <div className="space-y-2">
              <p className="font-mono text-[10px] text-dim mb-2">Which routine do you want to review?</p>
              {groupOptions.length === 0 && (
                <p className="font-mono text-xs text-dim py-8 text-center">No timed routines to review yet.</p>
              )}
              {groupOptions.map((g) => (
                <button
                  key={g._id}
                  onClick={() => {
                    setGroupId(g._id);
                    setScreen("timeline");
                  }}
                  className="w-full flex items-center justify-between bg-card rounded-card border border-border px-4 py-3.5 hover:bg-card-hover transition-colors min-h-[54px]"
                >
                  <span className="font-body text-sm text-text">{g.name}</span>
                  <span className="font-mono text-dim text-xs">{g.itemCount} habits</span>
                </button>
              ))}
            </div>
          )}

          {loading && screen !== "pick" && (
            <p className="text-dim font-mono text-xs text-center py-16">Loading…</p>
          )}

          {!loading && reviewData && screen === "timeline" && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: GOAL_COLOR }} />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-dim">Goal</p>
                </div>
                <TimelineBar
                  segments={goalTimeline.segments.map((s) => ({ id: s.id, pct: s.pct, color: GOAL_COLOR }))}
                  startLabel={goalStartLabel}
                  endLabel={goalEndLabel}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: AVERAGE_COLOR }} />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-dim">Actual avg (last 28 days)</p>
                </div>
                {hasAvgStart ? (
                  <TimelineBar
                    segments={avgTimeline.segments.map((s) => ({ id: s.id, pct: s.pct, color: AVERAGE_COLOR }))}
                    startLabel={avgStartLabel}
                    endLabel={avgEndLabel}
                  />
                ) : (
                  <p className="font-mono text-xs text-dim">Not enough logged days yet to average.</p>
                )}
              </div>

              <button
                onClick={() => setScreen("goals")}
                className="w-full flex items-center justify-center gap-1.5 bg-olive text-text py-3.5 rounded-card font-body text-sm font-medium min-h-[44px]"
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}

          {!loading && reviewData && screen === "goals" && (
            <div className="space-y-4">
              <p className="font-mono text-[10px] text-dim">Tap a habit to accept its average or set a custom goal.</p>
              <div className="rounded-card overflow-hidden divide-y divide-border border border-border">
                {items.map((item) => (
                  <GoalEditRow key={item._id} item={item} onSave={(mins) => handleSaveGoal(item, mins)} />
                ))}
              </div>
              <button
                onClick={() => setScreen("order")}
                className="w-full flex items-center justify-center gap-1.5 bg-olive text-text py-3.5 rounded-card font-body text-sm font-medium min-h-[44px]"
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}

          {!loading && reviewData && screen === "order" && (
            <div className="space-y-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5">Usually</p>
                <p className="font-mono text-xs text-dim">
                  {avgStartLabel} <span className="text-dim">→</span> {avgEndLabel}
                </p>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
                  Start time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-40 bg-bg border border-border rounded-card px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-olive"
                />
                {liveProjectedEnd && (
                  <p className="font-mono text-[10px] text-dim mt-1.5">
                    Projected finish{" "}
                    <span className="text-text">
                      {liveProjectedEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
                  Order
                </label>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={order} strategy={verticalListSortingStrategy}>
                    <div className="rounded-card overflow-hidden divide-y divide-border border border-border">
                      {orderedItems.map((item) => (
                        <OrderRow key={item._id} item={item} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              <button
                onClick={finish}
                disabled={finishing}
                className="w-full bg-olive text-text py-3.5 rounded-card font-body text-sm font-medium min-h-[44px] disabled:opacity-50"
              >
                {finishing ? "Saving…" : "Finish review"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
