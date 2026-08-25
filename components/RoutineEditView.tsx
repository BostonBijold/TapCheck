"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { GripVertical, X, ChevronDown, ChevronUp, Check } from "lucide-react";
import HabitIcon, { IconPicker } from "@/components/HabitIcon";
import AddHabitSheet from "@/components/AddHabitSheet";

export interface EditItem {
  _id: string;
  name: string;
  icon: string;
  projectedMinutes: number;
  order: number;
  itemType: "standard" | "stopwatch" | "checkbox";
  scheduledDays: number[];  // 0=Sun..6=Sat — which days this item is expected
  successThreshold: number; // how many of this week's scheduled days = 100%
  appIntentLastTriggeredAt: string | null; // last time a Siri/Shortcuts App Intent triggered this item, if ever
}

interface Props {
  group: { _id: string; name: string; startTime: string | null };
  items: EditItem[];
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat, matches calendarWeekDates order

// ── Sortable row ─────────────────────────────────────────────────────────────

function SortableRow({
  item,
  isEditing,
  onToggleEdit,
  onSave,
  onRemove,
}: {
  item: EditItem;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSave: (
    name: string,
    icon: string,
    projectedMinutes: number,
    itemType: "standard" | "stopwatch" | "checkbox",
    scheduledDays: number[],
    successThreshold: number
  ) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  const [editName, setEditName] = useState(item.name);
  const [editIcon, setEditIcon] = useState(item.icon);
  const [editMins, setEditMins] = useState(String(item.projectedMinutes));
  const [editType, setEditType] = useState<"standard" | "stopwatch" | "checkbox">(item.itemType);
  const [editScheduledDays, setEditScheduledDays] = useState<number[]>(item.scheduledDays);
  const [editThreshold, setEditThreshold] = useState(item.successThreshold);
  const [saving, setSaving] = useState(false);

  function toggleEditDay(day: number) {
    setEditScheduledDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort();
      setEditThreshold((t) => Math.min(t, Math.max(next.length, 1)));
      return next;
    });
  }

