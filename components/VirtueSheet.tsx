"use client";

import { useState, useRef, useEffect } from "react";
import { X, Pencil, Check } from "lucide-react";

export interface VirtueData {
  _id: string;
  name: string;
  slug: string;
  tagline: string;
  displayName: string;
  order: number;
  essay: string;
  etymology: string;
  virtueCount: number;
}

interface Props {
  virtue: VirtueData;
  isAdmin: boolean;
  onClose: () => void;
  onEssayChange: (essay: string) => void;
}

export default function VirtueSheet({ virtue, isAdmin, onClose, onEssayChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(virtue.essay);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const res = await fetch(`/api/virtues/${virtue._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ essay: draft }),
    });
    if (res.ok) {
      onEssayChange(draft);
    }
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setDraft(virtue.essay);
    setEditing(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-card border-t border-border rounded-t-[16px] z-10 max-h-[88vh] flex flex-col">
        {/* Handle + close */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-2">
          <div className="w-10 h-1 bg-border rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
          <div className="w-6" /> {/* spacer */}
          <button
            onClick={onClose}
            className="text-dim hover:text-muted min-w-[36px] min-h-[36px] flex items-center justify-center ml-auto"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 pb-10 flex-1">
          {/* Virtue name */}
          <div className="mb-1">
            <span className="font-mono text-[10px] text-gold uppercase tracking-widest">
              Week {virtue.order} of {virtue.virtueCount}
            </span>
          </div>
          <h2 className="font-heading text-2xl italic text-text leading-tight mb-2">
            {virtue.displayName}
          </h2>
          <p className="font-body text-sm text-muted leading-relaxed mb-8">
            {virtue.tagline}
          </p>

          {/* Reflection */}
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
              Reflection
            </p>
            {isAdmin && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>

          {editing ? (
            <div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); autoResize(e.target); }}
                placeholder={`What does it mean to be ${virtue.name.toLowerCase()}?`}
                className="w-full bg-bg border border-gold/40 rounded-card px-4 py-4 font-body text-sm text-text placeholder:text-dim focus:outline-none resize-none leading-relaxed min-h-[180px]"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-gold/20 text-gold border border-gold/40 font-mono text-xs px-4 py-2 rounded-pill min-h-[36px] disabled:opacity-50"
                >
                  <Check size={11} /> {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={cancel}
                  className="flex items-center gap-1.5 text-dim font-mono text-xs px-3 py-2 rounded-pill border border-border min-h-[36px]"
                >
                  <X size={11} /> Cancel
                </button>
              </div>
            </div>
          ) : virtue.essay ? (
            <div
              className={isAdmin ? "cursor-pointer" : ""}
              onClick={isAdmin ? () => setEditing(true) : undefined}
            >
              {virtue.essay.split("\n\n").map((para, i) => (
                <p key={i} className="font-body text-sm text-text leading-relaxed mb-4 last:mb-0">
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <div
              className={`bg-bg rounded-card px-5 py-8 text-center ${isAdmin ? "cursor-pointer hover:bg-card-hover transition-colors border border-dashed border-border-light" : ""}`}
              onClick={isAdmin ? () => setEditing(true) : undefined}
            >
              {isAdmin ? (
                <>
                  <p className="font-heading text-base italic text-dim mb-1">Write your reflection</p>
                  <p className="font-body text-xs text-dim">
                    What does it mean to be {virtue.name.toLowerCase()}? Tap to begin.
                  </p>
                </>
              ) : (
                <p className="font-body text-sm italic text-dim">No reflection written yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
