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
import AppIcon, { IconPicker } from "@/components/AppIcon";
import AddTaskSheet from "@/components/AddTaskSheet";
import TaskFieldsEditor from "@/components/TaskFieldsEditor";
import NfcTagLinkedSetup from "@/components/NfcTagLinkedSetup";
import { scanNfcTag } from "@/lib/native/nfc-scan";
import { Capacitor } from "@capacitor/core";
import type { TaskType, FormFieldDef } from "@/models/TaskDefinition";

export interface EditTask {
  _id: string;
  name: string;
  icon: string;
  projectedMinutes: number;
  order: number;
  taskType: TaskType;
  formFields: FormFieldDef[];
  scheduledDays: number[];  // 0=Sun..6=Sat — which days this task is expected
  successThreshold: number; // how many of this week's scheduled days = 100%
  appIntentLastTriggeredAt: string | null; // last time a Siri/Shortcuts App Intent triggered this task, if ever
  nfcTagCode: string | null; // tagCode of the NFC tag linked to this task, if any — see docs/features/nfc.md
  nfcTagUid: string | null; // raw UID of the physical tag bound for scan-to-complete, if any — see docs/features/nfc.md
}

interface Props {
  isManager: boolean;
  taskList: { _id: string; name: string; startTime: string | null; scheduledDays: number[] };
  tasks: EditTask[];
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat, matches calendarWeekDates order
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ── Sortable row ─────────────────────────────────────────────────────────────

function SortableRow({
  task,
  isEditing,
  isManager,
  onToggleEdit,
  onSave,
  onRemove,
}: {
  task: EditTask;
  isEditing: boolean;
  isManager: boolean;
  onToggleEdit: () => void;
  onSave: (
    name: string,
    icon: string,
    projectedMinutes: number,
    formFields: FormFieldDef[],
    scheduledDays: number[],
    successThreshold: number
  ) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  const [editName, setEditName] = useState(task.name);
  const [editIcon, setEditIcon] = useState(task.icon);
  const [editMins, setEditMins] = useState(String(task.projectedMinutes));
  const [editFields, setEditFields] = useState<FormFieldDef[]>(task.formFields);
  const [editScheduledDays, setEditScheduledDays] = useState<number[]>(task.scheduledDays);
  const [editThreshold, setEditThreshold] = useState(task.successThreshold);
  const [saving, setSaving] = useState(false);

  // Tap-to-trigger NFC status (see docs/features/nfc.md) — creating a NEW
  // link this way is removed from the UI (Scan-to-Complete Tag below is now
  // the only way to link a tag from this screen), but a task linked before
  // that removal still shows its status here and can be unlinked, so an
  // already-deployed physical tag or built Shortcut isn't silently orphaned.
  const [nfcTagCode, setNfcTagCode] = useState<string | null>(task.nfcTagCode);
  const [nfcBusy, setNfcBusy] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [showNfcSetup, setShowNfcSetup] = useState(false);

  async function handleUnlinkTag() {
    if (!nfcTagCode) return;
    setNfcBusy(true);
    setNfcError(null);
    try {
      const res = await fetch(`/api/nfc-tags/${nfcTagCode}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to unlink");
      setNfcTagCode(null);
      setShowNfcSetup(false);
    } catch (err) {
      setNfcError(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setNfcBusy(false);
    }
  }

  // Scan-to-complete binding — a raw physical UID stored directly on the
  // task, distinct from nfcTagCode above (that's the tagCode/URL
  // tap-to-trigger system). See docs/features/nfc.md's "In-app
  // scan-to-complete binding". Local state so bind/unbind reflects
  // immediately without a full page refresh.
  const [nfcTagUid, setNfcTagUid] = useState<string | null>(task.nfcTagUid);
  const [bindBusy, setBindBusy] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);

  async function handleScanToLink() {
    setBindError(null);
    if (!Capacitor.isNativePlatform()) {
      setBindError("Open the app on your phone to scan a tag.");
      return;
    }
    setBindBusy(true);
    const result = await scanNfcTag();
    if (result.status !== "ok") {
      setBindBusy(false);
      setBindError(result.status === "unsupported" ? "NFC isn't available on this device." : result.message);
      return;
    }
    try {
      const res = await fetch(`/api/tasks/${task._id}/nfc-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: result.uid }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to bind tag");
      setNfcTagUid(result.uid);
    } catch (err) {
      setBindError(err instanceof Error ? err.message : "Failed to bind tag");
    } finally {
      setBindBusy(false);
    }
  }

  async function handleUnbindTag() {
    setBindBusy(true);
    setBindError(null);
    try {
      const res = await fetch(`/api/tasks/${task._id}/nfc-tag`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to unbind tag");
      setNfcTagUid(null);
    } catch (err) {
      setBindError(err instanceof Error ? err.message : "Failed to unbind tag");
    } finally {
      setBindBusy(false);
    }
  }

  function toggleEditDay(day: number) {
    setEditScheduledDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort();
      setEditThreshold((t) => Math.min(t, Math.max(next.length, 1)));
      return next;
    });
  }

  const handleSave = async () => {
    setSaving(true);
    const mins = parseInt(editMins) || task.projectedMinutes;
    await onSave(editName.trim() || task.name, editIcon || task.icon, mins, editFields, editScheduledDays, editThreshold);
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
          <AppIcon name={task.icon} size={17} className="text-muted" />
        </div>

        <span className="flex-1 font-body text-sm text-text truncate">{task.name}</span>

        <span className="font-mono text-dim text-xs flex-shrink-0 mr-2">
          {task.formFields.length} field{task.formFields.length === 1 ? "" : "s"}
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
            <div className="flex-shrink-0 w-20">
              <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
                Est. min
              </label>
              <input
                type="number"
                value={editMins}
                onChange={(e) => setEditMins(e.target.value)}
                min={1}
                className="w-full bg-bg border border-border rounded-card px-3 py-2 font-mono text-sm text-text outline-none focus:border-olive"
              />
            </div>
          </div>
          {/* Icon picker */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
              Icon
            </label>
            <IconPicker selected={editIcon} onSelect={setEditIcon} />
          </div>
          {/* Fields */}
          <TaskFieldsEditor fields={editFields} onChange={setEditFields} />
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
            disabled={saving || editFields.length === 0}
            className="flex items-center gap-1.5 bg-olive/15 border border-olive/30 text-olive font-mono text-xs px-4 py-2 rounded-pill disabled:opacity-50"
          >
            <Check size={12} />
            {saving ? "Saving…" : "Save changes"}
          </button>

          {/* Siri & Shortcuts connection — there's no way to detect a
              Shortcut was *built* for this task (Apple gives no hook for
              that), only that one has *run* — so this reflects usage, not
              configuration, and doesn't preclude multiple Shortcuts also
              pointing at this task. */}
          {task.appIntentLastTriggeredAt && (
            <div className="pt-2 border-t border-border">
              <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5">
                Siri &amp; Shortcuts
              </p>
              <p className="font-mono text-[11px] text-olive">
                Connected · last used {new Date(task.appIntentLastTriggeredAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Tap-to-trigger NFC tag — manager-only, same gate as the
              /api/nfc-tags routes. See docs/features/nfc.md. Only rendered
              for a task already linked this way before "Link a Physical
              Tag"/"Generate Silent Trigger" were removed from the UI — view
              status and Unlink only, no way to create a new one from here
              anymore (Scan-to-Complete Tag below is the only linking path
              now). */}
          {isManager && nfcTagCode && (
            <div className="pt-2 border-t border-border">
              <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5">
                NFC Tag
              </p>
              {showNfcSetup ? (
                <NfcTagLinkedSetup
                  tagCode={nfcTagCode}
                  taskName={task.name}
                  taskIcon={task.icon}
                  onDone={() => setShowNfcSetup(false)}
                  doneLabel="Close"
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-olive flex-1">
                    Linked · {nfcTagCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNfcSetup(true)}
                    className="font-mono text-[11px] text-dim hover:text-muted px-2 py-1"
                  >
                    Setup Info
                  </button>
                  <button
                    type="button"
                    onClick={handleUnlinkTag}
                    disabled={nfcBusy}
                    className="font-mono text-[11px] text-burgundy-light px-2 py-1 disabled:opacity-40"
                  >
                    Unlink
                  </button>
                </div>
              )}
              {nfcError && (
                <p className="font-mono text-[11px] text-burgundy-light mt-1.5">{nfcError}</p>
              )}
            </div>
          )}

          {/* Scan-to-complete binding — a raw UID stored on the task itself,
              distinct from the tap-to-trigger "NFC Tag" section above. See
              docs/features/nfc.md's "In-app scan-to-complete binding". */}
          {isManager && (
            <div className="pt-2 border-t border-border">
              <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5">
                Scan-to-Complete Tag
              </p>
              {nfcTagUid ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-olive flex-1 truncate">
                    Bound · {nfcTagUid}
                  </span>
                  <button
                    type="button"
                    onClick={handleUnbindTag}
                    disabled={bindBusy}
                    className="font-mono text-[11px] text-burgundy-light px-2 py-1 disabled:opacity-40"
                  >
                    Unbind
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleScanToLink}
                  disabled={bindBusy}
                  className="font-mono text-[11px] text-olive border border-olive/30 bg-olive/10 px-3 py-1.5 rounded-pill disabled:opacity-40"
                >
                  {bindBusy ? "Hold near tag…" : "Scan to Link"}
                </button>
              )}
              <p className="font-body text-[11px] text-dim mt-1.5">
                {nfcTagUid
                  ? "Completing this task requires scanning this exact tag instead of just tapping Save."
                  : "Optional — bind a physical tag so this task can only be completed by scanning it."}
              </p>
              {bindError && (
                <p className="font-mono text-[11px] text-burgundy-light mt-1.5">{bindError}</p>
              )}
            </div>
          )}

          {/* For the external API (see Profile > External API Key) */}
          <div className="pt-2 border-t border-border">
            <p className="font-mono text-[9px] uppercase tracking-widest text-dim mb-1">
              Task ID
            </p>
            <p className="font-mono text-[10px] text-dim break-all select-all">{task._id}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TaskListEditView({ isManager, taskList, tasks: initialTasks }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<EditTask[]>(initialTasks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // List settings state — name, start time, and the list-level default
  // scheduledDays pushed down onto every task when saved (see PATCH
  // /api/task-lists/[taskListId]).
  const [name, setName] = useState(taskList.name);
  const [startTime, setStartTime] = useState(taskList.startTime ?? "");
  const [scheduledDays, setScheduledDays] = useState<number[]>(taskList.scheduledDays ?? ALL_DAYS);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggleScheduledDay(day: number) {
    setScheduledDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort();
      return next;
    });
    setSettingsChanged(true);
    setSettingsSaved(false);
  }

  async function saveListSettings() {
    setSavingSettings(true);
    await fetch(`/api/task-lists/${taskList._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || taskList.name, startTime: startTime || null, scheduledDays }),
    });
    // The server pushes scheduledDays down onto every task in the list —
    // mirror that locally too instead of waiting on a refetch, same as
    // handleAdd/handleSaveItem below already do for their own writes. This
    // always overwrites, even a task customized independently earlier (see
    // the matching note on the API route) — simplest option to build; a
    // customized task doesn't survive the *next* list-level schedule change.
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        scheduledDays,
        successThreshold: Math.min(t.successThreshold, Math.max(scheduledDays.length, 1)),
      }))
    );
    setSavingSettings(false);
    setSettingsChanged(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  async function handleDeleteTaskList() {
    if (!window.confirm(`Delete "${taskList.name}"? Its history is kept, but it won't show on the Tasks page anymore.`)) {
      return;
    }
    setDeleting(true);
    await fetch(`/api/task-lists/${taskList._id}`, { method: "DELETE" });
    router.push("/tasks");
    router.refresh();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex((t) => t._id === active.id);
    const newIndex = tasks.findIndex((t) => t._id === over.id);
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    setTasks(reordered);

    await fetch("/api/tasks/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: reordered.map((t, idx) => ({ _id: t._id, order: idx })) }),
    });
  };

  const handleSaveTask = async (
    id: string,
    name: string,
    icon: string,
    projectedMinutes: number,
    formFields: FormFieldDef[],
    scheduledDays: number[],
    successThreshold: number
  ) => {
    setTasks((prev) =>
      prev.map((t) => (t._id === id ? { ...t, name, icon, projectedMinutes, formFields, scheduledDays, successThreshold } : t))
    );
    setEditingId(null);
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon, projectedMinutes, formFields, scheduledDays, successThreshold }),
    });
    router.refresh(); // invalidate Tasks page cache
  };

  const handleRemove = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t._id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const handleAdd = async (
    templateId: string | null,
    name: string,
    icon: string,
    projectedMinutes: number,
    taskType: "form",
    taskScheduledDays: number[] = ALL_DAYS,
    successThreshold: number = 7,
    formFields: FormFieldDef[] = []
  ) => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskListId: taskList._id, templateId, name, icon, projectedMinutes, taskType, scheduledDays: taskScheduledDays, successThreshold, formFields }),
    });
    const newTask = await res.json();
    // Push directly into local state — don't wait for a server round-trip
    setTasks((prev) => [
      ...prev,
      {
        _id: newTask._id,
        name: newTask.name,
        icon: newTask.icon,
        projectedMinutes: newTask.projectedMinutes,
        taskType: (newTask.taskType ?? "form") as TaskType,
        formFields: newTask.formFields ?? formFields,
        order: prev.length,
        scheduledDays: newTask.scheduledDays ?? taskScheduledDays,
        successThreshold: newTask.successThreshold ?? successThreshold,
        appIntentLastTriggeredAt: null,
        nfcTagCode: null,
        nfcTagUid: null,
      },
    ]);
    setShowAddSheet(false);
    router.refresh(); // invalidate Tasks page cache for when user navigates back
  };

  // Places an existing company saved task (TaskDefinition) into this list —
  // the "Your Saved Tasks" section of AddTaskSheet's browse view. Same POST
  // /api/tasks endpoint as handleAdd above, just with definitionId instead
  // of name/icon/…, so no new TaskDefinition gets created — every list this
  // ends up in shares the same name/icon/fields/NFC binding.
  const handleAddExisting = async (definitionId: string) => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskListId: taskList._id, definitionId }),
    });
    const newTask = await res.json();
    setTasks((prev) => [
      ...prev,
      {
        _id: newTask._id,
        name: newTask.name,
        icon: newTask.icon,
        projectedMinutes: newTask.projectedMinutes,
        taskType: (newTask.taskType ?? "form") as TaskType,
        formFields: newTask.formFields ?? [],
        order: prev.length,
        scheduledDays: newTask.scheduledDays ?? ALL_DAYS,
        successThreshold: newTask.successThreshold ?? 7,
        appIntentLastTriggeredAt: null,
        nfcTagCode: null,
        nfcTagUid: newTask.nfcTagUid ?? null,
      },
    ]);
    setShowAddSheet(false);
    router.refresh();
  };

  const totalMins = tasks.reduce((s, t) => s + t.projectedMinutes, 0);
  const fmtTotal = totalMins < 60
    ? `${totalMins}m`
    : `${Math.floor(totalMins / 60)}h ${totalMins % 60 > 0 ? `${totalMins % 60}m` : ""}`.trim();

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 pt-10 pb-4 border-b border-border">
          <Link
            href="/tasks"
            className="font-mono text-dim text-sm flex items-center gap-1 min-h-[44px] pr-2"
          >
            ← Tasks
          </Link>
          <div className="flex-1 text-center">
            <h1 className="font-heading text-lg text-text">{taskList.name}</h1>
            <p className="font-mono text-dim text-xs">{tasks.length} tasks · {fmtTotal}</p>
          </div>
          <div className="w-20" /> {/* balance the back link */}
        </header>

        {/* List settings — name, schedule, danger zone */}
        <div className="px-4 py-4 border-b border-border space-y-4">
          <div>
            <label className="font-mono text-[10px] text-dim block mb-1.5">List name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSettingsChanged(true); setSettingsSaved(false); }}
              className="w-full bg-bg border border-border rounded-card px-3 py-2.5 font-body text-sm text-text outline-none focus:border-olive"
            />
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
              Time Window
            </p>
            <div className="w-40">
              <label className="font-mono text-[10px] text-dim block mb-1.5">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => { setStartTime(e.target.value); setSettingsChanged(true); setSettingsSaved(false); }}
                className="w-full bg-bg border border-border rounded-card px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-olive"
              />
            </div>
            {startTime && (
              <p className="font-mono text-[10px] text-dim mt-3">
                Opens at {startTime} · closes after all tasks are done
              </p>
            )}
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
              Days scheduled
            </label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleScheduledDay(day)}
                  className={`w-9 h-9 rounded-full font-mono text-xs transition-colors ${
                    scheduledDays.includes(day)
                      ? "bg-olive text-text"
                      : "bg-bg border border-border text-dim"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="font-mono text-[10px] text-dim mt-2">
              On an off day, this list&rsquo;s tasks are hidden — sets the default
              for every task in it (a task can still be edited individually
              afterward).
            </p>
          </div>

          {settingsChanged && (
            <button
              onClick={saveListSettings}
              disabled={savingSettings}
              className="flex items-center gap-1.5 bg-olive/15 border border-olive/30 text-olive font-mono text-xs px-4 py-2 rounded-pill disabled:opacity-50"
            >
              <Check size={12} />
              {savingSettings ? "Saving…" : "Save changes"}
            </button>
          )}
          {settingsSaved && (
            <p className="font-mono text-[10px] text-olive">Saved</p>
          )}

          <div className="pt-2 border-t border-border">
            <button
              onClick={handleDeleteTaskList}
              disabled={deleting}
              className="font-mono text-xs text-burgundy-light border border-burgundy/30 px-4 py-2 rounded-pill disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete task list"}
            </button>
          </div>
        </div>

        {/* For the external API (see Profile > External API Key) */}
        <div className="px-4 py-3 border-b border-border">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1">
            Task List ID
          </p>
          <p className="font-mono text-[11px] text-muted break-all select-all">{taskList._id}</p>
        </div>

        {/* Sortable list */}
        <div className="px-4 pt-5 pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={tasks.map((t) => t._id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="rounded-card overflow-hidden divide-y divide-border border border-border">
                {tasks.map((task) => (
                  <SortableRow
                    key={task._id}
                    task={task}
                    isEditing={editingId === task._id}
                    isManager={isManager}
                    onToggleEdit={() =>
                      setEditingId((prev) => (prev === task._id ? null : task._id))
                    }
                    onSave={(name, icon, mins, fields, days, threshold) => handleSaveTask(task._id, name, icon, mins, fields, days, threshold)}
                    onRemove={() => handleRemove(task._id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {tasks.length === 0 && (
            <div className="text-center py-10">
              <p className="text-dim font-mono text-xs">No tasks yet. Add one below.</p>
            </div>
          )}

          {/* Add task — browsing this sheet covers both creating a brand-new
              saved task and reusing one the company already has ("Your
              Saved Tasks" section), so there's just the one entry point. */}
          <button
            onClick={() => setShowAddSheet(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-4 rounded-card hover:border-olive/40 hover:text-olive transition-colors min-h-[44px]"
          >
            + Add task to {taskList.name}
          </button>
        </div>
      </div>

      {showAddSheet && (
        <AddTaskSheet
          taskListId={taskList._id}
          taskListName={taskList.name}
          onAdd={handleAdd}
          onAddExisting={handleAddExisting}
          onClose={() => setShowAddSheet(false)}
        />
      )}
    </div>
  );
}
