"use client";

import { useState } from "react";
import { X, Copy, Check } from "lucide-react";

interface Props {
  onGenerated: () => void;
  onClose: () => void;
}

// A generous but non-infinite cap for a "reusable" invite (e.g. a QR poster
// in the break room) — not a real limit a manager is expected to hit, just
// avoids a genuinely unbounded link. "Just this person" stays maxUses: 1.
const REUSABLE_MAX_USES = 50;

// Step one of the "+ Invite" flow: pick a role and one-time-vs-reusable,
// generate the link, then share it — see docs/features/team-invites.md's
// "Redemption flow". Mirrors AddTaskListSheet.tsx's layout conventions.
export default function InviteSheet({ onGenerated, onClose }: Props) {
  const [role, setRole] = useState<"employee" | "manager">("employee");
  const [reusable, setReusable] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, maxUses: reusable ? REUSABLE_MAX_USES : 1 }),
      });
      if (!res.ok) throw new Error("Failed to create invite");
      const data = await res.json();
      setInvite({ url: data.url });
      onGenerated();
      // Web Share API — works inside the Capacitor WKWebView with no extra
      // native plugin needed. Silently falls through to the Copy Link
      // button below on any device/browser without it (desktop Chrome, etc).
      if (navigator.share) {
        navigator.share({ title: "Join our team on Ch'rps", url: data.url }).catch(() => {});
      }
    } catch {
      setError("Couldn't create invite. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — link is still selectable by hand */ }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
        <div className="w-full max-w-mobile bg-card rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h2 className="font-heading text-base text-text truncate">Invite to Team</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-dim flex-shrink-0" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          {!invite ? (
            <>
              <div className="px-5 py-5 space-y-5">
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Role</label>
                  <div className="flex gap-2">
                    {(["employee", "manager"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`flex-1 py-3 rounded-card font-body text-sm capitalize border min-h-[44px] transition-colors ${
                          role === r
                            ? "bg-olive/10 border-olive text-olive"
                            : "bg-bg border-border text-muted"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] text-dim uppercase tracking-widest">Uses</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReusable(false)}
                      className={`flex-1 py-3 rounded-card font-body text-sm border min-h-[44px] transition-colors ${
                        !reusable ? "bg-olive/10 border-olive text-olive" : "bg-bg border-border text-muted"
                      }`}
                    >
                      Just this person
                    </button>
                    <button
                      type="button"
                      onClick={() => setReusable(true)}
                      className={`flex-1 py-3 rounded-card font-body text-sm border min-h-[44px] transition-colors ${
                        reusable ? "bg-olive/10 border-olive text-olive" : "bg-bg border-border text-muted"
                      }`}
                    >
                      Reusable link
                    </button>
                  </div>
                </div>

                {error && <p className="font-mono text-xs text-burgundy-light">{error}</p>}
              </div>

              <div className="px-5 pb-5 flex-shrink-0">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full bg-olive text-text font-body font-medium py-3.5 rounded-card min-h-[48px] disabled:opacity-40 transition-opacity"
                >
                  {generating ? "Generating…" : "Generate"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="px-5 py-5 space-y-3">
                <p className="font-body text-sm text-muted">
                  Share this link — opening it is what adds someone to your team.
                </p>
                <div className="flex items-center gap-2 bg-bg border border-border rounded-card px-3 py-2.5">
                  <span className="font-mono text-[11px] text-text break-all select-all flex-1">
                    {invite.url}
                  </span>
                  <button
                    onClick={handleCopy}
                    aria-label="Copy invite link"
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-dim hover:text-olive transition-colors"
                  >
                    {copied ? <Check size={14} className="text-olive" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="px-5 pb-5 flex-shrink-0">
                <button
                  onClick={onClose}
                  className="w-full bg-olive text-text font-body font-medium py-3.5 rounded-card min-h-[48px] transition-opacity"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
