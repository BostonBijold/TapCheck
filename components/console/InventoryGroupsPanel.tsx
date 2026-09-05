"use client";

import { useState } from "react";
import { Pencil, Trash2, Check } from "lucide-react";

export interface GroupRow {
  _id: string;
  name: string;
}

interface Props {
  groups: GroupRow[] | null;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}

// Persistent Groups CRUD panel below the main item-type table (Open
// Question #3, resolved as a persistent second list rather than a modal/
// slide-over — same "no detour" reasoning, and the same layout precedent
// as components/console/JobTagsPanel.tsx sitting below TeamTable.tsx).
// Archiving a group ungroups its member items server-side (see
// lib/inventory.ts's archiveInventoryGroup) — this panel doesn't need to
// reflect that itself, since the item-types table refetches after any
// group mutation. See docs/features/console-inventory.md.
export default function InventoryGroupsPanel({ groups, onCreate, onRename, onArchive }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError("");
    try {
      await onCreate(name);
      setNewName("");
    } catch {
      setError("Couldn't create that group. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (g: GroupRow) => {
    setEditingId(g._id);
    setEditingName(g.name);
  };

  const commitEdit = async (id: string) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    setBusyId(id);
    await onRename(id, name);
    setBusyId(null);
  };

  return (
    <div className="mt-8">
      <h2 className="font-heading text-lg text-text mb-1">Manage Groups</h2>
      <p className="font-body text-sm text-muted mb-4">
        Organizational sections for the item-type table above — archiving a group ungroups its items rather than deleting them.
      </p>

      <div className="border border-border rounded-card bg-card p-5 space-y-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1 flex-1">
            <label className="font-mono text-[10px] text-dim uppercase tracking-widest">New Group</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. Freezer"
              className="block w-full bg-bg border border-border rounded px-3 py-2 font-body text-sm text-text outline-none focus:border-olive"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="bg-olive text-text font-body text-sm font-medium px-4 py-2 rounded-card disabled:opacity-40 transition-opacity"
          >
            {creating ? "Adding…" : "Add Group"}
          </button>
        </div>

        {error && <p className="font-mono text-xs text-burgundy-light">{error}</p>}

        {groups === null ? (
          <p className="text-dim font-mono text-xs">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-dim font-mono text-xs">No groups yet — every item sits in &quot;Ungrouped&quot;.</p>
        ) : (
          <div className="space-y-1.5">
            {groups.map((g) => (
              <div key={g._id} className="flex items-center gap-2 bg-bg border border-border rounded-card px-3 py-2">
                {editingId === g._id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commitEdit(g._id)}
                    onBlur={() => commitEdit(g._id)}
                    className="flex-1 bg-transparent font-body text-sm text-text outline-none"
                  />
                ) : (
                  <span className="flex-1 font-body text-sm text-text">{g.name}</span>
                )}
                <button
                  onClick={() => (editingId === g._id ? commitEdit(g._id) : startEdit(g))}
                  disabled={busyId === g._id}
                  aria-label={editingId === g._id ? `Save ${g.name}` : `Rename ${g.name}`}
                  className="text-dim hover:text-olive disabled:opacity-40"
                >
                  {editingId === g._id ? <Check size={14} /> : <Pencil size={14} />}
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Archive "${g.name}"? Its items move to "Ungrouped".`)) return;
                    setBusyId(g._id);
                    await onArchive(g._id);
                    setBusyId(null);
                  }}
                  disabled={busyId === g._id}
                  aria-label={`Archive ${g.name}`}
                  className="text-dim hover:text-burgundy-light disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
