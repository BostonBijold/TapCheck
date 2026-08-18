"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pencil,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ITask {
  _id: string;
  name: string;
  done: boolean;
  completedAt: string | null;
  scheduledDate: string | null;
  estimatedMinutes: number | null;
  note: string | null;
}

interface IMilestone {
  _id: string;
  name: string;
  targetDate: string | null;
  order: number;
  complete: boolean;
  tasks: ITask[];
}

interface IGoal {
  _id: string;
  name: string;
  description: string | null;
  status: "active" | "complete" | "paused" | "abandoned";
  targetDate: string | null;
  progressPct: number;
  computedProgress: number;
  outcomeMetric: { label: string; targetValue: number; unit: string } | null;
  outcomeLog: Array<{ _id: string; value: number; date: string; note: string | null }>;
  milestones: IMilestone[];
}

interface Props {
  initialGoal: IGoal;
  today: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "active",    label: "Active",    color: "text-blue-muted",    bg: "bg-blue-muted/10 border-blue-muted/30"    },
  { value: "paused",    label: "Paused",    color: "text-amber",         bg: "bg-amber/10 border-amber/30"              },
  { value: "complete",  label: "Complete",  color: "text-olive",         bg: "bg-olive/10 border-olive/30"              },
  { value: "abandoned", label: "Abandoned", color: "text-dim",           bg: "bg-card border-border"                    },
] as const;

