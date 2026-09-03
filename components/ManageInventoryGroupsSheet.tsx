"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Group {
  _id: string;
  name: string;
}

interface Props {
  onClose: () => void;
  // Called after any change (rename/archive/create) so InventoryView.tsx
  // can re-fetch groups + item types (an archived group ungroups its items,
  // which changes item rows too) — simpler than threading incremental
  // updates back through this sheet.
  onChanged: () => void;
}

// Manager-only group CRUD (list/rename/archive) — see
// docs/features/inventory.md's "Grouping". Archiving a group does NOT
// archive its items; every member InventoryItemType's groupId is set back
// to null ("Ungrouped") as part of the same request.
export default function ManageInventoryGroupsSheet({ onClose, onChanged }: Props) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchGroups = () => {
    fetch("/api/inventory-groups")
      .then((r) => (r.ok ? r.json() : []))
      .then(setGroups)
      .catch(() => setGroups([]));
  };

  useEffect(fetchGroups, []);

  const startEdit = (g: Group) => {
    setEditingId(g._id);
    setEditName(g.name);
  };

  const saveRename = async (id: string) => {
    if (!editName.trim()) return;
    setBusyId(id);
    try {
      await fetch(`/api/inventory-groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditingId(null);
      fetchGroups();
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (g: Group) => {
    if (!window.confirm(`Archive "${g.name}"? Its items will move to Ungrouped — their history is untouched.`)) return;
    setBusyId(g._id);
    try {
      await fetch(`/api/inventory-groups/${g._id}`, { method: "DELETE" });
      fetchGroups();
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="w-full sm:max-w-mobile sm:mx-5 bg-card rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[80vh]">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="font-heading text-base text-text truncate">Manage Groups</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim flex-shrink-0" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto p-3 space-y-1">
            {groups === null && (
              <p className="text-dim font-mono text-xs text-center py-8">Loading…</p>
            )}
            {groups !== null && groups.length === 0 && (
              <p className="text-dim font-body text-sm text-center py-8 px-5">
                No groups yet — create one from &quot;+ Add Item Type.&quot;
              </p>
            )}
            {groups?.map((g) => (
              <div key={g._id} className="flex items-center gap-2 px-3 py-2.5 rounded-card min-h-[44px]">
                {editingId === g._id ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="flex-1 bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-border-light"
                    />
                    <button
                      type="button"
                      onClick={() => saveRename(g._id)}
                      disabled={!editName.trim() || busyId === g._id}
                      className="font-mono text-[11px] text-olive px-2 disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="font-mono text-[11px] text-dim px-2">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 font-body text-sm text-text truncate">{g.name}</span>
                    <button
                      type="button"
                      onClick={() => startEdit(g)}
                      className="font-mono text-[11px] text-olive px-2"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => archive(g)}
                      disabled={busyId === g._id}
                      className="font-mono text-[11px] text-burgundy-light px-2 disabled:opacity-40"
                    >
                      Archive
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
