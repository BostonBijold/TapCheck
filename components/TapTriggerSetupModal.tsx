"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface Props {
  apiKey: string | null;
  shortcutUrl: string;
  onClose: () => void;
}

export default function TapTriggerSetupModal({ apiKey, shortcutUrl, onClose }: Props) {
  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-mobile mx-auto flex flex-col"
        style={{ maxHeight: "90dvh" }}
      >
        <div className="bg-bg border-t border-border rounded-t-modal flex flex-col overflow-hidden"
          style={{ maxHeight: "90dvh" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-border-light" />
          </div>

          {/* Header row */}
          <div className="flex items-start justify-between px-5 pt-2 pb-4 flex-shrink-0">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-gold mb-1">
                Tap Triggers
              </p>
              <h2 className="font-heading text-xl text-text leading-snug">
                Set Up Silent Triggers
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-dim flex items-center justify-center min-w-[44px] min-h-[44px] -mr-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto px-5 pb-2 flex-1">
            <div className="space-y-7 pb-4">
              <div>
                <h3 className="font-heading text-base text-gold mb-2">
                  1. Import the Shortcut
                </h3>
                <div className="space-y-3">
                  <p className="font-body text-sm text-text leading-relaxed">
                    Open the share link below and tap &quot;Add Shortcut.&quot; You only need to do this once — every tag you set up afterward reuses the same Shortcut.
                  </p>
                  <a
                    href={shortcutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-mono text-[11px] text-olive-light break-all"
                  >
                    {shortcutUrl}
                  </a>
                </div>
              </div>

              <div>
                <h3 className="font-heading text-base text-gold mb-2">
                  2. Paste Your API Key
                </h3>
                <div className="space-y-3">
                  <p className="font-body text-sm text-text leading-relaxed">
                    While importing, Shortcuts will ask you to enter a value. Paste your personal API key — it&apos;s baked into your copy of the Shortcut permanently, so you&apos;ll never be asked for it again.
                  </p>
                  {apiKey ? (
                    <div className="bg-card border border-border rounded-card px-3 py-2.5">
                      <span className="font-mono text-[11px] text-text break-all select-all">
                        {apiKey}
                      </span>
                    </div>
                  ) : (
                    <p className="font-mono text-xs text-dim">Loading…</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-heading text-base text-gold mb-2">
                  3. One Automation Per Tag
                </h3>
                <p className="font-body text-sm text-text leading-relaxed">
                  For each physical tag: Shortcuts app → Automation → + → NFC → scan the tag → Run Shortcut → select your personalized Shortcut → turn off &quot;Ask Before Running&quot; and &quot;Notify When Run.&quot; This is a one-time step per tag.
                </p>
              </div>

              <div>
                <h3 className="font-heading text-base text-gold mb-2">
                  4. Relinking Tags Just Works
                </h3>
                <p className="font-body text-sm text-text leading-relaxed">
                  If you later relink a tag to a different habit in the app, nothing here needs to change — the Automation always looks up the tag&apos;s current habit at tap time, not at setup time.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 pt-3 pb-6 flex-shrink-0 border-t border-border">
            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-card bg-olive text-text font-body font-medium min-h-[44px]"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
