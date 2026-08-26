"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, GripVertical, Pencil, Copy, Check, Plus, ArrowLeft, EyeOff, Eye } from "lucide-react";

export interface PhilosophyRow {
  _id: string;
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  order: number;
  virtueCount: number;
}

interface VirtueRow {
  _id: string;
  philosophyId: string;
  name: string;
  slug: string;
  tagline: string;
  displayName: string;
  order: number;
  essay: string;
  etymology: string;
  isActive: boolean;
}

interface Props {
  isAdmin: boolean;
  currentPhilosophyId: string | null;
  onSelect: (philosophyId: string) => Promise<void> | void;
  onClose?: () => void; // omit for the forced-onboarding (no way to dismiss) case
  onReset?: () => Promise<void> | void; // omit when there's nothing to reset yet (forced onboarding)
}

const SWITCH_WARNING =
  "Switching virtue systems will reset your progress. You'll start with just this week's virtue and build back up one virtue per week as you continue using the app. Continue?";
const RESET_WARNING =
  "Reset your virtue check-in progress? You'll start back at just this week's virtue and build up one virtue per week, same as switching philosophies.";

function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── Card ─────────────────────────────────────────────────────────────────────

function PhilosophyCard({
  philosophy, isAdmin, isSelected, onSelect, onDuplicate, onToggleActive, onEdit,
}: {
  philosophy: PhilosophyRow;
  isAdmin: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: (name: string, slug: string) => Promise<void>;
  onToggleActive: () => void;
  onEdit: () => void;
}) {
  const [duplicating, setDuplicating] = useState(false);
  const [dupName, setDupName] = useState(`${philosophy.name} Copy`);
  const [dupSlug, setDupSlug] = useState(`${philosophy.slug}-copy`);
  const [saving, setSaving] = useState(false);

  return (
    <div
      className={`bg-card rounded-card border px-4 py-3.5 transition-colors ${
        isSelected ? "border-gold/50" : "border-border"
      }`}
    >
      <button onClick={onSelect} className="w-full text-left flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-heading text-base italic text-text">{philosophy.name}</span>
            {isSelected && (
              <span className="font-mono text-[9px] text-gold bg-gold/10 border border-gold/30 px-2 py-0.5 rounded-pill">
                Selected
              </span>
            )}
            {philosophy.isSystem && (
              <span className="font-mono text-[9px] text-dim bg-bg border border-border px-2 py-0.5 rounded-pill">
                System
              </span>
            )}
            {!philosophy.isActive && (
              <span className="font-mono text-[9px] text-tobacco bg-tobacco/10 border border-tobacco/30 px-2 py-0.5 rounded-pill">
                Inactive
              </span>
            )}
          </div>
          {philosophy.description && (
            <p className="font-body text-sm text-muted leading-snug mb-1.5">{philosophy.description}</p>
          )}
          <p className="font-mono text-[10px] text-dim">{philosophy.virtueCount} virtues</p>
        </div>
      </button>

      {isAdmin && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border">
          <button
            onClick={onEdit}
            className="flex items-center gap-1 font-mono text-[10px] text-dim hover:text-text px-2 py-1.5 rounded-pill border border-border min-h-[32px]"
          >
            <Pencil size={11} /> Virtues
          </button>
          <button
            onClick={() => setDuplicating((v) => !v)}
            className="flex items-center gap-1 font-mono text-[10px] text-dim hover:text-text px-2 py-1.5 rounded-pill border border-border min-h-[32px]"
          >
            <Copy size={11} /> Duplicate
          </button>
          <button
            onClick={onToggleActive}
            className="flex items-center gap-1 font-mono text-[10px] text-dim hover:text-text px-2 py-1.5 rounded-pill border border-border min-h-[32px] ml-auto"
          >
            {philosophy.isActive ? <EyeOff size={11} /> : <Eye size={11} />}
            {philosophy.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      )}

      {duplicating && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <input
            value={dupName}
            onChange={(e) => {
              setDupName(e.target.value);
              setDupSlug(slugify(e.target.value));
            }}
            placeholder="New philosophy name"
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
          />
          <input
            value={dupSlug}
            onChange={(e) => setDupSlug(slugify(e.target.value))}
            placeholder="slug"
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-mono text-xs text-muted outline-none focus:border-gold"
          />
          <div className="flex gap-2">
            <button
              disabled={saving || !dupName.trim() || !dupSlug.trim()}
              onClick={async () => {
                setSaving(true);
                await onDuplicate(dupName.trim(), dupSlug.trim());
                setSaving(false);
                setDuplicating(false);
              }}
              className="flex items-center gap-1.5 bg-gold/20 text-gold border border-gold/40 font-mono text-xs px-3 py-1.5 rounded-pill min-h-[32px] disabled:opacity-50"
            >
              <Check size={11} /> {saving ? "Copying…" : "Confirm"}
            </button>
            <button
              onClick={() => setDuplicating(false)}
              className="font-mono text-xs text-dim px-3 py-1.5 rounded-pill border border-border min-h-[32px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sortable virtue row (admin virtue editor) ───────────────────────────────

function SortableVirtueRow({
  virtue, onSave, onToggleActive,
}: {
  virtue: VirtueRow;
  onSave: (fields: Partial<Pick<VirtueRow, "name" | "slug" | "displayName" | "tagline" | "essay" | "etymology">>) => Promise<void>;
  onToggleActive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: virtue._id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : virtue.isActive ? 1 : 0.5,
    zIndex: isDragging ? 20 : undefined,
  };

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(virtue.name);
  const [slug, setSlug] = useState(virtue.slug);
  const [displayName, setDisplayName] = useState(virtue.displayName);
  const [tagline, setTagline] = useState(virtue.tagline);
  const [essay, setEssay] = useState(virtue.essay);
  const [etymology, setEtymology] = useState(virtue.etymology);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave({ name, slug, displayName, tagline, essay, etymology });
    setSaving(false);
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} style={style} className="px-3 py-3">
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm text-text truncate">
            {virtue.order}. {virtue.displayName}
          </p>
          <p className="font-mono text-[10px] text-dim truncate">{virtue.tagline}</p>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onToggleActive}
          className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center"
        >
          {virtue.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>

      {editing && (
        <div className="mt-3 space-y-2 pl-9">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Word (e.g. Disciplined)"
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            placeholder="slug"
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-mono text-xs text-muted outline-none focus:border-gold"
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name (e.g. A Good Man Is Disciplined)"
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
          />
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Sentence description"
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
          />
          <textarea
            value={etymology}
            onChange={(e) => setEtymology(e.target.value)}
            placeholder="Etymology"
            rows={2}
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold resize-none"
          />
          <textarea
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
            placeholder="Paragraph reflection / essay"
            rows={4}
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !name.trim() || !slug.trim() || !displayName.trim() || !tagline.trim()}
              className="flex items-center gap-1.5 bg-gold/20 text-gold border border-gold/40 font-mono text-xs px-3 py-1.5 rounded-pill min-h-[32px] disabled:opacity-50"
            >
              <Check size={11} /> {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="font-mono text-xs text-dim px-3 py-1.5 rounded-pill border border-border min-h-[32px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Virtue editor (drills into one philosophy) ──────────────────────────────

function VirtueEditor({ philosophy, onBack }: { philosophy: PhilosophyRow; onBack: () => void }) {
  const [virtues, setVirtues] = useState<VirtueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newTagline, setNewTagline] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/virtues?philosophyId=${philosophy._id}`)
      .then((r) => r.json())
      .then((data: VirtueRow[]) => {
        setVirtues(data.sort((a, b) => a.order - b.order));
        setLoading(false);
      });
  }, [philosophy._id]);

  useEffect(() => { load(); }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = virtues.findIndex((v) => v._id === active.id);
    const newIndex = virtues.findIndex((v) => v._id === over.id);
    const reordered = arrayMove(virtues, oldIndex, newIndex);
    setVirtues(reordered);
    await fetch("/api/virtues/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        philosophyId: philosophy._id,
        items: reordered.map((v, idx) => ({ _id: v._id, order: idx + 1 })),
      }),
    });
  };

  async function saveVirtue(id: string, fields: Partial<VirtueRow>) {
    setVirtues((prev) => prev.map((v) => (v._id === id ? { ...v, ...fields } : v)));
    await fetch(`/api/virtues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  async function toggleActive(v: VirtueRow) {
    setVirtues((prev) => prev.map((x) => (x._id === v._id ? { ...x, isActive: !x.isActive } : x)));
    await fetch(`/api/virtues/${v._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !v.isActive }),
    });
  }

  async function addVirtue() {
    setSavingNew(true);
    const res = await fetch("/api/virtues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        philosophyId: philosophy._id,
        name: newName.trim(),
        slug: newSlug.trim(),
        displayName: newDisplayName.trim() || newName.trim(),
        tagline: newTagline.trim() || " ",
      }),
    });
    if (res.ok) {
      setNewName(""); setNewSlug(""); setNewDisplayName(""); setNewTagline("");
      setAdding(false);
      load();
    }
    setSavingNew(false);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="text-dim hover:text-muted min-w-[32px] min-h-[32px] flex items-center justify-center -ml-2"
        >
          <ArrowLeft size={17} />
        </button>
        <h3 className="font-heading text-lg italic text-text">{philosophy.name}</h3>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-dim text-center py-8">Loading…</p>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={virtues.map((v) => v._id)} strategy={verticalListSortingStrategy}>
              <div className="rounded-card overflow-hidden divide-y divide-border border border-border">
                {virtues.map((v) => (
                  <SortableVirtueRow
                    key={v._id}
                    virtue={v}
                    onSave={(fields) => saveVirtue(v._id, fields)}
                    onToggleActive={() => toggleActive(v)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {virtues.length === 0 && !adding && (
            <p className="font-mono text-xs text-dim text-center py-6">No virtues yet.</p>
          )}
        </>
      )}

      {adding ? (
        <div className="mt-4 bg-bg border border-border rounded-card p-4 space-y-2">
          <input
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setNewSlug(slugify(e.target.value)); }}
            placeholder="Word (e.g. Disciplined)"
            className="w-full bg-card border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
          />
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(slugify(e.target.value))}
            placeholder="slug"
            className="w-full bg-card border border-border rounded-card px-3 py-2 font-mono text-xs text-muted outline-none focus:border-gold"
          />
          <input
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="Display name (e.g. A Good Man Is Disciplined)"
            className="w-full bg-card border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
          />
          <input
            value={newTagline}
            onChange={(e) => setNewTagline(e.target.value)}
            placeholder="Sentence description"
            className="w-full bg-card border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
          />
          <div className="flex gap-2">
            <button
              onClick={addVirtue}
              disabled={savingNew || !newName.trim() || !newSlug.trim()}
              className="flex items-center gap-1.5 bg-gold/20 text-gold border border-gold/40 font-mono text-xs px-3 py-1.5 rounded-pill min-h-[32px] disabled:opacity-50"
            >
              <Check size={11} /> {savingNew ? "Adding…" : "Add virtue"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="font-mono text-xs text-dim px-3 py-1.5 rounded-pill border border-border min-h-[32px]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full mt-4 flex items-center justify-center gap-1.5 font-mono text-xs text-gold border border-dashed border-gold/40 rounded-card py-3 hover:bg-gold/5"
        >
          <Plus size={13} /> Add virtue
        </button>
      )}
    </div>
  );
}

// ── Main list view + create form ────────────────────────────────────────────

function CreateForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/philosophies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim(), description: description.trim() }),
    });
    if (res.ok) {
      onCreated();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not create philosophy");
    }
    setSaving(false);
  }

  return (
    <div className="bg-card border border-gold/30 rounded-card p-4 mb-4 space-y-2">
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }}
        placeholder="Philosophy name"
        className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold"
      />
      <input
        value={slug}
        onChange={(e) => setSlug(slugify(e.target.value))}
        placeholder="slug"
        className="w-full bg-bg border border-border rounded-card px-3 py-2 font-mono text-xs text-muted outline-none focus:border-gold"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short marketplace description"
        rows={2}
        className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-gold resize-none"
      />
      {error && <p className="font-mono text-[10px] text-burgundy-light">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={saving || !name.trim() || !slug.trim()}
          className="flex items-center gap-1.5 bg-gold/20 text-gold border border-gold/40 font-mono text-xs px-3 py-1.5 rounded-pill min-h-[32px] disabled:opacity-50"
        >
          <Check size={11} /> {saving ? "Creating…" : "Create"}
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

function MarketplaceBody({ isAdmin, currentPhilosophyId, onSelect, onReset }: Props) {
  const [philosophies, setPhilosophies] = useState<PhilosophyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingPhilosophy, setEditingPhilosophy] = useState<PhilosophyRow | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/philosophies")
      .then((r) => r.json())
      .then((data: PhilosophyRow[]) => {
        setPhilosophies(data);
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (editingPhilosophy) {
    return <VirtueEditor philosophy={editingPhilosophy} onBack={() => { setEditingPhilosophy(null); load(); }} />;
  }

  return (
    <div>
      {isAdmin && !creating && (
        <button
          onClick={() => setCreating(true)}
          className="w-full mb-4 flex items-center justify-center gap-1.5 font-mono text-xs text-gold border border-dashed border-gold/40 rounded-card py-3 hover:bg-gold/5"
        >
          <Plus size={13} /> New Philosophy
        </button>
      )}
      {creating && (
        <CreateForm onCreated={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />
      )}

      {onReset && currentPhilosophyId && (
        <button
          onClick={async () => {
            if (!confirm(RESET_WARNING)) return;
            setResetting(true);
            await onReset();
            setResetting(false);
          }}
          disabled={resetting}
          className="w-full mb-4 font-mono text-[10px] text-dim hover:text-burgundy-light border border-border rounded-card py-2.5 disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset Virtue Progress"}
        </button>
      )}

      {loading ? (
        <p className="font-mono text-xs text-dim text-center py-8">Loading…</p>
      ) : (
        <div className="space-y-3">
          {philosophies.map((p) => (
            <PhilosophyCard
              key={p._id}
              philosophy={p}
              isAdmin={isAdmin}
              isSelected={p._id === currentPhilosophyId}
              onSelect={async () => {
                if (p._id === currentPhilosophyId) return;
                if (currentPhilosophyId && !confirm(SWITCH_WARNING)) return;
                setSelecting(p._id);
                await onSelect(p._id);
                setSelecting(null);
              }}
              onEdit={() => setEditingPhilosophy(p)}
              onDuplicate={async (name, slug) => {
                await fetch(`/api/philosophies/${p._id}/duplicate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, slug }),
                });
                load();
              }}
              onToggleActive={async () => {
                setPhilosophies((prev) =>
                  prev.map((x) => (x._id === p._id ? { ...x, isActive: !x.isActive } : x))
                );
                await fetch(`/api/philosophies/${p._id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isActive: !p.isActive }),
                });
              }}
            />
          ))}
          {selecting && (
            <p className="font-mono text-[10px] text-dim text-center">Selecting…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Exported entry points ───────────────────────────────────────────────────

// Rendered inline, full-page, no backdrop/close — used when the user has no
// philosophy selected yet (the Virtues page can't show its normal UI).
export function PhilosophyMarketplaceInline(props: Props) {
  return (
    <div className="pt-2">
      <div className="mb-5">
        <p className="font-mono text-[9px] uppercase tracking-widest text-gold mb-1">
          Choose Your Philosophy
        </p>
        <h2 className="font-heading text-xl italic text-text">Which virtues will you live by?</h2>
      </div>
      <MarketplaceBody {...props} />
    </div>
  );
}

// Rendered as an overlay sheet — used for "Manage" (switching later, and all
// admin CRUD). Wider than the app's usual 420px shell so it's comfortable to
// author virtue text on desktop, still usable stacked on mobile.
export default function PhilosophyManageSheet({ isAdmin, currentPhilosophyId, onSelect, onClose, onReset }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-card border-t sm:border border-border rounded-t-[16px] sm:rounded-card z-10 max-h-[90vh] sm:max-h-[85vh] w-full sm:max-w-2xl sm:mx-4 flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h2 className="font-heading text-lg italic text-text">Philosophies</h2>
          <button
            onClick={onClose}
            className="text-dim hover:text-muted min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">
          <MarketplaceBody
            isAdmin={isAdmin}
            currentPhilosophyId={currentPhilosophyId}
            onSelect={onSelect}
            onReset={onReset}
          />
        </div>
      </div>
    </div>
  );
}
