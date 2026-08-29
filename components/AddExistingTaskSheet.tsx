"use client";

import { useEffect, useState } from "react";
import { X, Search } from "lucide-react";
import AppIcon from "@/components/AppIcon";

interface Definition {
  _id: string;
  name: string;
  icon: string;
  formFields: unknown[];
  placements: Array<{ taskListId: string }>;
}

interface Props {
  taskListId: string;
  onAdd: (definitionId: string) => Promise<void>;
  onClose: () => void;
}

// Places an EXISTING company saved task (TaskDefinition) into this list —
// the new capability alongside AddTaskSheet's "browse the template catalog
// or build custom" flow, which always creates a brand-new saved task. See
// docs/features/task-lists.md's "Company Task Catalog" section. A saved
// task already placed in this exact list is excluded — placing it twice in
// the same list has no meaning.
export default function AddExistingTaskSheet({ taskListId, onAdd, onClose }: Props) {
  const [definitions, setDefinitions] = useState<Definition[] | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/task-definitions")
      .then((r) => r.json())
      .then(setDefinitions)
      .catch(() => setDefinitions([]));
  }, []);

  const available = (definitions ?? []).filter(
    (d) => !d.placements.some((p) => p.taskListId === taskListId)
  );
  const filtered = available.filter(
    (d) => search.trim() === "" || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const handlePick = async (d: Definition) => {
    setAdding(d._id);
    await onAdd(d._id);
    setAdding(null);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-mobile mx-auto">
        <div className="bg-card rounded-t-modal max-h-[80vh] flex flex-col">
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-border-light" />
          </div>

          <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
            <h2 className="font-heading text-lg text-text">Use an existing task</h2>
            <button onClick={onClose} className="text-dim min-h-[44px] min-w-[44px] flex items-center justify-end" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="px-4 mb-3 flex-shrink-0">
            <div className="flex items-center gap-2 bg-bg border border-border rounded-card px-3 py-2">
              <Search size={14} className="text-dim flex-shrink-0" />
              <input
                type="text"
                placeholder="Search saved tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent font-body text-sm text-text placeholder:text-dim outline-none"
              />
            </div>
          </div>

          <div className="overflow-y-auto px-4 pb-8">
            {definitions === null && (
              <p className="text-dim font-mono text-xs text-center py-8">Loading…</p>
            )}
            {definitions !== null && filtered.length === 0 && (
              <p className="text-dim font-mono text-xs text-center py-8">
                {available.length === 0 ? "Every saved task is already in this list." : `No tasks match "${search}"`}
              </p>
            )}
            {filtered.length > 0 && (
              <div className="bg-bg rounded-card divide-y divide-border overflow-hidden">
                {filtered.map((d) => (
                  <div key={d._id} className="flex items-center gap-3 px-3 py-3">
                    <div className="w-7 flex items-center justify-center flex-shrink-0">
                      <AppIcon name={d.icon} size={17} className="text-muted" />
                    </div>
                    <span className="flex-1 font-body text-sm text-text">{d.name}</span>
                    <span className="font-mono text-dim text-xs flex-shrink-0">
                      {d.formFields.length} field{d.formFields.length === 1 ? "" : "s"}
                    </span>
                    <button
                      onClick={() => handlePick(d)}
                      disabled={adding === d._id}
                      className="ml-2 bg-olive/15 hover:bg-olive/30 border border-olive/30 text-olive font-mono text-xs px-3 py-1.5 rounded-pill transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {adding === d._id ? "…" : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
