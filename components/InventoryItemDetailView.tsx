"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { ChevronLeft, Nfc } from "lucide-react";
import Header from "@/components/Header";
import { scanNfcTag } from "@/lib/native/nfc-scan";
import { playNotificationSound, type NotificationSound } from "@/lib/notification-sound";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface ItemType {
  _id: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  nfcTagUid: string | null;
}

interface LogEntry {
  _id: string;
  count: number;
  loggedAt: string;
  loggedByName: string;
  verifiedNfcUid: string | null;
}

interface Props {
  userName: string;
  today: string;
  skipAuth: boolean;
  isManager: boolean;
  notificationSound: NotificationSound;
  preVerifiedNfcUid: string | null;
  itemType: ItemType;
}

// Item detail/log screen — see docs/features/inventory.md. Logging a count
// NEVER requires the bound tag (unlike a TaskDefinition's Scan NFC step) —
// "Save" always works with just the typed number; a bound tag is a
// shortcut/verification layer on top, not a gate. `preVerifiedNfcUid`
// (from the FAB's "scan to open" shortcut) pre-satisfies that verification
// the same way TaskFormScreen.tsx's own preVerifiedNfcUid does, one save's
// worth — this page is a fresh mount per scan, so there's no multi-use
// concern to guard against the way TasksView.tsx's shared preVerified state
// has to.
export default function InventoryItemDetailView({
  userName,
  today,
  skipAuth,
  isManager,
  notificationSound,
  preVerifiedNfcUid,
  itemType,
}: Props) {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[] | null>(null);

  const fetchLogs = () => {
    fetch(`/api/inventory-logs?itemTypeId=${itemType._id}&limit=20`)
      .then((r) => r.json())
      .then(setLogs)
      .catch(() => setLogs([]));
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemType._id]);

  const currentCount = logs && logs.length > 0 ? logs[0].count : null;

  // ── Log a new count ───────────────────────────────────────────────────
  const [countInput, setCountInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const alreadyVerified = !!preVerifiedNfcUid && !!itemType.nfcTagUid && preVerifiedNfcUid === itemType.nfcTagUid;

  const submitLog = async (verifiedNfcUid: string | null) => {
    const count = Number(countInput);
    if (countInput.trim() === "" || !Number.isFinite(count)) {
      setSaveError("Enter a count first");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/inventory-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemTypeId: itemType._id, count, verifiedNfcUid }),
      });
      if (!res.ok) throw new Error("Failed to save");
      if (verifiedNfcUid) playNotificationSound(notificationSound);
      setCountInput("");
      fetchLogs();
    } catch {
      setSaveError("Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    // Pre-verified from the FAB scan on the way in — save with that uid
    // directly, no second scan (mirrors TaskFormScreen.tsx's alreadyVerified).
    if (alreadyVerified) {
      submitLog(preVerifiedNfcUid);
      return;
    }
    submitLog(null);
  };

  const handleSaveViaNfc = async () => {
    setSaveError(null);
    if (!Capacitor.isNativePlatform()) {
      setSaveError("Open the app on your phone to scan the linked tag.");
      return;
    }
    setScanning(true);
    const result = await scanNfcTag();
    setScanning(false);
    if (result.status === "unsupported") {
      setSaveError("Open the app on your phone to scan the linked tag.");
      return;
    }
    if (result.status === "cancelled") {
      setSaveError(result.message);
      return;
    }
    if (result.uid !== itemType.nfcTagUid) {
      // Never a hard gate — the manual Save button below still works. This
      // just means the scan didn't verify anything, so it isn't stored as
      // verified — see models/InventoryLog.ts.
      setSaveError("That's not this item's linked tag — saved counts still work without scanning.");
      return;
    }
    submitLog(result.uid);
  };

  // ── Manager: edit item type + bind/unbind tag + archive ────────────────
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(itemType.name);
  const [editUnit, setEditUnit] = useState(itemType.unit ?? "");
  const [editParLevel, setEditParLevel] = useState(itemType.parLevel !== null ? String(itemType.parLevel) : "");
  const [savingEdit, setSavingEdit] = useState(false);

  const [nfcTagUid, setNfcTagUid] = useState<string | null>(itemType.nfcTagUid);
  const [bindBusy, setBindBusy] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  const [alsoBoundTo, setAlsoBoundTo] = useState<string[]>([]);

  const [archiving, setArchiving] = useState(false);

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSavingEdit(true);
    try {
      await fetch(`/api/inventory-item-types/${itemType._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          unit: editUnit.trim() || null,
          parLevel: editParLevel.trim() ? Number(editParLevel) : null,
        }),
      });
      router.refresh();
    } finally {
      setSavingEdit(false);
      setEditing(false);
    }
  };

  async function handleScanToLink() {
    setBindError(null);
    if (!Capacitor.isNativePlatform()) {
      setBindError("Open the app on your phone to scan a tag.");
      return;
    }
    setBindBusy(true);
    const result = await scanNfcTag();
    if (result.status !== "ok") {
      setBindBusy(false);
      setBindError(result.status === "unsupported" ? "NFC isn't available on this device." : result.message);
      return;
    }
    try {
      const res = await fetch(`/api/inventory-item-types/${itemType._id}/nfc-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: result.uid }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to bind tag");
      const body = await res.json();
      setNfcTagUid(result.uid);
      setAlsoBoundTo(body.alsoBoundTo ?? []);
    } catch (err) {
      setBindError(err instanceof Error ? err.message : "Failed to bind tag");
    } finally {
      setBindBusy(false);
    }
  }

  async function handleUnbindTag() {
    setBindBusy(true);
    setBindError(null);
    try {
      const res = await fetch(`/api/inventory-item-types/${itemType._id}/nfc-tag`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to unbind tag");
      setNfcTagUid(null);
      setAlsoBoundTo([]);
    } catch (err) {
      setBindError(err instanceof Error ? err.message : "Failed to unbind tag");
    } finally {
      setBindBusy(false);
    }
  }

  const handleArchive = async () => {
    if (!window.confirm(`Archive "${itemType.name}"? Its history stays intact, but it drops off the Inventory tab.`)) return;
    setArchiving(true);
    await fetch(`/api/inventory-item-types/${itemType._id}`, { method: "DELETE" });
    router.push("/inventory");
  };

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        <div className="mt-4 mb-5 flex items-center gap-2">
          <Link href="/inventory" className="flex items-center gap-1 text-muted font-body text-sm min-h-[44px]" aria-label="Back">
            <ChevronLeft size={16} />
          </Link>
          <h1 className="font-heading text-xl text-text truncate">{itemType.name}</h1>
        </div>

        {/* ── Current count ──────────────────────────────────────────────── */}
        <div className="bg-card rounded-card border border-border p-5 text-center">
          <p className="font-mono text-4xl text-text">
            {currentCount !== null ? currentCount : "—"}
            {itemType.unit && <span className="text-lg text-dim ml-1.5">{itemType.unit}</span>}
          </p>
          <p className="font-mono text-[10px] text-dim uppercase tracking-widest mt-2">
            {logs && logs.length > 0
              ? `Logged ${formatRelativeTime(logs[0].loggedAt)} by ${logs[0].loggedByName}`
              : "Not yet logged"}
          </p>
        </div>

        {/* ── Log a new count ────────────────────────────────────────────── */}
        <div className="mt-4 space-y-2.5">
          <label className="font-mono text-[10px] text-dim uppercase tracking-widest block">
            Log new count
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={countInput}
            onChange={(e) => { setCountInput(e.target.value); if (saveError) setSaveError(null); }}
            placeholder={itemType.unit ? `Count, in ${itemType.unit}` : "Current count"}
            className="w-full bg-bg border border-border rounded-card px-3 py-3 font-mono text-lg text-text placeholder:text-dim outline-none focus:border-border-light"
          />

          {alreadyVerified && (
            <p className="font-mono text-[11px] text-olive">Tag verified — Save to log this count</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || scanning}
              className="flex-1 bg-olive text-text font-body font-medium py-3.5 rounded-card min-h-[48px] disabled:opacity-40 transition-opacity"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {nfcTagUid && !alreadyVerified && (
              <button
                onClick={handleSaveViaNfc}
                disabled={saving || scanning}
                className="flex-1 flex items-center justify-center gap-2 border border-olive/30 bg-olive/10 text-olive font-body font-medium py-3.5 rounded-card min-h-[48px] disabled:opacity-40 transition-opacity"
              >
                <Nfc size={16} strokeWidth={1.75} />
                {scanning ? "Hold near tag…" : "Save via NFC"}
              </button>
            )}
          </div>

          {saveError && (
            <p className="font-mono text-xs text-burgundy-light">{saveError}</p>
          )}
        </div>

        {/* ── Recent history ─────────────────────────────────────────────── */}
        <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-3 mt-8">
          Recent History
        </p>
        {logs === null && (
          <p className="text-dim font-mono text-xs text-center py-6">Loading…</p>
        )}
        {logs !== null && logs.length === 0 && (
          <p className="text-dim font-mono text-xs text-center py-6">No counts logged yet.</p>
        )}
        <div className="space-y-1.5">
          {logs?.map((log) => (
            <div key={log._id} className="flex items-center justify-between bg-card rounded-card border border-border px-4 py-3">
              <div>
                <p className="font-mono text-sm text-text">
                  {log.count}{itemType.unit && <span className="text-dim ml-1">{itemType.unit}</span>}
                </p>
                <p className="font-mono text-[10px] text-dim mt-0.5">
                  {log.loggedByName} · {formatRelativeTime(log.loggedAt)}
                </p>
              </div>
              {log.verifiedNfcUid && (
                <Nfc size={13} className="text-olive flex-shrink-0" strokeWidth={1.75} />
              )}
            </div>
          ))}
        </div>

        {/* ── Manager: edit / bind / archive ─────────────────────────────── */}
        {isManager && (
          <div className="mt-8 pt-4 border-t border-border">
            <button
              onClick={() => setEditing((e) => !e)}
              className="font-mono text-[10px] text-olive uppercase tracking-widest"
            >
              {editing ? "Hide Edit Item Type" : "Edit Item Type"}
            </button>

            {editing && (
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-card border border-border rounded-card px-3 py-2.5 font-body text-sm text-text outline-none focus:border-border-light"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Unit</label>
                    <input
                      type="text"
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                      className="w-full bg-card border border-border rounded-card px-3 py-2.5 font-body text-sm text-text outline-none focus:border-border-light"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Par Level</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editParLevel}
                      onChange={(e) => setEditParLevel(e.target.value)}
                      className="w-full bg-card border border-border rounded-card px-3 py-2.5 font-mono text-sm text-text outline-none focus:border-border-light"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editName.trim() || savingEdit}
                  className="w-full bg-olive text-text font-body font-medium py-3 rounded-card min-h-[44px] disabled:opacity-40 transition-opacity"
                >
                  {savingEdit ? "Saving…" : "Save Changes"}
                </button>

                {/* Location tag — Part 1's multi-target model: optional,
                    never gates logging a count, same "Scan to Link"/"Unbind"
                    pattern as TaskListEditView.tsx's Scan-to-Complete panel.
                    See docs/features/nfc.md's "Multi-target binding". */}
                <div className="pt-3 border-t border-border">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5 flex items-center gap-1.5">
                    <Nfc size={11} strokeWidth={1.75} />
                    Location Tag
                  </p>
                  {nfcTagUid ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-olive flex-1 truncate">
                        Bound · {nfcTagUid}
                      </span>
                      <button
                        type="button"
                        onClick={handleUnbindTag}
                        disabled={bindBusy}
                        className="font-mono text-[11px] text-burgundy-light px-2 py-1 disabled:opacity-40"
                      >
                        Unbind
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleScanToLink}
                      disabled={bindBusy}
                      className="font-mono text-[11px] text-olive border border-olive/30 bg-olive/10 px-3 py-1.5 rounded-pill disabled:opacity-40"
                    >
                      {bindBusy ? "Hold near tag…" : "Scan to Link"}
                    </button>
                  )}
                  <p className="font-body text-[11px] text-dim mt-1.5">
                    Optional — bind a physical tag at this item&apos;s storage location for a quicker, verified log. Never required: Save always works without it.
                  </p>
                  {bindError && (
                    <p className="font-mono text-[11px] text-burgundy-light mt-1.5">{bindError}</p>
                  )}
                  {alsoBoundTo.length > 0 && (
                    <p className="font-mono text-[11px] text-dim mt-1.5">
                      Also bound to: {alsoBoundTo.join(", ")}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="w-full font-mono text-[11px] text-burgundy-light uppercase tracking-widest py-2 disabled:opacity-50"
                >
                  {archiving ? "Archiving…" : "Archive Item Type"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
