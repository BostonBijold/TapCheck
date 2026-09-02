"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface CreatedItemType {
  _id: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  nfcTagUid: string | null;
  currentCount: number | null;
  lastLoggedAt: string | null;
  lastLoggedByName: string | null;
}

interface Props {
  onCreated: (itemType: CreatedItemType) => void;
  onClose: () => void;
}

// Manager-only "add item type" flow — name/unit/par level only. NFC binding
// is a separate step from the item's own detail screen once it exists
// (mirrors the task catalog's create-then-bind flow) — see
// docs/features/inventory.md.
export default function AddInventoryItemTypeSheet({ onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [parLevel, setParLevel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
