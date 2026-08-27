"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Plus, Check, Pencil, EyeOff, Eye, Grid3x3, List as ListIcon } from "lucide-react";

interface QuoteRow {
  _id: string;
  text: string;
  author: string;
  genre: string;
  virtue: string | null;
  virtueDayIndex: number | null;
  source: string | null;
  lengthTier: "short" | "medium" | "long";
  isActive: boolean;
  createdAt: string;
}

interface VirtueOption {
  slug: string;
  name: string;
}

interface Props {
  onClose: () => void;
}

const OCCURRENCE_COUNT = 4;
const DAYS_PER_OCCURRENCE = 7;

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// ── Add / edit form ──────────────────────────────────────────────────────────

function QuoteForm({
  initial, genreOptions, virtueOptions, onSave, onCancel, saving,
}: {
  initial?: Partial<QuoteRow>;
  genreOptions: string[];
  virtueOptions: VirtueOption[];
  onSave: (fields: {
    text: string; author: string; genre: string;
    virtue: string | null; virtueDayIndex: number | null; source: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [genre, setGenre] = useState(initial?.genre ?? "");
  const [virtue, setVirtue] = useState(initial?.virtue ?? "");
  const [virtueDayIndex, setVirtueDayIndex] = useState(
    initial?.virtueDayIndex != null ? String(initial.virtueDayIndex) : ""
  );
  const [source, setSource] = useState(initial?.source ?? "");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const idx = virtueDayIndex.trim() ? Number(virtueDayIndex) : null;
    if (idx != null && (idx < 1 || idx > 28)) {
      setError("Day index must be between 1 and 28");
      return;
    }
    try {
      await onSave({
        text: text.trim(),
        author: author.trim(),
        genre: genre.trim(),
        virtue: virtue.trim() || null,
        virtueDayIndex: idx,
        source: source.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div className="bg-bg border border-border rounded-card p-4 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Quote text"
        rows={3}
        className="w-full bg-card border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold resize-none"
      />
      <input
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder="Author"
        className="w-full bg-card border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
      />
      <input
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
        placeholder="Genre (stoic, movie, videogame…)"
        list="quote-genre-options"
        className="w-full bg-card border border-border rounded-card px-3 py-2 font-mono text-xs text-muted outline-none focus:border-gold"
      />
      <datalist id="quote-genre-options">
        {genreOptions.map((g) => <option key={g} value={g} />)}
      </datalist>
      <div className="flex gap-2">
        <select
          value={virtue}
          onChange={(e) => setVirtue(e.target.value)}
          className="flex-1 bg-card border border-border rounded-card px-3 py-2 font-mono text-xs text-muted outline-none focus:border-gold"
        >
          <option value="">No virtue</option>
          {virtueOptions.map((v) => (
            <option key={v.slug} value={v.slug}>{v.name}</option>
          ))}
        </select>
        <input
          value={virtueDayIndex}
          onChange={(e) => setVirtueDayIndex(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Day 1-28"
          className="w-24 bg-card border border-border rounded-card px-3 py-2 font-mono text-xs text-muted outline-none focus:border-gold"
        />
      </div>
      <input
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Source (book/speech, optional)"
        className="w-full bg-card border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
      />
      {error && <p className="font-mono text-[10px] text-burgundy-light">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving || !text.trim() || !author.trim() || !genre.trim()}
          className="flex items-center gap-1.5 bg-gold/20 text-gold border border-gold/40 font-mono text-xs px-3 py-1.5 rounded-pill min-h-[32px] disabled:opacity-50"
        >
          <Check size={11} /> {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="font-mono text-xs text-dim px-3 py-1.5 rounded-pill border border-border min-h-[32px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Quote row (list view) ────────────────────────────────────────────────────

function QuoteListRow({
  quote, genreOptions, virtueOptions, onSave, onToggleActive,
}: {
  quote: QuoteRow;
  genreOptions: string[];
  virtueOptions: VirtueOption[];
  onSave: (fields: Partial<QuoteRow>) => Promise<void>;
  onToggleActive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <div className="px-3 py-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className={`font-body text-sm ${quote.isActive ? "text-text" : "text-dim"} leading-snug`}>
            &ldquo;{truncate(quote.text, 90)}&rdquo;
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="font-mono text-[10px] text-dim">— {quote.author}</span>
            <span className="font-mono text-[9px] text-dim bg-bg border border-border px-1.5 py-0.5 rounded-pill">
              {quote.genre}
            </span>
            {quote.virtue && (
              <span className="font-mono text-[9px] text-gold bg-gold/10 border border-gold/30 px-1.5 py-0.5 rounded-pill">
                {quote.virtue}{quote.virtueDayIndex ? ` · day ${quote.virtueDayIndex}` : ""}
              </span>
            )}
            {!quote.isActive && (
              <span className="font-mono text-[9px] text-tobacco bg-tobacco/10 border border-tobacco/30 px-1.5 py-0.5 rounded-pill">
                Inactive
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center flex-shrink-0"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onToggleActive}
          className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center flex-shrink-0"
        >
          {quote.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>

      {editing && (
        <div className="mt-3">
          <QuoteForm
            initial={quote}
            genreOptions={genreOptions}
            virtueOptions={virtueOptions}
            saving={saving}
            onCancel={() => setEditing(false)}
            onSave={async (fields) => {
              setSaving(true);
              await onSave(fields);
              setSaving(false);
              setEditing(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── 4x7 grid for one virtue ──────────────────────────────────────────────────

function VirtueGrid({
  virtue, quotes, onPin,
}: {
  virtue: VirtueOption;
  quotes: QuoteRow[];
  onPin: (quoteId: string | null, virtueDayIndex: number) => Promise<void>;
}) {
  const pool = useMemo(
    () => quotes.filter((q) => q.virtue === virtue.slug && q.isActive),
    [quotes, virtue.slug]
  );
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div>
      <p className="font-mono text-[10px] text-dim mb-3">
        {pool.length} active quote{pool.length === 1 ? "" : "s"} in the pool for {virtue.name}.
        Unpinned slots draw one at random from this pool each day.
      </p>
      <div className="space-y-3">
        {Array.from({ length: OCCURRENCE_COUNT }).map((_, occ) => (
          <div key={occ}>
            <p className="font-mono text-[9px] uppercase tracking-widest text-dim mb-1.5">
              Occurrence {occ + 1}
            </p>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: DAYS_PER_OCCURRENCE }).map((_, day) => {
                const idx = occ * DAYS_PER_OCCURRENCE + day + 1;
                const pinned = pool.find((q) => q.virtueDayIndex === idx);
                const isOpen = openIndex === idx;
                return (
                  <div key={idx} className="relative">
                    <button
                      onClick={() => setOpenIndex(isOpen ? null : idx)}
                      title={pinned ? pinned.text : "Auto-filled from pool"}
                      className={`w-full aspect-square rounded-card border flex flex-col items-center justify-center font-mono text-[9px] ${
                        pinned
                          ? "border-gold/50 bg-gold/10 text-gold"
                          : pool.length > 0
                            ? "border-border bg-bg text-dim"
                            : "border-tobacco/40 bg-tobacco/10 text-tobacco"
                      }`}
                    >
                      {idx}
                    </button>
                    {isOpen && (
                      <div className="absolute z-10 top-full left-0 mt-1 w-56 bg-card border border-border rounded-card p-2 shadow-lg">
                        <p className="font-mono text-[9px] text-dim mb-1.5">
                          Pin a quote to day {idx}
                          {pinned && ` (currently: "${truncate(pinned.text, 40)}")`}
                        </p>
                        <select
                          className="w-full bg-bg border border-border rounded-card px-2 py-1.5 font-body text-xs text-text outline-none focus:border-gold"
                          value={pinned?._id ?? ""}
                          onChange={async (e) => {
                            const val = e.target.value || null;
                            await onPin(val, idx);
                            setOpenIndex(null);
                          }}
                        >
                          <option value="">— none (auto-fill) —</option>
                          {pool.map((q) => (
                            <option key={q._id} value={q._id}>
                              {truncate(q.text, 50)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main sheet ───────────────────────────────────────────────────────────────

export default function QuoteManageSheet({ onClose }: Props) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [virtueOptions, setVirtueOptions] = useState<VirtueOption[]>([]);
  const [filterVirtue, setFilterVirtue] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [adding, setAdding] = useState(false);

  const loadQuotes = useCallback(() => {
    setLoading(true);
    fetch("/api/quotes")
      .then((r) => r.json())
      .then((data: QuoteRow[]) => {
        setQuotes(data);
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  useEffect(() => {
    // Quotes rotate through the loading screen for "A Good Man" (philosophy
    // slug "agm") only — other philosophies (e.g. Franklin's 13) aren't part
    // of that experience, so their virtues shouldn't show up here.
    fetch("/api/philosophies")
      .then((r) => r.json())
      .then(async (philosophies: { _id: string; slug: string }[]) => {
        const agm = philosophies.find((p) => p.slug === "agm");
        if (!agm) {
          setVirtueOptions([]);
          return;
        }
        const virtues = await fetch(`/api/virtues?philosophyId=${agm._id}`).then((r) => r.json()) as
          { slug: string; name: string }[];
        setVirtueOptions(virtues.map((v) => ({ slug: v.slug, name: v.name })));
      })
      .catch(() => {});
  }, []);

  const genreOptions = useMemo(
    () => Array.from(new Set(quotes.map((q) => q.genre).filter(Boolean))).sort(),
    [quotes]
  );

  const visibleQuotes = useMemo(
    () => (filterVirtue ? quotes.filter((q) => q.virtue === filterVirtue) : quotes),
    [quotes, filterVirtue]
  );

  const selectedVirtueOption = virtueOptions.find((v) => v.slug === filterVirtue) ?? null;

  async function createQuote(fields: {
    text: string; author: string; genre: string;
    virtue: string | null; virtueDayIndex: number | null; source: string | null;
  }) {
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Could not create quote");
    }
    setAdding(false);
    loadQuotes();
  }

  async function patchQuote(id: string, fields: Record<string, unknown>) {
    const res = await fetch(`/api/quotes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Could not save quote");
    }
    loadQuotes();
  }

  async function pinQuote(quoteId: string | null, virtueDayIndex: number) {
    // Clear whatever was previously pinned to this slot (if any), then pin
    // the newly-selected quote — a slot can only ever have one pin.
    const current = quotes.find((q) => q.virtueDayIndex === virtueDayIndex && q.virtue === filterVirtue);
    if (current && current._id !== quoteId) {
      await patchQuote(current._id, { virtueDayIndex: null });
    }
    if (quoteId) {
      await patchQuote(quoteId, { virtueDayIndex });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-card border-t sm:border border-border rounded-t-[16px] sm:rounded-card z-10 max-h-[90vh] sm:max-h-[85vh] w-full sm:max-w-2xl sm:mx-4 flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h2 className="font-heading text-lg italic text-text">Quotes</h2>
          <button
            onClick={onClose}
            className="text-dim hover:text-muted min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          <div className="flex items-center gap-2 mb-4">
            <select
              value={filterVirtue}
              onChange={(e) => { setFilterVirtue(e.target.value); setView("list"); }}
              className="flex-1 bg-bg border border-border rounded-card px-3 py-2 font-mono text-xs text-text outline-none focus:border-gold"
            >
              <option value="">All virtues / no virtue</option>
              {virtueOptions.map((v) => (
                <option key={v.slug} value={v.slug}>{v.name}</option>
              ))}
            </select>
            {selectedVirtueOption && (
              <button
                onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
                className="flex items-center gap-1 font-mono text-[10px] text-dim hover:text-text px-2.5 py-2 rounded-pill border border-border flex-shrink-0"
              >
                {view === "grid" ? <ListIcon size={12} /> : <Grid3x3 size={12} />}
                {view === "grid" ? "List" : "Grid"}
              </button>
            )}
          </div>

          {view === "grid" && selectedVirtueOption ? (
            <VirtueGrid virtue={selectedVirtueOption} quotes={quotes} onPin={pinQuote} />
          ) : (
            <>
              {!adding && (
                <button
                  onClick={() => setAdding(true)}
                  className="w-full mb-4 flex items-center justify-center gap-1.5 font-mono text-xs text-gold border border-dashed border-gold/40 rounded-card py-3 hover:bg-gold/5"
                >
                  <Plus size={13} /> Add Quote
                </button>
              )}
              {adding && (
                <div className="mb-4">
                  <QuoteForm
                    genreOptions={genreOptions}
                    virtueOptions={virtueOptions}
                    saving={false}
                    onCancel={() => setAdding(false)}
                    onSave={createQuote}
                  />
                </div>
              )}

              {loading ? (
                <p className="font-mono text-xs text-dim text-center py-8">Loading…</p>
              ) : visibleQuotes.length === 0 ? (
                <p className="font-mono text-xs text-dim text-center py-8">No quotes yet.</p>
              ) : (
                <div className="rounded-card overflow-hidden divide-y divide-border border border-border">
                  {visibleQuotes.map((q) => (
                    <QuoteListRow
                      key={q._id}
                      quote={q}
                      genreOptions={genreOptions}
                      virtueOptions={virtueOptions}
                      onSave={(fields) => patchQuote(q._id, fields)}
                      onToggleActive={() => patchQuote(q._id, { isActive: !q.isActive })}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
