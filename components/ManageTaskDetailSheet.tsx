"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Nfc } from "lucide-react";
import AppIcon from "@/components/AppIcon";

interface UsedInEntry {
  taskListId: string;
  taskListName: string;
}

interface TagBinding {
  nfcTagUid: string | null;
  busy: boolean;
  error: string | null;
  alsoBoundTo: string[];
  onScanToLink: () => void;
  onUnbind: () => void;
}

interface Props {
  icon: string;
  name: string;
  meta: string;
  usedIn?: UsedInEntry[];
  tagBinding?: TagBinding;
  editHref?: string;
  editLabel?: string;
  onDelete: () => void;
  deleteLabel: string;
  deleting: boolean;
  blockedMessage?: string | null;
  onClose: () => void;
}

// Shared detail-on-tap sheet for Manage Tasks' compact rows (Standalone
// Tasks and Company Task Catalog) — reuses AddTaskSheet's bottom-sheet
// presentation so a manager sees the same "used in"/tag-binding/edit/delete
// detail that used to render inline on every card, but only when they
// actually tap in for it. `usedIn`/`tagBinding` are omitted for a
// Standalone Tasks row, which has neither concept at the placement level.
export default function ManageTaskDetailSheet({
  icon,
  name,
  meta,
  usedIn,
  tagBinding,
  editHref,
  editLabel,
  onDelete,
  deleteLabel,
  deleting,
  blockedMessage,
  onClose,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-mobile mx-auto">
        <div className="bg-card rounded-t-modal max-h-[80vh] flex flex-col">
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-border-light" />
          </div>

          <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 flex items-center justify-center flex-shrink-0">
                <AppIcon name={icon} size={18} className="text-muted" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-lg text-text truncate">{name}</h2>
                <p className="font-mono text-[10px] text-dim mt-0.5">{meta}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-dim min-h-[44px] min-w-[44px] flex items-center justify-end flex-shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="px-4 pb-8 overflow-y-auto space-y-4">
            {usedIn && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5">
                  Used In
                </p>
                {usedIn.length > 0 ? (
                  <p className="font-body text-sm text-text">
                    {usedIn.map((p) => p.taskListName).join(", ")}
                  </p>
                ) : (
                  <p className="font-mono text-xs text-dim">Not placed in any list</p>
                )}
              </div>
            )}

            {tagBinding && (
              <div className="pt-3 border-t border-border">
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5 flex items-center gap-1.5">
                  <Nfc size={11} strokeWidth={1.75} />
                  Scan-to-Complete Tag
                </p>
                {tagBinding.nfcTagUid ? (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-olive flex-1 truncate">
                      Bound · {tagBinding.nfcTagUid}
                    </span>
                    <button
                      type="button"
                      onClick={tagBinding.onUnbind}
                      disabled={tagBinding.busy}
                      className="font-mono text-[11px] text-burgundy-light px-2 py-1 disabled:opacity-40"
                    >
                      Unbind
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={tagBinding.onScanToLink}
                    disabled={tagBinding.busy}
                    className="font-mono text-[11px] text-olive border border-olive/30 bg-olive/10 px-3 py-1.5 rounded-pill disabled:opacity-40"
                  >
                    {tagBinding.busy ? "Hold near tag…" : "Scan to Link"}
                  </button>
                )}
                {tagBinding.error && (
                  <p className="font-mono text-[11px] text-burgundy-light mt-1.5">{tagBinding.error}</p>
                )}
                {tagBinding.alsoBoundTo.length > 0 && (
                  <p className="font-mono text-[11px] text-dim mt-1.5">
                    Also bound to: {tagBinding.alsoBoundTo.join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
              {editHref ? (
                <Link href={editHref} className="font-mono text-[10px] text-olive uppercase tracking-widest">
                  {editLabel}
                </Link>
              ) : (
                <span />
              )}
              <button
                onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
                disabled={deleting}
                className="font-mono text-[10px] text-burgundy-light uppercase tracking-widest disabled:opacity-50"
              >
                {deleting ? `${deleteLabel === "Delete" ? "Deleting" : "Removing"}…` : confirmingDelete ? `Confirm ${deleteLabel}` : deleteLabel}
              </button>
            </div>

            {blockedMessage && (
              <p className="font-mono text-[10px] text-burgundy-light">{blockedMessage}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