function progressBarColor(status: string) {
  if (status === "complete")  return "#5a6b35";
  if (status === "paused")    return "#c47a2a";
  if (status === "abandoned") return "#5a5548";
  return "#4a7a9a";
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Add Task Inline Form ───────────────────────────────────────────────────────

function AddTaskForm({
  goalId,
  milestoneId,
  today,
  onAdded,
  onCancel,
}: {
  goalId: string;
  milestoneId: string;
  today: string;
  onAdded: (goal: IGoal) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch(`/api/goals/${goalId}/milestones/${milestoneId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), scheduledDate: scheduleDate || undefined }),
    });
    if (res.ok) {
      const goal = await res.json();
      onAdded(goal);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="mt-2 pl-6">
      <input
        ref={ref}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Task name…"
        className="w-full bg-bg border border-border-light rounded-card px-3 py-2.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-blue-muted"
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      {showDate && (
        <input
          type="date"
          value={scheduleDate}
          onChange={(e) => setScheduleDate(e.target.value)}
          min={today}
          className="mt-2 w-full bg-bg border border-border rounded-card px-3 py-2 font-mono text-sm text-text focus:outline-none focus:border-blue-muted"
        />
      )}
      <div className="flex items-center gap-2 mt-2">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="bg-blue-muted text-text font-body text-xs font-medium px-3 py-1.5 rounded-pill disabled:opacity-50 min-h-[32px]"
        >
          {saving ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setShowDate((v) => !v)}
          className="font-mono text-[10px] text-dim px-2 py-1.5 rounded-pill border border-border min-h-[32px]"
        >
          {showDate ? "No date" : "+ Schedule"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[10px] text-dim ml-auto"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Task Row ───────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  goalId,
  milestoneId,
  onUpdated,
}: {
  task: ITask;
  goalId: string;
  milestoneId: string;
  onUpdated: (goal: IGoal) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggleDone() {
    if (toggling) return;
    setToggling(true);
    const res = await fetch(
      `/api/goals/${goalId}/milestones/${milestoneId}/tasks/${task._id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !task.done }),
      }
    );
    if (res.ok) onUpdated(await res.json());
    setToggling(false);
  }

  async function deleteTask() {
    if (deleting) return;
    setDeleting(true);
    const res = await fetch(
      `/api/goals/${goalId}/milestones/${milestoneId}/tasks/${task._id}`,
      { method: "DELETE" }
    );
    if (res.ok) onUpdated(await res.json());
    else setDeleting(false);
  }

  return (
    <div
      className={`flex items-start gap-3 py-2.5 group ${deleting ? "opacity-40 pointer-events-none" : ""}`}
    >
      {/* Checkbox */}
      <button
        onClick={toggleDone}
        disabled={toggling}
        className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          task.done
            ? "bg-olive border-olive"
            : "border-border-light bg-transparent hover:border-blue-muted"
        }`}
      >
        {task.done && <Check size={11} className="text-text" strokeWidth={3} />}
      </button>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <span
          className={`font-body text-sm leading-tight ${
            task.done ? "line-through text-dim" : "text-text"
          }`}
        >
          {task.name}
        </span>
        {task.scheduledDate && (
          <div className="mt-0.5">
            <span className="font-mono text-[9px] text-blue-muted">
              {fmtDate(task.scheduledDate)}
            </span>
          </div>
        )}
      </div>

      {/* Delete (shows on hover) */}
      <button
        onClick={deleteTask}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-dim hover:text-burgundy-light flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Milestone Card ─────────────────────────────────────────────────────────────

function MilestoneCard({
  milestone,
  goalId,
  today,
  onUpdated,
}: {
  milestone: IMilestone;
  goalId: string;
  today: string;
  onUpdated: (goal: IGoal) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingTask, setAddingTask] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(milestone.name);
  const [deleting, setDeleting] = useState(false);

  const doneTasks = milestone.tasks.filter((t) => t.done).length;
  const totalTasks = milestone.tasks.length;
  const hasNoTasks = totalTasks === 0;

  async function saveName() {
    if (!nameVal.trim() || nameVal === milestone.name) {
      setEditingName(false);
      setNameVal(milestone.name);
      return;
    }
    const res = await fetch(`/api/goals/${goalId}/milestones/${milestone._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameVal.trim() }),
    });
    if (res.ok) onUpdated(await res.json());
    setEditingName(false);
  }

  async function toggleMilestoneComplete() {
    if (!hasNoTasks) return; // derived — can't manually toggle when tasks exist
    const res = await fetch(`/api/goals/${goalId}/milestones/${milestone._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complete: !milestone.complete }),
    });
    if (res.ok) onUpdated(await res.json());
  }

  async function deleteMilestone() {
    if (deleting) return;
    if (!confirm(`Delete milestone "${milestone.name}" and all its tasks?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/goals/${goalId}/milestones/${milestone._id}`, {
      method: "DELETE",
    });
    if (res.ok) onUpdated(await res.json());
    else setDeleting(false);
  }

  return (
    <div
      className={`bg-card rounded-card border border-border transition-opacity ${
        deleting ? "opacity-40 pointer-events-none" : ""
      } ${milestone.complete ? "border-olive/30" : ""}`}
    >
      {/* Milestone header */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Complete toggle (only active when no tasks) */}
        <button
          onClick={hasNoTasks ? toggleMilestoneComplete : undefined}
          className={`w-5 h-5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
            milestone.complete
              ? "bg-olive border-olive"
              : hasNoTasks
              ? "border-border-light hover:border-blue-muted"
              : "border-border cursor-default opacity-40"
          }`}
          title={hasNoTasks ? "Mark complete" : "Completion is derived from tasks"}
        >
          {milestone.complete && <Check size={11} className="text-text" strokeWidth={3} />}
        </button>

        {/* Name */}
        {editingName ? (
          <input
            autoFocus
            type="text"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") { setEditingName(false); setNameVal(milestone.name); }
            }}
            className="flex-1 bg-bg border border-blue-muted rounded px-2 py-1 font-body text-sm text-text focus:outline-none"
          />
        ) : (
          <span
            className={`flex-1 font-body text-sm font-medium leading-tight ${
              milestone.complete ? "line-through text-dim" : "text-text"
            }`}
          >
            {milestone.name}
          </span>
        )}

        {/* Task count */}
        {totalTasks > 0 && (
          <span className="font-mono text-[10px] text-dim flex-shrink-0">
            {doneTasks}/{totalTasks}
          </span>
        )}

        {/* Target date */}
        {milestone.targetDate && (
          <span className="font-mono text-[9px] text-dim flex-shrink-0">
            {fmtDate(milestone.targetDate)}
          </span>
        )}

        {/* Actions */}
        <button
          onClick={() => setEditingName(true)}
          className="text-dim hover:text-muted flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={deleteMilestone}
          className="text-dim hover:text-burgundy-light flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center"
        >
          <Trash2 size={12} />
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-dim flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Tasks */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-border">
          {milestone.tasks.length > 0 && (
            <div className="divide-y divide-border">
              {milestone.tasks.map((task) => (
                <TaskRow
                  key={task._id}
                  task={task}
                  goalId={goalId}
                  milestoneId={milestone._id}
                  onUpdated={onUpdated}
                />
              ))}
            </div>
          )}

          {addingTask ? (
            <AddTaskForm
              goalId={goalId}
              milestoneId={milestone._id}
              today={today}
              onAdded={(g) => { onUpdated(g); setAddingTask(false); }}
              onCancel={() => setAddingTask(false)}
            />
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-dim hover:text-muted transition-colors min-h-[32px]"
            >
              <Plus size={11} />
              Add task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Detail View ───────────────────────────────────────────────────────────

export default function GoalDetailView({ initialGoal, today }: Props) {
  const router = useRouter();
  const [goal, setGoal] = useState<IGoal>(initialGoal);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(goal.name);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const msRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingMilestone) setTimeout(() => msRef.current?.focus(), 50);
  }, [addingMilestone]);

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!newMilestoneName.trim() || savingMilestone) return;
    setSavingMilestone(true);
    const res = await fetch(`/api/goals/${goal._id}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newMilestoneName.trim() }),
    });
    if (res.ok) {
      setGoal(await res.json());
      setNewMilestoneName("");
      setAddingMilestone(false);
    }
    setSavingMilestone(false);
  }

  async function updateStatus(status: string) {
    setShowStatusMenu(false);
    const res = await fetch(`/api/goals/${goal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) setGoal(await res.json());
  }

  async function saveName() {
    if (!nameVal.trim() || nameVal === goal.name) {
      setEditingName(false);
      setNameVal(goal.name);
      return;
    }
    const res = await fetch(`/api/goals/${goal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameVal.trim() }),
    });
    if (res.ok) setGoal(await res.json());
    setEditingName(false);
  }

  const pct = goal.computedProgress;
  const statusOpt = STATUS_OPTIONS.find((s) => s.value === goal.status) ?? STATUS_OPTIONS[0];

  const totalTasks = goal.milestones.flatMap((m) => m.tasks).length;
  const doneTasks  = goal.milestones.flatMap((m) => m.tasks).filter((t) => t.done).length;
  const totalMs    = goal.milestones.length;
  const doneMs     = goal.milestones.filter((m) => m.complete).length;

  let progressLabel = `${pct}% complete`;
  if (totalTasks > 0)    progressLabel += ` — ${doneTasks} of ${totalTasks} tasks done`;
  else if (totalMs > 0)  progressLabel += ` — ${doneMs} of ${totalMs} milestones`;

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-24">
        {/* ── Back + title ── */}
        <div className="flex items-center gap-3 pt-6 pb-5">
          <button
            onClick={() => router.back()}
            className="text-dim hover:text-muted min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
          >
            <ArrowLeft size={20} />
          </button>

          {editingName ? (
            <input
              autoFocus
              type="text"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") { setEditingName(false); setNameVal(goal.name); }
              }}
              className="flex-1 bg-bg border border-blue-muted rounded-card px-3 py-2 font-heading text-xl text-text focus:outline-none"
            />
          ) : (
            <h1
              className="flex-1 font-heading text-xl text-text leading-tight cursor-pointer"
              onClick={() => setEditingName(true)}
            >
              {goal.name}
            </h1>
          )}
        </div>

        {/* ── Status + target date ── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu((v) => !v)}
              className={`font-mono text-xs px-3 py-1.5 rounded-pill border ${statusOpt.bg} ${statusOpt.color} flex items-center gap-1.5`}
            >
              {statusOpt.label}
              <ChevronDown size={11} />
            </button>
            {showStatusMenu && (
              <div className="absolute top-full mt-1 left-0 bg-card border border-border rounded-card overflow-hidden z-20 shadow-lg min-w-[140px]">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => updateStatus(s.value)}
                    className={`w-full text-left px-4 py-2.5 font-mono text-xs hover:bg-card-hover ${s.color}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {goal.targetDate && (
            <span className="font-mono text-[10px] text-dim">
              {fmtDate(goal.targetDate)}
            </span>
          )}

          {showStatusMenu && (
            <button
              className="fixed inset-0 z-10"
              onClick={() => setShowStatusMenu(false)}
            />
          )}
        </div>

        {/* ── Progress ── */}
        <div className="bg-card rounded-card px-4 py-4 mb-6">
          <div className="flex items-end justify-between mb-2">
            <span
              className="font-mono text-3xl font-semibold"
              style={{ color: progressBarColor(goal.status) }}
            >
              {pct}%
            </span>
            {totalTasks === 0 && totalMs === 0 && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-dim">Manual</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={goal.progressPct}
                  onChange={async (e) => {
                    const v = parseInt(e.target.value);
                    setGoal((prev) => ({ ...prev, progressPct: v, computedProgress: v }));
                    await fetch(`/api/goals/${goal._id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ progressPct: v }),
                    });
                  }}
                  className="w-24 accent-blue-muted"
                />
              </div>
            )}
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: progressBarColor(goal.status) }}
            />
          </div>
          <p className="font-mono text-[10px] text-dim">{progressLabel}</p>
        </div>

        {/* ── Description ── */}
        {goal.description && (
          <div className="mb-6 px-1">
            <p className="font-body text-sm text-muted leading-relaxed">{goal.description}</p>
          </div>
        )}

        {/* ── Outcome metric ── */}
        {goal.outcomeMetric && (
          <div className="bg-card rounded-card px-4 py-3.5 mb-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-2">
              {goal.outcomeMetric.label}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl text-text">
                {goal.outcomeLog.length > 0
                  ? goal.outcomeLog[goal.outcomeLog.length - 1].value
                  : "—"}
              </span>
              <span className="font-mono text-sm text-dim">{goal.outcomeMetric.unit}</span>
              <span className="font-mono text-[10px] text-dim ml-auto">
                Target: {goal.outcomeMetric.targetValue} {goal.outcomeMetric.unit}
              </span>
            </div>
          </div>
        )}

        {/* ── Milestones ── */}
        <div className="mb-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
            Milestones
          </p>

          {goal.milestones.length === 0 && !addingMilestone && (
            <p className="font-body text-sm text-dim px-1 mb-3">
              Break this goal into milestones to track progress.
            </p>
          )}

          <div className="space-y-2">
            {goal.milestones.map((m) => (
              <MilestoneCard
                key={m._id}
                milestone={m}
                goalId={goal._id}
                today={today}
                onUpdated={setGoal}
              />
            ))}
          </div>

          {/* Add milestone form */}
          {addingMilestone ? (
            <form onSubmit={addMilestone} className="mt-3">
              <input
                ref={msRef}
                type="text"
                value={newMilestoneName}
                onChange={(e) => setNewMilestoneName(e.target.value)}
                placeholder="Milestone name…"
                className="w-full bg-card border border-blue-muted rounded-card px-4 py-3 font-body text-sm text-text placeholder:text-dim focus:outline-none"
                onKeyDown={(e) => e.key === "Escape" && setAddingMilestone(false)}
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  disabled={!newMilestoneName.trim() || savingMilestone}
                  className="bg-blue-muted text-text font-body text-sm font-medium px-4 py-2.5 rounded-card disabled:opacity-50 min-h-[40px]"
                >
                  {savingMilestone ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingMilestone(false); setNewMilestoneName(""); }}
                  className="flex items-center gap-1 text-dim font-mono text-xs px-3 py-2.5 rounded-card border border-border min-h-[40px]"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setAddingMilestone(true)}
              className="mt-3 flex items-center gap-2 font-body text-sm text-muted hover:text-text transition-colors min-h-[40px]"
            >
              <Plus size={15} />
              Add milestone
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
