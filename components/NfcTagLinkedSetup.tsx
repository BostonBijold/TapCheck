"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  tagCode: string;
  taskName: string;
  taskIcon: string;
  onDone?: () => void;
  doneLabel?: string;
}

// Shown right after a tag is linked (both the auto-claim branch in
// app/nfc/[tagCode]/page.tsx and the picker path in NfcClaimTagPicker.tsx).
// Each tag gets its own single-action Shortcut built by hand on-device —
// the URL pastes directly into "Get Contents of URL", no separate "Text"
// action needed since nothing is assembled dynamically at runtime. No
// generic/shared Shortcut, no runtime tag reading. NFC Automations only use
// a tag's UID to decide whether to fire; they never forward the tag's NDEF
// content to the Shortcut they run, so a Shortcut has no way to resolve
// "which tag was tapped" itself. Baking the exact URL in here, once, per
// tag, sidesteps that entirely — see docs/features/nfc.md.
export default function NfcTagLinkedSetup({ tagCode, taskName, taskIcon, onDone, doneLabel }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedInstructions, setCopiedInstructions] = useState(false);

  useEffect(() => {
    fetch("/api/user/api-key")
      .then((r) => r.json())
      .then((data: { apiKey?: string }) => setApiKey(data.apiKey ?? null))
      .catch(() => {});
  }, []);

  const triggerUrl = apiKey
    ? `${window.location.origin}/api/external/nfc/${tagCode}?apiKey=${apiKey}`
    : null;

  const openAppUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/tasks`;

  const instructions = triggerUrl
    ? `TapCheck tap trigger for "${taskName}"\n\n1. Open Shortcuts → new Shortcut → add "Get Contents of URL" and paste this directly into its URL field:\n${triggerUrl}\n\n2. (Optional) Want the app to open after tapping instead of staying silent? Add "Open URLs" after it, pointed at: ${openAppUrl}\n\n3. Automation → + → NFC → scan this tag → Run Shortcut → pick the Shortcut you just built → turn off "Ask Before Running" and "Notify When Run".`
    : null;

  const handleCopyUrl = async () => {
    if (!triggerUrl) return;
    try {
      await navigator.clipboard.writeText(triggerUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch { /* clipboard unavailable — URL is still selectable by hand */ }
  };

  const handleCopyInstructions = async () => {
    if (!instructions) return;
    try {
      await navigator.clipboard.writeText(instructions);
      setCopiedInstructions(true);
      setTimeout(() => setCopiedInstructions(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="text-left">
      <h1 className="font-heading text-2xl text-text mb-2 text-center">Tag linked</h1>
      <p className="text-muted font-body text-sm mb-6 text-center">
        This tag now starts <span className="text-text">{taskIcon} {taskName}</span>.
      </p>

      <div className="bg-card rounded-card border border-border p-5 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-2">
          Trigger URL
        </p>
        <p className="font-body text-xs text-muted mb-3">
          Paste this directly into a new Shortcut&apos;s &quot;Get Contents of URL&quot; action — that&apos;s the whole Shortcut, one action. One-time setup, this exact tag only.
        </p>
        {triggerUrl ? (
          <div className="flex items-center gap-2 bg-bg border border-border rounded-card px-3 py-2.5 mb-3">
            <span className="font-mono text-[11px] text-text break-all select-all flex-1">
              {triggerUrl}
            </span>
            <button
              onClick={handleCopyUrl}
              aria-label="Copy trigger URL"
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-dim hover:text-olive transition-colors"
            >
              {copiedUrl ? <Check size={14} className="text-olive" /> : <Copy size={14} />}
            </button>
          </div>
        ) : (
          <p className="font-mono text-xs text-dim mb-3">Loading…</p>
        )}
        <p className="font-body text-xs text-muted leading-relaxed mb-3">
          Then: Shortcuts → Automation → + → NFC → scan this tag → Run Shortcut → pick the Shortcut you just built → turn off &quot;Ask Before Running&quot; and &quot;Notify When Run.&quot;
        </p>
        <p className="font-body text-xs text-dim leading-relaxed">
          Prefer to see the app after tapping instead of pure silence? Add one more Shortcut action — &quot;Open URLs&quot; — pointed at <span className="font-mono text-[11px] select-all">{openAppUrl}</span>. Optional; skip it for a fully silent tap.
        </p>
      </div>

      <button
        onClick={handleCopyInstructions}
        disabled={!instructions}
        className="w-full py-3 rounded-card border border-gold/40 text-gold font-body text-sm min-h-[44px] mb-4 disabled:opacity-40"
      >
        {copiedInstructions ? "Copied!" : "Copy Setup Instructions"}
      </button>

      {onDone ? (
        <button
          type="button"
          onClick={onDone}
          className="block w-full text-center bg-olive text-text font-body font-medium py-3 px-6 rounded-card"
        >
          {doneLabel ?? "Done"}
        </button>
      ) : (
        <a
          href="/tasks"
          className="block text-center bg-olive text-text font-body font-medium py-3 px-6 rounded-card"
        >
          Back to Tasks
        </a>
      )}
    </div>
  );
}
