"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";

interface LocationRow {
  _id: string;
  name: string;
  address: string | null;
  timezone: string | null;
}

interface Draft {
  name: string;
  address: string;
  timezone: string;
}

const EMPTY_DRAFT: Draft = { name: "", address: "", timezone: "" };

// GET /api/locations only ever returns active locations (a closed one just
// disappears, same soft-delete convention as TaskList) — so there is no
// "closed" row to ever render here, and no Status column: every row on this
// table is active by construction of the API. See
// docs/features/admin-console.md's Phase 1a.
export default function LocationsTable() {
  const [locations, setLocations] = useState<LocationRow[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchLocations = () => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then(setLocations)
      .catch(() => setLocations([]));
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const startEdit = (loc: LocationRow) => {
    setEditingId(loc._id);
    setAdding(false);
    setDraft({ name: loc.name, address: loc.address ?? "", timezone: loc.timezone ?? "" });
    setError("");
  };

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError("");
  };

  const cancel = () => {
    setEditingId(null);
    setAdding(false);
    setError("");
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({
        name: draft.name.trim(),
        address: draft.address.trim() || null,
        timezone: draft.timezone.trim() || null,
      });
      const res = editingId
        ? await fetch(`/api/locations/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) throw new Error();
      cancel();
      fetchLocations();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (loc: LocationRow) => {
    if (!window.confirm(`Close ${loc.name}? Its history is kept, but it won't appear anywhere active.`)) return;
    setBusy(true);
    await fetch(`/api/locations/${loc._id}`, { method: "DELETE" });
    setLocations((prev) => (prev ? prev.filter((l) => l._id !== loc._id) : prev));
    setBusy(false);
  };

  return (
    <div>
      <div className="border border-border rounded-card overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card-hover text-left">
              <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Name</th>
              <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Address</th>
              <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Timezone</th>
              <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations === null ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-dim font-mono text-xs">Loading…</td>
              </tr>
            ) : locations.length === 0 && !adding ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-dim font-mono text-xs">No locations yet.</td>
              </tr>
            ) : (
              locations.map((loc) =>
                editingId === loc._id ? (
                  <EditRow key={loc._id} draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} busy={busy} />
                ) : (
                  <tr key={loc._id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-text font-body">{loc.name}</td>
                    <td className="px-4 py-3 text-muted font-body">{loc.address ?? "—"}</td>
                    <td className="px-4 py-3 text-muted font-mono text-xs">{loc.timezone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => startEdit(loc)} aria-label="Edit" className="text-dim hover:text-olive transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleClose(loc)} aria-label="Close location" className="text-dim hover:text-burgundy-light transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )
            )}
            {adding && <EditRow draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} busy={busy} />}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-3 font-mono text-xs text-burgundy-light">{error}</p>}

      {!adding && (
        <button
          onClick={startAdd}
          className="mt-4 flex items-center gap-2 border border-dashed border-border-light text-dim font-body text-sm px-4 py-2.5 rounded-card hover:border-olive/40 hover:text-olive transition-colors"
        >
          + Add Location
        </button>
      )}
    </div>
  );
}

function EditRow({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-b-0 bg-olive/5">
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
          value={draft.address}
          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          placeholder="Address (optional)"
          className="w-full bg-bg border border-border rounded px-2 py-1.5 font-body text-sm text-text outline-none focus:border-olive"
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={draft.timezone}
          onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
          placeholder="America/Chicago"
          className="w-full bg-bg border border-border rounded px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-olive"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-3">
          <button onClick={onSave} disabled={busy} aria-label="Save" className="text-olive disabled:opacity-40">
            <Check size={16} />
          </button>
          <button onClick={onCancel} disabled={busy} aria-label="Cancel" className="text-dim disabled:opacity-40">
            <X size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}
