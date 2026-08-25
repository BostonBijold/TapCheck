"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  tagCode: string;
  itemName: string;
  itemIcon: string;
  onDone?: () => void;
  doneLabel?: string;
}

// Shown right after a card is linked (both the auto-claim branch in
// app/nfc/[tagCode]/page.tsx and the picker path in ClaimTagPicker.tsx).
// Each card gets its own tiny 2-action Shortcut built by hand on-device —
// no generic/shared Shortcut, no runtime tag reading. NFC Automations only
// use a tag's UID to decide whether to fire; they never forward the tag's
// NDEF content to the Shortcut they run, so a Shortcut has no way to
// resolve "which card was tapped" itself. Baking the exact URL in here,
// once, per card, sidesteps that entirely — see docs/features/nfc.md.
export default function TagLinkedSetup({ tagCode, itemName, itemIcon, onDone, doneLabel }: Props) {
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

  const instructions = triggerUrl
    ? `Be One tap trigger for "${itemName}"\n\n1. Open Shortcuts → new Shortcut → add "Text" with this URL:\n${triggerUrl}\n\n2. Add "Get Contents of URL" using that Text as input.\n\n3. Automation → + → NFC → scan this card → Run Shortcut → pick the Shortcut you just built → turn off "Ask Before Running" and "Notify When Run".`
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
      <h1 className="font-heading text-2xl text-text mb-2 text-center">Card linked</h1>
      <p className="text-muted font-body text-sm mb-6 text-center">
        This card now starts <span className="text-text">{itemIcon} {itemName}</span>.
      </p>

      <div className="bg-card rounded-card border border-border p-5 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-2">
          Trigger URL
        </p>
        <p className="font-body text-xs text-muted mb-3">
          Paste this into a new Shortcut&apos;s &quot;Text&quot; action, then add &quot;Get Contents of URL&quot; after it — that&apos;s the whole Shortcut. One-time setup, this exact card only.
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
        <p className="font-body text-xs text-muted leading-relaxed">
          Then: Shortcuts → Automation → + → NFC → scan this card → Run Shortcut → pick the Shortcut you just built → turn off &quot;Ask Before Running&quot; and &quot;Notify When Run.&quot;
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
          href="/routines"
          className="block text-center bg-olive text-text font-body font-medium py-3 px-6 rounded-card"
        >
          Back to Routines
        </a>
      )}
    </div>
  );
}
