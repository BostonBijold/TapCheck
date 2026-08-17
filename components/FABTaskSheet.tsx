"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronLeft } from "lucide-react";

interface Goal {
  _id: string;
  name: string;
  status: string;
}

type Target = { kind: "goal"; goal: Goal } | { kind: "none" };

interface Props {
  date: string;
  onClose: () => void;
  // Skip the goal picker and open straight into a goal-less to-do form.
  startWithNoGoal?: boolean;
}

type View = "goals" | "form";

export default function FABTaskSheet({ date, onClose, startWithNoGoal }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>(startWithNoGoal ? "form" : "goals");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Target | null>(startWithNoGoal ? { kind: "none" } : null);
  const [taskName, setTaskName] = useState("");
  const [scheduledDate, setScheduledDate] = useState(date);
  const [estimatedMins, setEstimatedMins] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    // The goal picker is never shown in this mode, so there's nothing to fetch for.
    if (startWithNoGoal) return;
    fetch("/api/goals")
      .then((r) => r.json())
      .then((data: Goal[]) => {
        setGoals(data.filter((g) => g.status === "active"));
        setLoading(false);
      });
  }, [startWithNoGoal]);

  const selectTarget = (t: Target) => {
    setTarget(t);
    setTaskName("");
    setScheduledDate(date);
    setEstimatedMins("");
    setError("");
    setView("form");
  };

  const addTask = async () => {
    if (!taskName.trim() || !target) return;
    setSaving(true);
    setError("");
    try {
      const res =
        target.kind === "goal"
          ? await fetch(`/api/goals/${target.goal._id}/quick-task`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: taskName.trim(),
                scheduledDate: scheduledDate || undefined,
                estimatedMinutes: estimatedMins ? parseInt(estimatedMins) : undefined,
              }),
            })
          : await fetch("/api/todos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: taskName.trim(),
                scheduledDate: scheduledDate || date,
                estimatedMinutes: estimatedMins ? parseInt(estimatedMins) : undefined,
              }),
            });
      if (!res.ok) throw new Error("Failed to save task");
      router.refresh();
      onClose();
    } catch {
      setError("Couldn't save task. Try again.");
      setSaving(false);
    }
  };

  const formTitle = target?.kind === "goal" ? target.goal.name : "To-Do";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
        <div className="w-full max-w-mobile bg-card rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: "80dvh" }}>

          {/* ── Goal list ─────────────────────────────────────────────────── */}
          {view === "goals" && (
            <>
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
                <h2 className="font-heading text-lg text-text">Add Task</h2>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim" aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 pt-4 flex-shrink-0">
                <button
                  onClick={() => selectTarget({ kind: "none" })}
                  className="w-full flex items-center gap-3 bg-blue-muted/10 border border-blue-muted/30 rounded-card px-4 py-3.5 text-left hover:bg-blue-muted/15 transition-colors"
                >
                  <span className="flex-1 font-body text-sm text-blue-muted font-medium">
                    Just for today — no goal
                  </span>
                  <ChevronLeft size={14} className="text-blue-muted rotate-180 flex-shrink-0" />
                </button>
              </div>

              <p className="font-mono text-[10px] text-dim uppercase tracking-widest px-5 pt-4 pb-2 flex-shrink-0">
                Or link to a goal
              </p>
              <div className="overflow-y-auto flex-1">
                {loading ? (
                  <p className="font-mono text-xs text-dim text-center py-8">Loading…</p>
                ) : goals.length === 0 ? (
                  <p className="font-mono text-xs text-dim text-center py-8">No active goals found.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {goals.map((goal) => (
                      <li key={goal._id}>
                        <button
                          onClick={() => selectTarget({ kind: "goal", goal })}
                          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-card-hover active:bg-card-hover transition-colors text-left"
                        >
                          <span className="flex-1 font-body text-sm text-text">{goal.name}</span>
                          <ChevronLeft size={14} className="text-dim rotate-180 flex-shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {/* ── Task form ─────────────────────────────────────────────────── */}
          {view === "form" && target && (
            <>
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
                {!startWithNoGoal && (
                  <button
                    onClick={() => setView("goals")}
                    className="w-8 h-8 flex items-center justify-center text-dim hover:text-muted transition-colors flex-shrink-0"
                    aria-label="Back"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-heading text-base text-text truncate">{formTitle}</h2>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim flex-shrink-0" aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
                {/* Task name */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                    Task name
                  </label>
                  <input
                    type="text"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                    placeholder="What needs to get done?"
                    autoFocus
                    className="w-full bg-bg border border-border rounded-card px-3 py-3 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
                  />
                </div>

                {/* Scheduled date */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                    Scheduled date
                  </label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-bg border border-border rounded-card px-3 py-3 font-mono text-sm text-text outline-none focus:border-border-light"
                    style={{ colorScheme: "dark" }}
                  />
                </div>

                {/* Estimated minutes */}
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                    Estimated minutes <span className="text-dim normal-case font-body">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={estimatedMins}
                    onChange={(e) => setEstimatedMins(e.target.value)}
                    placeholder="30"
                    className="w-full bg-bg border border-border rounded-card px-3 py-3 font-mono text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
                  />
                </div>

                {error && (
                  <p className="font-mono text-xs text-burgundy-light">{error}</p>
                )}
              </div>

              <div className="px-5 pb-5 flex-shrink-0">
                <button
                  onClick={addTask}
                  disabled={!taskName.trim() || saving}
                  className="w-full bg-blue-muted text-text font-body font-medium py-3.5 rounded-card min-h-[48px] disabled:opacity-40 transition-opacity"
                >
                  {saving ? "Saving…" : "Add Task"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
