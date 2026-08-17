"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronRight, Flag } from "lucide-react";
import Header from "@/components/Header";
import TodoSection, { type TodoEntry } from "@/components/TodoSection";
import EditTodoSheet from "@/components/EditTodoSheet";
import FABTaskSheet from "@/components/FABTaskSheet";
import { useTodoActions } from "@/lib/useTodoActions";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SerializedGoal {
  _id: string;
  name: string;
  description: string | null;
  status: "active" | "complete" | "paused" | "abandoned";
  targetDate: string | null;
  progressPct: number;
  computedProgress: number;
  outcomeMetric: { label: string; targetValue: number; unit: string } | null;
  milestones: Array<{
    _id: string;
    name: string;
    complete: boolean;
    tasks: Array<{ _id: string; done: boolean }>;
  }>;
}

interface Props {
  userName: string;
  today: string;
  skipAuth?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function taskSummary(goal: SerializedGoal): string {
  const allTasks = goal.milestones.flatMap((m) => m.tasks);
  if (allTasks.length > 0) {
    const done = allTasks.filter((t) => t.done).length;
    return `${done} / ${allTasks.length} tasks`;
  }
  if (goal.milestones.length > 0) {
    const done = goal.milestones.filter((m) => m.complete).length;
    return `${done} / ${goal.milestones.length} milestones`;
  }
  return goal.computedProgress > 0 ? `${goal.computedProgress}% done` : "No milestones yet";
}

function dueDateLabel(targetDate: string | null, today: string): { text: string; color: string } | null {
  if (!targetDate) return null;
  const todayMs = new Date(today + "T12:00:00").getTime();
  const dueMs = new Date(targetDate + "T12:00:00").getTime();
  const diffDays = Math.round((dueMs - todayMs) / 86400000);

  if (diffDays < 0) return { text: "Overdue", color: "text-burgundy-light" };
  if (diffDays === 0) return { text: "Due today", color: "text-amber" };
  if (diffDays <= 7) return { text: `${diffDays}d left`, color: "text-amber" };
  const d = new Date(targetDate + "T12:00:00");
  return {
    text: `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    color: "text-dim",
  };
}

const STATUS_STYLE: Record<string, { border: string; badge: string; label: string }> = {
  active:    { border: "border-blue-muted",    badge: "text-blue-muted bg-blue-muted/10",    label: "Active"    },
  complete:  { border: "border-olive",         badge: "text-olive bg-olive/10",              label: "Complete"  },
  paused:    { border: "border-amber",         badge: "text-amber bg-amber/10",              label: "Paused"    },
  abandoned: { border: "border-border-light",  badge: "text-dim bg-card",                   label: "Abandoned" },
};

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function progressBarColor(status: string): string {
  if (status === "complete") return "#5a6b35";
  if (status === "paused")   return "#c47a2a";
  if (status === "abandoned") return "#5a5548";
  return "#4a7a9a"; // blue-muted for active
}

// ── Goal Card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, today, onClick }: { goal: SerializedGoal; today: string; onClick: () => void }) {
  const style = STATUS_STYLE[goal.status] ?? STATUS_STYLE.active;
  const due = dueDateLabel(goal.targetDate, today);
  const pct = goal.computedProgress;
  const summary = taskSummary(goal);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-card rounded-card border-l-[3px] ${style.border} px-4 py-4 hover:bg-card-hover active:opacity-90 transition-colors flex items-start gap-3`}
    >
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-heading text-base text-text leading-tight flex-1">{goal.name}</h3>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            <span className={`font-mono text-[10px] px-2 py-0.5 rounded-pill ${style.badge}`}>
              {style.label}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-border rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: progressBarColor(goal.status) }}
          />
        </div>

        {/* Footer row */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-dim">{summary}</span>
          {due && (
            <span className={`font-mono text-[10px] ${due.color} ml-auto`}>{due.text}</span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-dim flex-shrink-0 mt-1" />
    </button>
  );
}

// ── Add Goal Sheet ────────────────────────────────────────────────────────────

function AddGoalSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (goal: SerializedGoal) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [trackOutcome, setTrackOutcome] = useState(false);
  const [outcomeLabel, setOutcomeLabel] = useState("");
  const [outcomeUnit, setOutcomeUnit] = useState("");
  const [outcomeTarget, setOutcomeTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 50);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);

    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || undefined,
      targetDate: targetDate || undefined,
    };

    if (trackOutcome && outcomeLabel.trim() && outcomeUnit.trim() && outcomeTarget) {
      body.outcomeMetric = {
        label: outcomeLabel.trim(),
        unit: outcomeUnit.trim(),
        targetValue: parseFloat(outcomeTarget),
      };
    }

    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const goal = await res.json();
        onCreated(goal);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border-t border-border rounded-t-[16px] px-5 pt-5 pb-8 z-10 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" />
        <h2 className="font-heading text-lg text-text mb-5">New Goal</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
              Goal *
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lose 20 lbs, Build the app, Write a book…"
              className="w-full bg-bg border border-border rounded-card px-3 py-3 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-blue-muted"
            />
          </div>

          {/* Description */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why this goal matters…"
              rows={2}
              className="w-full bg-bg border border-border rounded-card px-3 py-3 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-blue-muted resize-none"
            />
          </div>

          {/* Target date */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">
              Target Date
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full bg-bg border border-border rounded-card px-3 py-3 font-mono text-sm text-text focus:outline-none focus:border-blue-muted"
            />
          </div>

          {/* Outcome metric toggle */}
          <div>
            <button
              type="button"
              onClick={() => setTrackOutcome((v) => !v)}
              className="flex items-center gap-2 font-mono text-xs text-muted"
            >
              <div
                className={`w-8 h-4 rounded-full transition-colors ${trackOutcome ? "bg-blue-muted" : "bg-border"}`}
              >
                <div
                  className={`w-3 h-3 bg-text rounded-full mt-0.5 transition-transform ${
                    trackOutcome ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                  }`}
                />
              </div>
              Track a measurable outcome
            </button>

            {trackOutcome && (
              <div className="mt-3 space-y-3">
                <input
                  type="text"
                  value={outcomeLabel}
                  onChange={(e) => setOutcomeLabel(e.target.value)}
                  placeholder="Label (e.g. Weight)"
                  className="w-full bg-bg border border-border rounded-card px-3 py-2.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-blue-muted"
                />
                <div className="flex gap-3">
                  <input
                    type="number"
                    value={outcomeTarget}
                    onChange={(e) => setOutcomeTarget(e.target.value)}
                    placeholder="Target (e.g. 160)"
                    className="flex-1 bg-bg border border-border rounded-card px-3 py-2.5 font-mono text-sm text-text placeholder:text-dim focus:outline-none focus:border-blue-muted"
                  />
                  <input
                    type="text"
                    value={outcomeUnit}
                    onChange={(e) => setOutcomeUnit(e.target.value)}
                    placeholder="Unit (e.g. lbs)"
                    className="flex-1 bg-bg border border-border rounded-card px-3 py-2.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-blue-muted"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="w-full bg-blue-muted text-text font-body font-medium py-3.5 rounded-card min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed active:opacity-90 transition-opacity mt-2"
          >
            {saving ? "Creating…" : "Create Goal"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export default function GoalsView({ userName, today, skipAuth }: Props) {
  const router = useRouter();
  const [goals, setGoals] = useState<SerializedGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [todos, setTodos] = useState<TodoEntry[]>([]);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoEntry | null>(null);
  const tomorrow = addDays(today, 1);

  useEffect(() => {
    fetch("/api/goals")
      .then((r) => r.json())
      .then((data: SerializedGoal[]) => {
        setGoals(data);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch(`/api/todos?after=${today}`)
      .then((r) => r.json())
      .then((data: TodoEntry[]) => setTodos(data));
  }, [today]);

  // A todo stays visible in this backlog only while it's strictly in the future —
  // once pulled to today/past it belongs on the Routines page instead.
  const isTodoUpcoming = useCallback((t: TodoEntry) => t.scheduledDate > today, [today]);
  const { toggle: handleToggleTodo, remove: handleDeleteTodo, update: handleUpdateTodo } =
    useTodoActions(todos, setTodos, isTodoUpcoming);

  function refetchTodos() {
    fetch(`/api/todos?after=${today}`)
      .then((r) => r.json())
      .then((data: TodoEntry[]) => setTodos(data));
  }

  function handleCreated(goal: SerializedGoal) {
    setGoals((prev) => [goal, ...prev]);
    setAdding(false);
    router.push(`/goals/${goal._id}`);
  }

  const activeGoals = goals.filter((g) => g.status === "active");
  const otherGoals = goals.filter((g) => g.status !== "active");

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-24">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        {/* Title */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-heading text-xl text-text">Goals</h1>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-blue-muted text-text font-body text-sm font-medium px-3.5 py-2 rounded-pill min-h-[36px] active:opacity-90 transition-opacity"
          >
            <Plus size={14} />
            New Goal
          </button>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-card h-24 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && goals.length === 0 && (
          <div className="bg-card rounded-card px-6 py-14 text-center">
            <Flag size={32} strokeWidth={1.25} className="text-dim mx-auto mb-4" />
            <p className="font-heading text-base text-text mb-1">No goals yet</p>
            <p className="font-body text-sm text-muted mb-6">
              A good man builds toward something.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 bg-blue-muted text-text font-body font-medium px-5 py-3 rounded-card min-h-[44px] active:opacity-90 transition-opacity"
            >
              <Plus size={16} />
              Create your first goal
            </button>
          </div>
        )}

        {!loading && goals.length > 0 && (
          <>
            {/* Active goals */}
            {activeGoals.length > 0 && (
              <section className="mb-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
                  Active
                </p>
                <div className="space-y-2">
                  {activeGoals.map((g) => (
                    <GoalCard
                      key={g._id}
                      goal={g}
                      today={today}
                      onClick={() => router.push(`/goals/${g._id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Other goals (paused / complete / abandoned) */}
            {otherGoals.length > 0 && (
              <section>
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
                  Other
                </p>
                <div className="space-y-2">
                  {otherGoals.map((g) => (
                    <GoalCard
                      key={g._id}
                      goal={g}
                      today={today}
                      onClick={() => router.push(`/goals/${g._id}`)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Future to-dos — anything due today or earlier lives on the Routines page instead */}
        <TodoSection
          todos={todos}
          viewingDate={today}
          title="Upcoming To-Dos"
          addButtonLabel="+ Add Task"
          showDates
          onToggle={handleToggleTodo}
          onDelete={handleDeleteTodo}
          onEdit={setEditingTodo}
          onAdd={() => setAddTodoOpen(true)}
        />
      </div>

      {adding && (
        <AddGoalSheet onClose={() => setAdding(false)} onCreated={handleCreated} />
      )}

      {addTodoOpen && (
        <FABTaskSheet
          date={tomorrow}
          startWithNoGoal
          onClose={() => { setAddTodoOpen(false); refetchTodos(); }}
        />
      )}

      {editingTodo && (
        <EditTodoSheet
          todo={editingTodo}
          onSave={(updates) => handleUpdateTodo(editingTodo._id, updates)}
          onDelete={() => { handleDeleteTodo(editingTodo._id); setEditingTodo(null); }}
          onClose={() => setEditingTodo(null)}
        />
      )}
    </div>
  );
}
