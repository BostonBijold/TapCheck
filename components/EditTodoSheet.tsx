"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import type { TodoEntry } from "@/components/TodoSection";

interface Props {
  todo: TodoEntry;
  onSave: (updates: { name: string; scheduledDate: string; estimatedMinutes: number | null }) => Promise<void> | void;
  onDelete: () => void;
  onClose: () => void;
}

export default function EditTodoSheet({ todo, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(todo.name);
  const [scheduledDate, setScheduledDate] = useState(todo.scheduledDate);
  const [estimatedMins, setEstimatedMins] = useState(
    todo.estimatedMinutes != null ? String(todo.estimatedMinutes) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim() || !scheduledDate) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        scheduledDate,
        estimatedMinutes: estimatedMins ? parseInt(estimatedMins) : null,
      });
      onClose();
    } catch {
      setError("Couldn't save changes. Try again.");
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
        <div className="w-full max-w-mobile bg-card rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: "80dvh" }}>
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
            <h2 className="font-heading text-lg text-text">Edit To-Do</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                Task name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What needs to get done?"
                autoFocus
                className="w-full bg-bg border border-border rounded-card px-3 py-3 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
              />
            </div>

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

            {error && <p className="font-mono text-xs text-burgundy-light">{error}</p>}
          </div>

          <div className="px-5 pb-5 pt-1 flex-shrink-0 flex gap-2">
            <button
              onClick={onDelete}
              aria-label="Delete to-do"
              className="flex items-center justify-center px-4 border border-burgundy/30 text-burgundy-light rounded-card min-h-[48px]"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={save}
              disabled={!name.trim() || !scheduledDate || saving}
              className="flex-1 bg-blue-muted text-text font-body font-medium py-3.5 rounded-card min-h-[48px] disabled:opacity-40 transition-opacity"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