  const handleSave = async () => {
    setSaving(true);
    const mins = editType === "standard" ? (parseInt(editMins) || item.projectedMinutes) : 0;
    await onSave(editName.trim() || item.name, editIcon || item.icon, mins, editType, editScheduledDays, editThreshold);
    setSaving(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-card">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3.5 min-h-[54px]">
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

        <span className="font-mono text-dim text-xs flex-shrink-0 mr-2">
          {item.itemType === "checkbox" ? "✓" : `${item.projectedMinutes}m`}
        </span>

        <button
          onClick={onToggleEdit}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-dim hover:text-muted transition-colors"
          aria-label={isEditing ? "Collapse" : "Edit"}
        >
          {isEditing ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <button
          onClick={onRemove}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-burgundy/10 hover:bg-burgundy/20 text-burgundy-light transition-colors"
          aria-label="Remove"
        >
          <X size={14} />
        </button>
      </div>

      {/* Inline edit form */}
      {isEditing && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
          {/* Type toggle */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
              Type
            </label>
            <div className="flex bg-bg border border-border rounded-card p-0.5">
              <button
                type="button"
                onClick={() => setEditType("standard")}
                className={`flex-1 py-1.5 rounded-card font-mono text-xs transition-colors ${
                  editType === "standard" ? "bg-olive text-text" : "text-dim"
                }`}
              >
                ▶ Countdown
              </button>
              <button
                type="button"
                onClick={() => setEditType("stopwatch")}
                className={`flex-1 py-1.5 rounded-card font-mono text-xs transition-colors ${
                  editType === "stopwatch" ? "bg-olive text-text" : "text-dim"
                }`}
              >
                ⏱ Stopwatch
              </button>
              <button
                type="button"
                onClick={() => setEditType("checkbox")}
                className={`flex-1 py-1.5 rounded-card font-mono text-xs transition-colors ${
                  editType === "checkbox" ? "bg-olive text-text" : "text-dim"
                }`}
              >
                ✓ Checkbox
              </button>
            </div>
          </div>
          {/* Name + Minutes */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-olive"
              />
            </div>
            {editType === "standard" && (
              <div className="flex-shrink-0 w-20">
                <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
                  Minutes
                </label>
                <input
                  type="number"
                  value={editMins}
                  onChange={(e) => setEditMins(e.target.value)}
                  min={1}
                  className="w-full bg-bg border border-border rounded-card px-3 py-2 font-mono text-sm text-text outline-none focus:border-olive"
                />
              </div>
            )}
          </div>
          {/* Icon picker */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
              Icon
            </label>
            <IconPicker selected={editIcon} onSelect={setEditIcon} />
          </div>
          {/* Schedule */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
              Days expected
            </label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleEditDay(day)}
                  className={`w-8 h-8 rounded-full font-mono text-xs transition-colors ${
                    editScheduledDays.includes(day)
                      ? "bg-olive text-text"
                      : "bg-bg border border-border text-dim"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Threshold */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
              Counts as a win when done
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={editThreshold}
                onChange={(e) =>
                  setEditThreshold(Math.max(1, Math.min(parseInt(e.target.value) || 1, editScheduledDays.length)))
                }
                min={1}
                max={Math.max(editScheduledDays.length, 1)}
                className="w-16 bg-bg border border-border rounded-card px-3 py-2 font-mono text-sm text-text outline-none focus:border-olive"
              />
              <span className="font-mono text-xs text-dim">
                of {editScheduledDays.length} scheduled day{editScheduledDays.length === 1 ? "" : "s"} this week
              </span>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-olive/15 border border-olive/30 text-olive font-mono text-xs px-4 py-2 rounded-pill disabled:opacity-50"
          >
            <Check size={12} />
            {saving ? "Saving…" : "Save changes"}
          </button>

          {/* Siri & Shortcuts connection — there's no way to detect a
              Shortcut was *built* for this habit (Apple gives no hook for
              that), only that one has *run* — so this reflects usage, not
              configuration, and doesn't preclude multiple Shortcuts also
              pointing at this habit. */}
          {item.appIntentLastTriggeredAt && (
            <div className="pt-2 border-t border-border">
              <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5">
                Siri &amp; Shortcuts
              </p>
              <p className="font-mono text-[11px] text-olive">
                Connected · last used {new Date(item.appIntentLastTriggeredAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* For the external API (see Profile > External API Key) */}
          <div className="pt-2 border-t border-border">
            <p className="font-mono text-[9px] uppercase tracking-widest text-dim mb-1">
              Item ID
            </p>
            <p className="font-mono text-[10px] text-dim break-all select-all">{item._id}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RoutineEditView({ group, items: initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<EditItem[]>(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Group schedule state
  const [startTime, setStartTime] = useState(group.startTime ?? "");
  const [scheduleChanged, setScheduleChanged] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  async function saveSchedule() {
    setSavingSchedule(true);
    await fetch(`/api/routines/${group._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTime: startTime || null }),
    });
    setSavingSchedule(false);
    setScheduleChanged(false);
    setScheduleSaved(true);
    setTimeout(() => setScheduleSaved(false), 2000);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i._id === active.id);
    const newIndex = items.findIndex((i) => i._id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    await fetch("/api/routine-items/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: reordered.map((it, idx) => ({ _id: it._id, order: idx })) }),
    });
  };

  const handleSaveItem = async (
    id: string,
    name: string,
    icon: string,
    projectedMinutes: number,
    itemType: "standard" | "stopwatch" | "checkbox",
    scheduledDays: number[],
    successThreshold: number
  ) => {
    setItems((prev) =>
      prev.map((it) => (it._id === id ? { ...it, name, icon, projectedMinutes, itemType, scheduledDays, successThreshold } : it))
    );
    setEditingId(null);
    await fetch(`/api/routine-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon, projectedMinutes, itemType, scheduledDays, successThreshold }),
    });
    router.refresh(); // invalidate routines page cache
  };

  const handleRemove = async (id: string) => {
    setItems((prev) => prev.filter((it) => it._id !== id));
    await fetch(`/api/routine-items/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const handleAdd = async (
    templateId: string | null,
    name: string,
    icon: string,
    projectedMinutes: number,
    itemType: "standard" | "stopwatch" | "checkbox" = "standard",
    scheduledDays: number[] = [0, 1, 2, 3, 4, 5, 6],
    successThreshold: number = 7
  ) => {
    const res = await fetch("/api/routine-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: group._id, templateId, name, icon, projectedMinutes, itemType, scheduledDays, successThreshold }),
    });
    const newItem = await res.json();
    // Push directly into local state — don't wait for a server round-trip
    setItems((prev) => [
      ...prev,
      {
        _id: newItem._id,
        name: newItem.name,
        icon: newItem.icon,
        projectedMinutes: newItem.projectedMinutes,
        itemType: (newItem.itemType ?? "standard") as "standard" | "stopwatch" | "checkbox",
        order: prev.length,
        scheduledDays: newItem.scheduledDays ?? scheduledDays,
        successThreshold: newItem.successThreshold ?? successThreshold,
        appIntentLastTriggeredAt: null,
      },
    ]);
    setShowAddSheet(false);
    router.refresh(); // invalidate routines page cache for when user navigates back
  };

  const totalMins = items.filter((i) => i.itemType !== "checkbox").reduce((s, i) => s + i.projectedMinutes, 0);
  const fmtTotal = totalMins < 60
    ? `${totalMins}m`
    : `${Math.floor(totalMins / 60)}h ${totalMins % 60 > 0 ? `${totalMins % 60}m` : ""}`.trim();

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 pt-10 pb-4 border-b border-border">
          <Link
            href="/routines"
            className="font-mono text-dim text-sm flex items-center gap-1 min-h-[44px] pr-2"
          >
            ← Routines
          </Link>
          <div className="flex-1 text-center">
            <h1 className="font-heading text-lg text-text">{group.name}</h1>
            <p className="font-mono text-dim text-xs">{items.length} habits · {fmtTotal}</p>
          </div>
          <div className="w-20" /> {/* balance the back link */}
        </header>

        {/* Schedule */}
        <div className="px-4 py-4 border-b border-border">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
            Time Window
          </p>
          <div className="flex gap-3 mb-3">
            <div className="w-40">
              <label className="font-mono text-[10px] text-dim block mb-1.5">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => { setStartTime(e.target.value); setScheduleChanged(true); setScheduleSaved(false); }}
                className="w-full bg-bg border border-border rounded-card px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-olive"
              />
            </div>
          </div>
          {startTime && (
            <p className="font-mono text-[10px] text-dim mb-3">
              Opens at {startTime} · closes after all habits are done
            </p>
          )}
          {scheduleChanged && (
            <button
              onClick={saveSchedule}
              disabled={savingSchedule}
              className="flex items-center gap-1.5 bg-olive/15 border border-olive/30 text-olive font-mono text-xs px-4 py-2 rounded-pill disabled:opacity-50"
            >
              <Check size={12} />
              {savingSchedule ? "Saving…" : "Save schedule"}
            </button>
          )}
          {scheduleSaved && (
            <p className="font-mono text-[10px] text-olive">Schedule saved</p>
          )}
        </div>

        {/* For the external API (see Profile > External API Key) */}
        <div className="px-4 py-3 border-b border-border">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1">
            Group ID
          </p>
          <p className="font-mono text-[11px] text-muted break-all select-all">{group._id}</p>
        </div>

        {/* Sortable list */}
        <div className="px-4 pt-5 pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((i) => i._id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="rounded-card overflow-hidden divide-y divide-border border border-border">
                {items.map((item) => (
                  <SortableRow
                    key={item._id}
                    item={item}
                    isEditing={editingId === item._id}
                    onToggleEdit={() =>
                      setEditingId((prev) => (prev === item._id ? null : item._id))
                    }
                    onSave={(name, icon, mins, type, days, threshold) => handleSaveItem(item._id, name, icon, mins, type, days, threshold)}
                    onRemove={() => handleRemove(item._id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {items.length === 0 && (
            <div className="text-center py-10">
              <p className="text-dim font-mono text-xs">No habits yet. Add one below.</p>
            </div>
          )}

          {/* Add habit */}
          <button
            onClick={() => setShowAddSheet(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-4 rounded-card hover:border-olive/40 hover:text-olive transition-colors min-h-[44px]"
          >
            + Add habit to {group.name}
          </button>
        </div>
      </div>

      {showAddSheet && (
        <AddHabitSheet
          groupId={group._id}
          groupName={group.name}
          onAdd={handleAdd}
          onClose={() => setShowAddSheet(false)}
        />
      )}
    </div>
  );
}
