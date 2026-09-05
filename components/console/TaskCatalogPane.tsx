"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Check, Trash2, Plus, Search, Nfc } from "lucide-react";
import AppIcon, { IconPicker } from "@/components/AppIcon";
import TaskFieldsEditor from "@/components/TaskFieldsEditor";
import type { FormFieldDef } from "@/models/TaskDefinition";

export interface CatalogDefinition {
  _id: string;
  name: string;
  icon: string;
  formFields: FormFieldDef[];
  projectedMinutes: number;
  nfcTagUid: string | null;
  placements: Array<{ taskId: string; taskListId: string; taskListName: string }>;
}

interface Props {
  definitions: CatalogDefinition[] | null;
  onSave: (id: string, name: string, icon: string, projectedMinutes: number, formFields: FormFieldDef[]) => Promise<void>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onCreate: (name: string, icon: string, projectedMinutes: number, formFields: FormFieldDef[]) => Promise<void>;
}

function usageLabel(definition: CatalogDefinition) {
  if (definition.placements.length === 0) return "Not placed in any list";
  const names = Array.from(new Set(definition.placements.map((p) => p.taskListName)));
  return `Used in ${names.join(", ")}`;
}

function CatalogRow({
  definition,
  isEditing,
  onToggleEdit,
  onSave,
  onDelete,
  deleting,
  blockedMessage,
}: {
  definition: CatalogDefinition;
  isEditing: boolean;
  onToggleEdit: () => void;
  onSave: (name: string, icon: string, projectedMinutes: number, formFields: FormFieldDef[]) => Promise<void>;
  onDelete: () => void;
  deleting: boolean;
  blockedMessage: string | null;
}) {
  const [editName, setEditName] = useState(definition.name);
  const [editIcon, setEditIcon] = useState(definition.icon);
  const [editMins, setEditMins] = useState(String(definition.projectedMinutes));
  const [editFields, setEditFields] = useState<FormFieldDef[]>(definition.formFields);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const mins = parseInt(editMins) || definition.projectedMinutes;
    await onSave(editName.trim() || definition.name, editIcon || definition.icon, mins, editFields);
    setSaving(false);
  };

  const unplaced = definition.placements.length === 0;

  return (
    <div className="bg-card">
      <div className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
        <div className="w-6 flex items-center justify-center flex-shrink-0">
          <AppIcon name={definition.icon} size={16} className="text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm text-text truncate">{definition.name}</p>
          <p className="font-mono text-[10px] text-dim truncate mt-0.5">{usageLabel(definition)}</p>
        </div>
        {definition.nfcTagUid && (
          <span className="flex-shrink-0 flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-olive bg-olive/10 px-2 py-0.5 rounded-pill">
            <Nfc size={10} /> Linked
          </span>
        )}
        <span className="font-mono text-dim text-xs flex-shrink-0">{definition.projectedMinutes}m</span>
        <button
          onClick={onToggleEdit}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-dim hover:text-muted transition-colors"
          aria-label={isEditing ? "Collapse" : "Edit"}
        >
          {isEditing ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        <button
          onClick={onDelete}
          disabled={deleting || !unplaced}
          title={unplaced ? "Delete from catalog" : "Remove from every list first"}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-burgundy/10 hover:bg-burgundy/20 text-burgundy-light transition-colors disabled:opacity-30 disabled:hover:bg-burgundy/10"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {blockedMessage && (
        <p className="px-4 pb-2 font-mono text-[10px] text-burgundy-light">{blockedMessage}</p>
      )}

      {isEditing && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none focus:border-olive"
              />
            </div>
            <div className="flex-shrink-0 w-20">
              <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">Est. min</label>
              <input
                type="number"
                value={editMins}
                onChange={(e) => setEditMins(e.target.value)}
                min={1}
                className="w-full bg-bg border border-border rounded-card px-3 py-2 font-mono text-sm text-text outline-none focus:border-olive"
              />
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">Icon</label>
            <IconPicker selected={editIcon} onSelect={setEditIcon} />
          </div>

          <TaskFieldsEditor fields={editFields} onChange={setEditFields} />

          <button
            onClick={handleSave}
            disabled={saving || editFields.length === 0}
            className="flex items-center gap-1.5 bg-olive/15 border border-olive/30 text-olive font-mono text-xs px-4 py-2 rounded-pill disabled:opacity-50"
          >
            <Check size={12} />
            {saving ? "Saving…" : "Save changes"}
          </button>

          <div className="pt-2 border-t border-border">
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5">Scan-to-Complete Tag</p>
            <p className="font-mono text-[11px] text-dim">
              {definition.nfcTagUid ? `Linked · ${definition.nfcTagUid}` : "Not linked — link NFC on mobile device."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function NewCatalogTaskForm({ onCreate, onClose }: { onCreate: Props["onCreate"]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("list-checks");
  const [mins, setMins] = useState("5");
  const [fields, setFields] = useState<FormFieldDef[]>([]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || fields.length === 0) return;
    setSaving(true);
    await onCreate(name.trim(), icon, parseInt(mins) || 5, fields);
    setSaving(false);
  };

  return (
    <div className="rounded-card border border-border bg-card p-4 space-y-3 mb-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-dim">New catalog task</p>
      <p className="font-mono text-[11px] text-dim">
        Saved to the company catalog only — place it into a task list whenever you&rsquo;re ready.
      </p>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Walk-in Fridge Temp"
            autoFocus
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-body text-sm text-text placeholder:text-dim outline-none focus:border-olive"
          />
        </div>
        <div className="flex-shrink-0 w-20">
          <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-1.5">Est. min</label>
          <input
            type="number"
            value={mins}
            onChange={(e) => setMins(e.target.value)}
            min={1}
            className="w-full bg-bg border border-border rounded-card px-3 py-2 font-mono text-sm text-text outline-none focus:border-olive"
          />
        </div>
      </div>

      <div>
        <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">Icon</label>
        <IconPicker selected={icon} onSelect={setIcon} />
      </div>

      <TaskFieldsEditor fields={fields} onChange={setFields} />

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleCreate}
          disabled={saving || !name.trim() || fields.length === 0}
          className="flex items-center gap-1.5 bg-olive/15 border border-olive/30 text-olive font-mono text-xs px-4 py-2 rounded-pill disabled:opacity-50"
        >
          <Check size={12} />
          {saving ? "Creating…" : "Create"}
        </button>
        <button onClick={onClose} className="font-mono text-[10px] uppercase tracking-widest text-dim px-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Full-width pane for /console/tasks's "Task Catalog" view — every saved
// TaskDefinition the company has, independent of which (if any) task lists
// currently place it. Fills the gap TaskListDetailPane can't: editing or
// deleting a definition that isn't (or isn't yet) placed in any list at
// all, and creating a brand-new catalog entry with no placement in the same
// request — see docs/features/console-task-management.md's "Task Catalog
// pane". Mirrors mobile's ManageTasksView.tsx "Company Task Catalog"
// section in spirit (same usage-label convention, same delete-blocked-
// while-placed rule) but adds the inline name/icon/fields/minutes editor
// mobile's own catalog rows still lack for an unplaced definition.
export default function TaskCatalogPane({ definitions, onSave, onDelete, onCreate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; message: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = (definitions ?? []).filter((d) => q === "" || d.name.toLowerCase().includes(q));

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setBlocked(null);
    const result = await onDelete(id);
    if (!result.ok) setBlocked({ id, message: result.error ?? "Couldn't delete this task." });
    setDeletingId(null);
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-heading text-lg text-text">Task Catalog</h2>
        <p className="font-mono text-[10px] text-dim">
          {definitions === null ? "" : `${definitions.length} task${definitions.length === 1 ? "" : "s"}`}
        </p>
      </div>
      <p className="font-body text-sm text-muted mb-4">
        Every saved task, whether or not it&rsquo;s currently placed in a task list. Edit or delete one here
        without touching any list.
      </p>

      <div className="mb-3 flex items-center gap-2 bg-card border border-border rounded-card px-3 py-2">
        <Search size={14} className="text-dim flex-shrink-0" />
        <input
          type="text"
          placeholder="Search the catalog..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent font-body text-sm text-text placeholder:text-dim outline-none"
        />
      </div>

      {creating ? (
        <NewCatalogTaskForm
          onCreate={async (...args) => {
            await onCreate(...args);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mb-4 w-full flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-3.5 rounded-card hover:border-olive/40 hover:text-olive transition-colors"
        >
          <Plus size={14} /> New catalog task
        </button>
      )}

      {definitions === null ? (
        <p className="text-dim font-mono text-xs py-8">Loading…</p>
      ) : definitions.length === 0 ? (
        <p className="text-dim font-mono text-xs text-center py-8">No saved tasks yet.</p>
      ) : filtered.length === 0 ? (
        <p className="text-dim font-mono text-xs text-center py-8">No catalog tasks match &ldquo;{search}&rdquo;</p>
      ) : (
        <div className="rounded-card overflow-hidden divide-y divide-border border border-border">
          {filtered.map((d) => (
            <CatalogRow
              key={d._id}
              definition={d}
              isEditing={editingId === d._id}
              onToggleEdit={() => setEditingId((prev) => (prev === d._id ? null : d._id))}
              onSave={async (name, icon, mins, fields) => {
                setEditingId(null);
                await onSave(d._id, name, icon, mins, fields);
              }}
              onDelete={() => handleDelete(d._id)}
              deleting={deletingId === d._id}
              blockedMessage={blocked?.id === d._id ? blocked.message : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
