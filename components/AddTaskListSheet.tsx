"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  onCreated: (taskList: { _id: string; name: string; startTime: string | null }) => void;
  onClose: () => void;
}

// Step one of the "Add Task List" flow: name + start time. Once created,
// the caller opens AddTaskSheet against the new list's id — the exact same
// browse-catalog-or-build-custom flow already used for the standalone
// anytime task list, so building out a new list's tasks isn't a separate
// code path.
export default function AddTaskListSheet({ onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/task-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), startTime: startTime || null }),
      });
      if (!res.ok) throw new Error("Failed to create task list");
      const taskList = await res.json();
      onCreated(taskList);
    } catch {
      setError("Couldn't create task list. Try again.");
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
        <div className="w-full max-w-mobile bg-card rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="font-heading text-base text-text truncate">Add Task List</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim flex-shrink-0" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-5 space-y-5">
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                List name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Delivery Check-In"
                autoFocus
                className="w-full bg-bg border border-border rounded-card px-3 py-3 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                Start time <span className="text-dim normal-case font-body">(optional — leave blank for an anytime list)</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-bg border border-border rounded-card px-3 py-3 font-mono text-sm text-text outline-none focus:border-border-light"
                style={{ colorScheme: "light" }}
              />
            </div>

            {error && (
              <p className="font-mono text-xs text-burgundy-light">{error}</p>
            )}
          </div>

          <div className="px-5 pb-5 flex-shrink-0">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="w-full bg-olive text-text font-body font-medium py-3.5 rounded-card min-h-[48px] disabled:opacity-40 transition-opacity"
            >
              {saving ? "Creating…" : "Create & Add Tasks"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
