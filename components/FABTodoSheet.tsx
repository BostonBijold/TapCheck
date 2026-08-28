"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface Props {
  date: string;
  onClose: () => void;
}

export default function FABTodoSheet({ date, onClose }: Props) {
  const router = useRouter();
  const [todoName, setTodoName] = useState("");
  const [scheduledDate, setScheduledDate] = useState(date);
  const [estimatedMins, setEstimatedMins] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const addTodo = async () => {
    if (!todoName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: todoName.trim(),
          scheduledDate: scheduledDate || date,
          estimatedMinutes: estimatedMins ? parseInt(estimatedMins) : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save to-do");
      router.refresh();
      onClose();
    } catch {
      setError("Couldn't save to-do. Try again.");
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
        <div className="w-full max-w-mobile bg-card rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: "80dvh" }}>
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="font-heading text-base text-text truncate">To-Do</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim flex-shrink-0" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
            {/* To-do name */}
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                To-do name
              </label>
              <input
                type="text"
                value={todoName}
                onChange={(e) => setTodoName(e.target.value)}
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
                style={{ colorScheme: "light" }}
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
              onClick={addTodo}
              disabled={!todoName.trim() || saving}
              className="w-full bg-blue-muted text-text font-body font-medium py-3.5 rounded-card min-h-[48px] disabled:opacity-40 transition-opacity"
            >
              {saving ? "Saving…" : "Add To-Do"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
