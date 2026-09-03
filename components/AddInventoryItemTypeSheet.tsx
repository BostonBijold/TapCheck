"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface CreatedItemType {
  _id: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  nfcTagUid: string | null;
  nfcRequiredToLog: boolean;
  groupId: string | null;
  currentCount: number | null;
  lastLoggedAt: string | null;
  lastLoggedByName: string | null;
  belowPar: boolean;
}

interface Group {
  _id: string;
  name: string;
}

interface Props {
  onCreated: (itemType: CreatedItemType) => void;
  onClose: () => void;
}

// Manager-only "add item type" flow — name/unit/par level/group. NFC
// binding and the nfcRequiredToLog toggle are a separate step from the
// item's own detail screen once it exists (mirrors the task catalog's
// create-then-bind flow) — see docs/features/inventory.md.
export default function AddInventoryItemTypeSheet({ onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [parLevel, setParLevel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Group picker — defaults to "Ungrouped" (null), with a "+ New Group"
  // inline option that creates an InventoryGroup on the fly without leaving
  // this sheet — see docs/features/inventory.md's "Grouping". ──
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);

  useEffect(() => {
    fetch("/api/inventory-groups")
      .then((r) => (r.ok ? r.json() : []))
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setGroupBusy(true);
    try {
      const res = await fetch("/api/inventory-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create group");
      const group = await res.json();
      setGroups((prev) => [...prev, group]);
      setGroupId(group._id);
      setNewGroupName("");
      setCreatingGroup(false);
    } catch {
      setError("Couldn't create group. Try again.");
    } finally {
      setGroupBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/inventory-item-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          unit: unit.trim() || null,
          parLevel: parLevel.trim() ? Number(parLevel) : null,
          groupId,
        }),
      });
      if (!res.ok) throw new Error("Failed to create item type");
      const itemType = await res.json();
      onCreated(itemType);
    } catch {
      setError("Couldn't create item type. Try again.");
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
              <h2 className="font-heading text-base text-text truncate">Add Item Type</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim flex-shrink-0" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-5 space-y-5">
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Toilet Paper"
                autoFocus
                className="w-full bg-bg border border-border rounded-card px-3 py-3 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                Unit <span className="text-dim normal-case font-body">(optional — e.g. rolls, cases, lbs)</span>
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. rolls"
                className="w-full bg-bg border border-border rounded-card px-3 py-3 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
                Par level <span className="text-dim normal-case font-body">(optional — informational only)</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={parLevel}
                onChange={(e) => setParLevel(e.target.value)}
                placeholder="e.g. 20"
                className="w-full bg-bg border border-border rounded-card px-3 py-3 font-mono text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Group</label>
              <select
                value={groupId ?? ""}
                onChange={(e) => setGroupId(e.target.value || null)}
                className="w-full bg-bg border border-border rounded-card px-3 py-3 font-body text-sm text-text outline-none focus:border-border-light"
              >
                <option value="">Ungrouped</option>
                {groups.map((g) => (
                  <option key={g._id} value={g._id}>{g.name}</option>
                ))}
              </select>
              {creatingGroup ? (
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="New group name"
                    autoFocus
                    className="flex-1 bg-bg border border-border rounded-card px-3 py-2.5 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
                  />
                  <button
                    type="button"
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim() || groupBusy}
                    className="font-mono text-[11px] text-olive border border-olive/30 bg-olive/10 px-3 rounded-card disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingGroup(true)}
                  className="font-mono text-[11px] text-olive pt-1"
                >
                  + New Group
                </button>
              )}
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
              {saving ? "Creating…" : "Create Item Type"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
