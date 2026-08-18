"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import HabitIcon from "@/components/HabitIcon";
import { emitRoutineLogChanged } from "@/lib/routine-log-events";

interface HabitRow {
  _id: string;
  name: string;
  icon: string;
  itemType: string;
  done: boolean;
}

interface Props {
  date: string;
  onClose: () => void;
}

export default function FABHabitSheet({ date, onClose }: Props) {
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    fetch(`/api/habits?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        setHabits(data);
        setLoading(false);
      });
  }, [date]);

  const toggleDone = async (habit: HabitRow) => {
    if (habit.done || pending.has(habit._id)) return;
    setPending((p) => new Set(p).add(habit._id));
    try {
      await fetch("/api/routine-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routineItemId: habit._id,
          date,
          state: "done",
          actualMinutes: 0,
        }),
      });
      setHabits((prev) =>
        prev.map((h) => (h._id === habit._id ? { ...h, done: true } : h))
      );
      emitRoutineLogChanged();
    } finally {
      setPending((p) => { const next = new Set(p); next.delete(habit._id); return next; });
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
        <div className="w-full max-w-mobile bg-card rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: "75dvh" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
            <h2 className="font-heading text-lg text-text">Log a Habit</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-dim hover:text-muted transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <p className="font-mono text-xs text-dim text-center py-8">Loading…</p>
            ) : habits.length === 0 ? (
              <p className="font-mono text-xs text-dim text-center py-8">No standalone habits found.</p>
            ) : (
              <ul className="divide-y divide-border">
                {habits.map((habit) => {
                  const isDone = habit.done;
                  const isLoading = pending.has(habit._id);
                  return (
                    <li key={habit._id}>
                      <button
                        onClick={() => toggleDone(habit)}
                        disabled={isDone || isLoading}
                        className={`w-full flex items-center gap-4 px-5 py-4 transition-colors text-left ${
                          isDone ? "opacity-40" : "hover:bg-card-hover active:bg-card-hover"
                        }`}
                      >
                        <div className="w-7 flex items-center justify-center flex-shrink-0">
                          <HabitIcon
                            name={habit.icon}
                            size={18}
                            className={isDone ? "text-olive" : "text-muted"}
                          />
                        </div>
                        <span className={`flex-1 font-body text-sm ${isDone ? "text-dim line-through" : "text-text"}`}>
                          {habit.name}
                        </span>
                        {/* Checkbox */}
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isDone
                            ? "bg-olive border-olive"
                            : "border-border-light"
                        }`}>
                          {isDone && (
                            <span className="text-bg text-xs leading-none font-bold">✓</span>
                          )}
                          {isLoading && !isDone && (
                            <span className="text-dim text-xs leading-none">…</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
