"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";

export interface ItemTypeRow {
  _id: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  groupId: string | null;
  currentCount: number | null;
  lastLoggedAt: string | null;
  lastLoggedByName: string | null;
  belowPar: boolean;
}

export interface GroupRow {
  _id: string;
  name: string;
}

export interface HistoryEntry {
  _id: string;
  count: number;
  loggedAt: string;
  loggedByName: string;
}

interface Draft {
  name: string;
  unit: string;
  parLevel: string;
}

const EMPTY_DRAFT: Draft = { name: "", unit: "", parLevel: "" };
// A distinct sentinel from "" (Ungrouped) so the Add-row's group <select>
// can offer inline group creation without colliding with "no group" —
// mirrors how AddInventoryItemTypeSheet.tsx's mobile "+ New Group" option
// works, see docs/features/console-inventory.md.
const NEW_GROUP_SENTINEL = "__new__";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface Props {
  itemTypes: ItemTypeRow[] | null;
  groups: GroupRow[] | null;
  onCreate: (draft: { name: string; unit: string | null; parLevel: number | null; groupId: string | null }) => Promise<void>;
  onCreateGroup: (name: string) => Promise<GroupRow>;
  onUpdate: (id: string, patch: { name?: string; unit?: string | null; parLevel?: number | null; groupId?: string | null }) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onLogCount: (id: string, count: number) => Promise<{ ok: boolean; error?: string }>;
  onFetchHistory: (id: string) => Promise<HistoryEntry[]>;
}

