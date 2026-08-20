"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";

interface Virtue {
  _id: string;
  name: string;
  slug: string;
  tagline: string;
  displayName: string;
  order: number;
  essay: string;
  etymology: string;
}

interface Props {
  virtue: Virtue;
  isAdmin: boolean;
  isCurrent: boolean;
  virtueCount: number;
}

export default function VirtueDetailView({ virtue: initial, isAdmin, isCurrent, virtueCount }: Props) {
  const router = useRouter();
  const [virtue, setVirtue] = useState(initial);

  // ── Essay editing ─────────────────────────────────────────────────────────
  const [editingEssay, setEditingEssay] = useState(false);
  const [essayDraft, setEssayDraft] = useState(virtue.essay);
  const [savingEssay, setSavingEssay] = useState(false);
  const essayRef = useRef<HTMLTextAreaElement>(null);

  // ── Etymology editing ─────────────────────────────────────────────────────
  const [editingEtym, setEditingEtym] = useState(false);
  const [etymDraft, setEtymDraft] = useState(virtue.etymology);
  const [savingEtym, setSavingEtym] = useState(false);
  const etymRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  function autoResize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    if (editingEssay && essayRef.current) {
      autoResize(essayRef.current);
      essayRef.current.focus();
      const len = essayRef.current.value.length;
      essayRef.current.setSelectionRange(len, len);
    }
  }, [editingEssay]);

  useEffect(() => {
    if (editingEtym && etymRef.current) {
      autoResize(etymRef.current);
      etymRef.current.focus();
    }
  }, [editingEtym]);

  async function saveEssay() {
    if (savingEssay) return;
    setSavingEssay(true);
    const res = await fetch(`/api/virtues/${virtue._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ essay: essayDraft }),
    });
    if (res.ok) {
      const data = await res.json();
      setVirtue((v) => ({ ...v, essay: data.essay }));
    }
    setSavingEssay(false);
    setEditingEssay(false);
  }

  function cancelEssay() {
    setEssayDraft(virtue.essay);
    setEditingEssay(false);
  }

  async function saveEtymology() {
    if (savingEtym) return;
    setSavingEtym(true);
    const res = await fetch(`/api/virtues/${virtue._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etymology: etymDraft }),
    });
    if (res.ok) {
      const data = await res.json();
      setVirtue((v) => ({ ...v, etymology: data.etymology }));
    }
    setSavingEtym(false);
    setEditingEtym(false);
  }

  function cancelEtym() {
    setEtymDraft(virtue.etymology);
    setEditingEtym(false);
  }

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-24">

        {/* ── Back ── */}
        <div className="flex items-center gap-2 pt-6 pb-2">
          <button
            onClick={() => router.back()}
            className="text-dim hover:text-muted min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="font-mono text-[10px] text-dim uppercase tracking-widest">
            Virtues
          </span>
        </div>

        {/* ── Hero ── */}
        <div className="pt-4 pb-8">
          <div className="flex items-start gap-3 mb-2">
            <span className="font-mono text-[10px] text-dim mt-1">
              {String(virtue.order).padStart(2, "0")} / {virtueCount}
            </span>
            {isCurrent && (
              <span className="font-mono text-[9px] text-gold bg-gold/10 border border-gold/30 px-2 py-0.5 rounded-pill">
                This Week
              </span>
            )}
          </div>
          <h1 className="font-heading text-3xl italic text-text leading-tight mb-3">
            {virtue.displayName}
          </h1>
          <p className="font-body text-base text-muted leading-relaxed">
            {virtue.tagline}
          </p>
        </div>

        {/* ── Etymology ── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
              Etymology
            </p>
            {isAdmin && !editingEtym && (
              <button
                onClick={() => setEditingEtym(true)}
                className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>

          {editingEtym ? (
            <div>
              <textarea
                ref={etymRef}
                value={etymDraft}
                onChange={(e) => {
                  setEtymDraft(e.target.value);
                  autoResize(e.target);
                }}
                placeholder="Word origin, reclaimed meaning…"
                className="w-full bg-card border border-gold/40 rounded-card px-4 py-3 font-body text-sm text-text placeholder:text-dim focus:outline-none resize-none leading-relaxed min-h-[80px]"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={saveEtymology}
                  disabled={savingEtym}
                  className="flex items-center gap-1.5 bg-gold/20 text-gold border border-gold/40 font-mono text-xs px-3 py-1.5 rounded-pill min-h-[32px] disabled:opacity-50"
                >
                  <Check size={11} /> {savingEtym ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={cancelEtym}
                  className="flex items-center gap-1.5 text-dim font-mono text-xs px-3 py-1.5 rounded-pill border border-border min-h-[32px]"
                >
                  <X size={11} /> Cancel
                </button>
              </div>
            </div>
          ) : virtue.etymology ? (
            <p
              className={`font-body text-sm text-muted leading-relaxed ${isAdmin ? "cursor-pointer hover:text-text transition-colors" : ""}`}
              onClick={isAdmin ? () => setEditingEtym(true) : undefined}
            >
              {virtue.etymology}
            </p>
          ) : (
            <p
              className={`font-body text-sm italic ${isAdmin ? "text-dim cursor-pointer hover:text-muted transition-colors" : "text-dim"}`}
              onClick={isAdmin ? () => setEditingEtym(true) : undefined}
            >
              {isAdmin ? "Add etymology →" : "Not written yet."}
            </p>
          )}
        </section>

        {/* ── Divider ── */}
        <div className="border-t border-border mb-8" />

        {/* ── Reflection / Essay ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
              Reflection
            </p>
            {isAdmin && !editingEssay && (
              <button
                onClick={() => setEditingEssay(true)}
                className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>

          {editingEssay ? (
            <div>
              <textarea
                ref={essayRef}
                value={essayDraft}
                onChange={(e) => {
                  setEssayDraft(e.target.value);
                  autoResize(e.target);
                }}
                placeholder={`Write your reflection on what it means to be ${virtue.name.toLowerCase()}…`}
                className="w-full bg-card border border-gold/40 rounded-card px-4 py-4 font-body text-sm text-text placeholder:text-dim focus:outline-none resize-none leading-relaxed min-h-[200px]"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={saveEssay}
                  disabled={savingEssay}
                  className="flex items-center gap-1.5 bg-gold/20 text-gold border border-gold/40 font-mono text-xs px-4 py-2 rounded-pill min-h-[36px] disabled:opacity-50"
                >
                  <Check size={11} /> {savingEssay ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={cancelEssay}
                  className="flex items-center gap-1.5 text-dim font-mono text-xs px-3 py-2 rounded-pill border border-border min-h-[36px]"
                >
                  <X size={11} /> Cancel
                </button>
              </div>
            </div>
          ) : virtue.essay ? (
            <div
              className={isAdmin ? "cursor-pointer group" : ""}
              onClick={isAdmin ? () => setEditingEssay(true) : undefined}
            >
              {virtue.essay.split("\n\n").map((para, i) => (
                <p
                  key={i}
                  className={`font-body text-sm leading-relaxed mb-4 last:mb-0 ${
                    isAdmin ? "text-text group-hover:text-text/80 transition-colors" : "text-text"
                  }`}
                >
                  {para}
                </p>
              ))}
            </div>
          ) : (
            <div
              className={`bg-card rounded-card px-5 py-8 text-center ${isAdmin ? "cursor-pointer hover:bg-card-hover transition-colors border border-dashed border-border-light" : ""}`}
              onClick={isAdmin ? () => setEditingEssay(true) : undefined}
            >
              {isAdmin ? (
                <>
                  <p className="font-heading text-base italic text-dim mb-1">
                    Write your reflection
                  </p>
                  <p className="font-body text-xs text-dim">
                    What does it mean to be {virtue.name.toLowerCase()}? Tap to begin.
                  </p>
                </>
              ) : (
                <p className="font-body text-sm text-dim italic">No reflection written yet.</p>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
