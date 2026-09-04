"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface LocationOption {
  _id: string;
  name: string;
}

interface Invite {
  _id: string;
  role: "manager" | "employee";
  maxUses: number;
  useCount: number;
  expiresAt: string;
  createdAt: string;
  createdByName: string;
}

interface Props {
  locations: LocationOption[];
  invites: Invite[] | null;
  onGenerated: () => void;
  onRevoke: (id: string) => Promise<void>;
}

// A generous but non-infinite cap for a "reusable" invite — mirrors
// InviteSheet.tsx's mobile constant exactly.
const REUSABLE_MAX_USES = 50;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Owner's invite-generation panel — mirrors InviteSheet.tsx's mobile flow
// (see docs/features/team-invites.md) but desktop-inline rather than a
// bottom sheet, and always shows the location picker since every console
// user is an owner (a location-bound manager's mobile sheet skips it
// entirely, stamping their own locationId instead — see
// docs/features/locations.md's "Invite changes"). No Web Share API call —
// that was a mobile-only fallback; desktop just copies to clipboard. See
// docs/features/admin-console.md's Phase 1b.
export default function InvitePanel({ locations, invites, onGenerated, onRevoke }: Props) {
  const [role, setRole] = useState<"employee" | "manager">("employee");
  const [locationId, setLocationId] = useState(locations[0]?._id ?? "");
  const [reusable, setReusable] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!locationId) {
      setError("Pick a location for this invite.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, locationId, maxUses: reusable ? REUSABLE_MAX_USES : 1 }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLink(data.url);
      onGenerated();
    } catch {
      setError("Couldn't create invite. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link stays selectable by hand */
    }
  };

  return (
    <div className="mt-8">
      <h2 className="font-heading text-lg text-text mb-4">Invite Panel</h2>

      <div className="border border-border rounded-card bg-card p-5 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "employee" | "manager")}
              className="block bg-bg border border-border rounded px-3 py-2 font-body text-sm text-text outline-none focus:border-olive"
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="block bg-bg border border-border rounded px-3 py-2 font-body text-sm text-text outline-none focus:border-olive min-w-[10rem]"
            >
              {locations.length === 0 && <option value="">No locations yet</option>}
              {locations.map((l) => (
                <option key={l._id} value={l._id}>{l.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 font-body text-sm text-muted">
            <input type="checkbox" checked={reusable} onChange={(e) => setReusable(e.target.checked)} />
            Reusable link
          </label>
          <button
            onClick={handleGenerate}
            disabled={generating || !locationId}
            className="bg-olive text-text font-body text-sm font-medium px-4 py-2 rounded-card disabled:opacity-40 transition-opacity"
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>

        {error && <p className="font-mono text-xs text-burgundy-light">{error}</p>}

        {link && (
          <div className="flex items-center gap-2 bg-bg border border-border rounded-card px-3 py-2.5">
            <span className="font-mono text-[11px] text-text break-all select-all flex-1">{link}</span>
            <button onClick={handleCopy} aria-label="Copy invite link" className="flex-shrink-0 text-dim hover:text-olive transition-colors">
              {copied ? <Check size={14} className="text-olive" /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </div>

      <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-3 mt-6">Pending Invites</p>
      {invites === null ? (
        <p className="text-dim font-mono text-xs py-4">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="text-dim font-mono text-xs py-4">No pending invites.</p>
      ) : (
        <div className="border border-border rounded-card overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card-hover text-left">
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Role</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Uses Left</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Expires</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Created By</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i._id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 text-text font-body capitalize">{i.role}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{i.maxUses - i.useCount}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{fmtDate(i.expiresAt)}</td>
                  <td className="px-4 py-3 text-muted font-body text-xs">{i.createdByName}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        setRevokingId(i._id);
                        await onRevoke(i._id);
                        setRevokingId(null);
                      }}
                      disabled={revokingId === i._id}
                      className="font-mono text-[10px] uppercase tracking-widest text-burgundy-light disabled:opacity-40"
                    >
                      {revokingId === i._id ? "Revoking…" : "Revoke"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