// Grouped item-type table for /console/inventory — follows the console's
// Phase 1a table convention (LocationsTable.tsx's inline edit-row swap)
// rather than Task Management's two-pane layout, since item types are
// flatter to edit (name/unit/par/group, no nested fields). No NFC field
// anywhere in this table — see docs/features/console-inventory.md's "NFC
// — explicitly out of scope for this pass". Logging a count is always an
// inline input+button in the row itself (Open Question #1, resolved
// toward speed); viewing history is a separate per-row expand toggle
// (Open Question #2) fetched on demand via GET /api/inventory-logs.
export default function InventoryItemTypesTable({
  itemTypes,
  groups,
  onCreate,
  onCreateGroup,
  onUpdate,
  onArchive,
  onLogCount,
  onFetchHistory,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [addGroupId, setAddGroupId] = useState<string>("");
  const [addingNewGroup, setAddingNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});
  const [countErrors, setCountErrors] = useState<Record<string, string>>({});
  const [loggingId, setLoggingId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const startEdit = (it: ItemTypeRow) => {
    setEditingId(it._id);
    setAdding(false);
    setDraft({ name: it.name, unit: it.unit ?? "", parLevel: it.parLevel !== null ? String(it.parLevel) : "" });
    setError("");
  };

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setAddGroupId("");
    setAddingNewGroup(false);
    setNewGroupName("");
    setError("");
  };

  const cancel = () => {
    setEditingId(null);
    setAdding(false);
    setError("");
  };

  const parseParLevel = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusyId("__form__");
    setError("");
    try {
      if (editingId) {
        await onUpdate(editingId, { name: draft.name.trim(), unit: draft.unit.trim() || null, parLevel: parseParLevel(draft.parLevel) });
      } else {
        let groupId = addGroupId || null;
        if (addingNewGroup) {
          if (!newGroupName.trim()) {
            setError("New group name is required.");
            setBusyId(null);
            return;
          }
          const created = await onCreateGroup(newGroupName.trim());
          groupId = created._id;
        }
        await onCreate({ name: draft.name.trim(), unit: draft.unit.trim() || null, parLevel: parseParLevel(draft.parLevel), groupId });
      }
      cancel();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (it: ItemTypeRow) => {
    if (!window.confirm(`Archive "${it.name}"? Its history is kept, but it won't appear anywhere active.`)) return;
    setBusyId(it._id);
    await onArchive(it._id);
    setBusyId(null);
  };

  const handleGroupChange = async (it: ItemTypeRow, groupId: string) => {
    setBusyId(it._id);
    await onUpdate(it._id, { groupId: groupId || null });
    setBusyId(null);
  };

  const handleLogCount = async (it: ItemTypeRow) => {
    const raw = countDrafts[it._id] ?? "";
    const count = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(count)) return;
    setLoggingId(it._id);
    setCountErrors((prev) => ({ ...prev, [it._id]: "" }));
    const result = await onLogCount(it._id, count);
    setLoggingId(null);
    if (result.ok) {
      setCountDrafts((prev) => ({ ...prev, [it._id]: "" }));
      if (expandedId === it._id) {
        setHistory(await onFetchHistory(it._id));
      }
    } else {
      setCountErrors((prev) => ({ ...prev, [it._id]: result.error ?? "Couldn't save that count." }));
    }
  };

  const toggleHistory = async (it: ItemTypeRow) => {
    if (expandedId === it._id) {
      setExpandedId(null);
      setHistory(null);
      return;
    }
    setExpandedId(it._id);
    setHistory(null);
    setHistory(await onFetchHistory(it._id));
  };

  const sections = (() => {
    if (!itemTypes || !groups) return [];
    const byGroup = new Map<string | null, ItemTypeRow[]>();
    for (const it of itemTypes) {
      const key = it.groupId;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(it);
    }
    const result: { id: string | null; name: string; items: ItemTypeRow[] }[] = [];
    for (const g of groups) result.push({ id: g._id, name: g.name, items: byGroup.get(g._id) ?? [] });
    const ungrouped = byGroup.get(null) ?? [];
    if (ungrouped.length > 0 || result.length === 0) result.push({ id: null, name: "Ungrouped", items: ungrouped });
    return result;
  })();

  const renderRow = (it: ItemTypeRow) => {
    if (editingId === it._id) {
      return (
        <tr key={it._id} className="border-b border-border last:border-b-0 bg-olive/5">
          <td className="px-4 py-2">
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name"
              className="w-full bg-bg border border-border rounded px-2 py-1.5 font-body text-sm text-text outline-none focus:border-olive"
            />
          </td>
          <td className="px-4 py-2">
            <input
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              placeholder="rolls, cases…"
              className="w-full bg-bg border border-border rounded px-2 py-1.5 font-body text-sm text-text outline-none focus:border-olive"
            />
          </td>
          <td className="px-4 py-2">
            <input
              type="number"
              value={draft.parLevel}
              onChange={(e) => setDraft({ ...draft, parLevel: e.target.value })}
              placeholder="Par level"
              className="w-24 bg-bg border border-border rounded px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-olive"
            />
          </td>
          <td className="px-4 py-2" colSpan={3} />
          <td className="px-4 py-2">
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={busyId === "__form__"} aria-label="Save" className="text-olive disabled:opacity-40">
                <Check size={16} />
              </button>
              <button onClick={cancel} disabled={busyId === "__form__"} aria-label="Cancel" className="text-dim disabled:opacity-40">
                <X size={16} />
              </button>
            </div>
          </td>
        </tr>
      );
    }

    const isExpanded = expandedId === it._id;
    return (
      <>
        <tr key={it._id} className="border-b border-border last:border-b-0">
          <td className="px-4 py-3 text-text font-body">{it.name}</td>
          <td className="px-4 py-3 text-muted font-body">{it.unit ?? "—"}</td>
          <td className={`px-4 py-3 font-mono text-xs ${it.belowPar ? "text-burgundy-light font-medium" : "text-muted"}`}>
            <span className="flex items-center gap-1">
              {it.belowPar && <TriangleAlert size={12} strokeWidth={2} />}
              {it.currentCount ?? "—"}
              {it.parLevel !== null && <span className="text-dim">/{it.parLevel}</span>}
            </span>
          </td>
          <td className="px-4 py-3">
            <select
              value={it.groupId ?? ""}
              onChange={(e) => handleGroupChange(it, e.target.value)}
              disabled={busyId === it._id}
              className="bg-bg border border-border rounded px-2 py-1 font-body text-xs text-text outline-none focus:border-olive disabled:opacity-50"
            >
              <option value="">Ungrouped</option>
              {(groups ?? []).map((g) => (
                <option key={g._id} value={g._id}>{g.name}</option>
              ))}
            </select>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={countDrafts[it._id] ?? ""}
                onChange={(e) => setCountDrafts((prev) => ({ ...prev, [it._id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleLogCount(it)}
                placeholder="Count"
                className="w-20 bg-bg border border-border rounded px-2 py-1 font-mono text-xs text-text outline-none focus:border-olive"
              />
              <button
                onClick={() => handleLogCount(it)}
                disabled={loggingId === it._id || (countDrafts[it._id] ?? "").trim() === ""}
                className="font-mono text-[10px] uppercase tracking-widest text-olive disabled:opacity-30"
              >
                {loggingId === it._id ? "…" : "Log"}
              </button>
            </div>
            {countErrors[it._id] && <p className="font-mono text-[10px] text-burgundy-light mt-1 max-w-[14rem]">{countErrors[it._id]}</p>}
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-3">
              <button onClick={() => toggleHistory(it)} aria-label="Toggle history" className="text-dim hover:text-olive transition-colors">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button onClick={() => startEdit(it)} disabled={busyId === it._id} aria-label="Edit" className="text-dim hover:text-olive transition-colors disabled:opacity-40">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleArchive(it)} disabled={busyId === it._id} aria-label="Archive" className="text-dim hover:text-burgundy-light transition-colors disabled:opacity-40">
                <Trash2 size={14} />
              </button>
            </div>
          </td>
        </tr>
        {isExpanded && (
          <tr key={`${it._id}-history`} className="border-b border-border last:border-b-0 bg-bg">
            <td colSpan={6} className="px-4 py-3">
              {history === null ? (
                <p className="font-mono text-[11px] text-dim">Loading…</p>
              ) : history.length === 0 ? (
                <p className="font-mono text-[11px] text-dim">No counts logged yet.</p>
              ) : (
                <div className="space-y-1">
                  {history.map((h) => (
                    <div key={h._id} className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-text w-12">{h.count}{it.unit ? ` ${it.unit}` : ""}</span>
                      <span className="text-dim">{fmtDate(h.loggedAt)}</span>
                      <span className="text-muted">· {h.loggedByName}</span>
                    </div>
                  ))}
                </div>
              )}
            </td>
          </tr>
        )}
      </>
    );
  };

  return (
    <div>
      {itemTypes === null || groups === null ? (
        <div className="border border-border rounded-card bg-card px-4 py-8 text-center">
          <p className="font-mono text-xs text-dim">Loading…</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.id ?? "__ungrouped__"}>
              <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-2">
                {section.name} <span className="text-dim">· {section.items.length}</span>
              </p>
              <div className="border border-border rounded-card overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card-hover text-left">
                      <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Name</th>
                      <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Unit</th>
                      <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Current / Par</th>
                      <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Group</th>
                      <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Log a Count</th>
                      <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-dim font-mono text-xs">No items in this group yet.</td>
                      </tr>
                    ) : (
                      section.items.map(renderRow)
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-4 border border-border rounded-card bg-card p-4 space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Name</label>
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Toilet Paper"
                className="block bg-bg border border-border rounded px-3 py-2 font-body text-sm text-text outline-none focus:border-olive"
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Unit</label>
              <input
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                placeholder="rolls"
                className="block bg-bg border border-border rounded px-3 py-2 font-body text-sm text-text outline-none focus:border-olive w-28"
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Par Level</label>
              <input
                type="number"
                value={draft.parLevel}
                onChange={(e) => setDraft({ ...draft, parLevel: e.target.value })}
                className="block bg-bg border border-border rounded px-3 py-2 font-mono text-sm text-text outline-none focus:border-olive w-24"
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Group</label>
              {addingNewGroup ? (
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="New group name"
                  className="block bg-bg border border-border rounded px-3 py-2 font-body text-sm text-text outline-none focus:border-olive w-40"
                />
              ) : (
                <select
                  value={addGroupId}
                  onChange={(e) => {
                    if (e.target.value === NEW_GROUP_SENTINEL) {
                      setAddingNewGroup(true);
                      setAddGroupId("");
                    } else {
                      setAddGroupId(e.target.value);
                    }
                  }}
                  className="block bg-bg border border-border rounded px-3 py-2 font-body text-sm text-text outline-none focus:border-olive w-40"
                >
                  <option value="">Ungrouped</option>
                  {(groups ?? []).map((g) => (
                    <option key={g._id} value={g._id}>{g.name}</option>
                  ))}
                  <option value={NEW_GROUP_SENTINEL}>+ New Group…</option>
                </select>
              )}
            </div>
            <button
              onClick={save}
              disabled={busyId === "__form__" || !draft.name.trim()}
              className="bg-olive text-text font-body text-sm font-medium px-4 py-2 rounded-card disabled:opacity-40"
            >
              {busyId === "__form__" ? "Saving…" : "Save"}
            </button>
            <button onClick={cancel} className="font-mono text-xs text-dim px-2 py-2">Cancel</button>
          </div>
          {error && <p className="font-mono text-xs text-burgundy-light">{error}</p>}
        </div>
      )}

      {!adding && (
        <button
          onClick={startAdd}
          className="mt-4 flex items-center gap-2 border border-dashed border-border-light text-dim font-body text-sm px-4 py-2.5 rounded-card hover:border-olive/40 hover:text-olive transition-colors"
        >
          + Add Item Type
        </button>
      )}
    </div>
  );
}
