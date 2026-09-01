"use client";

import { X } from "lucide-react";
import type { FormFieldDef } from "@/models/TaskDefinition";
import { convertTemp, type TempUnit } from "@/lib/temperature";

interface Props {
  fields: FormFieldDef[];
  onChange: (fields: FormFieldDef[]) => void;
}

function slugify(label: string, fallback: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || fallback;
}

// Shared field-list editor for a form task's formFields — used by both
// AddTaskSheet (creating a new task) and TaskListEditView (editing one).
export default function TaskFieldsEditor({ fields, onChange }: Props) {
  const updateField = (index: number, patch: Partial<FormFieldDef>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const addField = () => {
    onChange([...fields, { key: `field_${fields.length + 1}`, label: "", type: "number" }]);
  };

  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-widest text-dim block mb-2">
        Fields
      </label>

      <div className="space-y-3">
        {fields.map((field, i) => (
          <div key={i} className="bg-bg border border-border rounded-card p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={field.label}
                onChange={(e) => {
                  const label = e.target.value;
                  // Auto-derive the storage key from the label until the
                  // field has been given a real key some other way — once a
                  // non-default key exists, stop overwriting it.
                  const autoKey = /^field_\d+$/.test(field.key);
                  updateField(i, { label, key: autoKey ? slugify(label, field.key) : field.key });
                }}
                placeholder="e.g. Fridge temperature"
                className="flex-1 bg-card border border-border rounded-card px-3 py-2 font-body text-sm text-text placeholder:text-dim outline-none focus:border-olive"
              />
              <button
                type="button"
                onClick={() => removeField(i)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-burgundy/10 hover:bg-burgundy/20 text-burgundy-light transition-colors"
                aria-label="Remove field"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-card border border-border rounded-card p-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => updateField(i, { type: "number" })}
                  className={`px-3 py-1.5 rounded-card font-mono text-xs transition-colors ${
                    field.type === "number" ? "bg-olive text-text" : "text-dim"
                  }`}
                >
                  Number
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateField(i, {
                      type: "temperature",
                      // Free-text "number" units (if any) don't carry over —
                      // temperature's unit is meaningful (F/C), not display text.
                      unit: field.unit === "C" ? "C" : "F",
                    })
                  }
                  className={`px-3 py-1.5 rounded-card font-mono text-xs transition-colors ${
                    field.type === "temperature" ? "bg-olive text-text" : "text-dim"
                  }`}
                >
                  Temperature
                </button>
                <button
                  type="button"
                  onClick={() => updateField(i, { type: "boolean", unit: undefined, min: undefined, max: undefined })}
                  className={`px-3 py-1.5 rounded-card font-mono text-xs transition-colors ${
                    field.type === "boolean" ? "bg-olive text-text" : "text-dim"
                  }`}
                >
                  Yes / No
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateField(i, {
                      type: "checklist",
                      unit: undefined,
                      min: undefined,
                      max: undefined,
                      items: field.items && field.items.length > 0 ? field.items : [""],
                    })
                  }
                  className={`px-3 py-1.5 rounded-card font-mono text-xs transition-colors ${
                    field.type === "checklist" ? "bg-olive text-text" : "text-dim"
                  }`}
                >
                  Checklist
                </button>
              </div>

              {field.type === "number" && (
                <>
                  <input
                    type="text"
                    value={field.unit ?? ""}
                    onChange={(e) => updateField(i, { unit: e.target.value || undefined })}
                    placeholder="Unit (°F)"
                    className="w-20 bg-card border border-border rounded-card px-2 py-1.5 font-mono text-xs text-text placeholder:text-dim outline-none focus:border-olive"
                  />
                  <input
                    type="number"
                    value={field.min ?? ""}
                    onChange={(e) => updateField(i, { min: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="Min"
                    className="w-16 bg-card border border-border rounded-card px-2 py-1.5 font-mono text-xs text-text placeholder:text-dim outline-none focus:border-olive"
                  />
                  <input
                    type="number"
                    value={field.max ?? ""}
                    onChange={(e) => updateField(i, { max: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder="Max"
                    className="w-16 bg-card border border-border rounded-card px-2 py-1.5 font-mono text-xs text-text placeholder:text-dim outline-none focus:border-olive"
                  />
                </>
              )}

              {field.type === "temperature" && (
                <>
                  <div className="flex bg-card border border-border rounded-card p-0.5 flex-shrink-0">
                    {(["F", "C"] as TempUnit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          if (field.unit === u) return;
                          const from = (field.unit === "C" ? "C" : "F") as TempUnit;
                          // Converting the acceptable range so it keeps meaning
                          // the same real-world temperature after the toggle,
                          // not just the same number in a new scale.
                          updateField(i, {
                            unit: u,
                            min: field.min === undefined ? undefined : convertTemp(field.min, from, u),
                            max: field.max === undefined ? undefined : convertTemp(field.max, from, u),
                          });
                        }}
                        className={`px-3 py-1.5 rounded-card font-mono text-xs transition-colors ${
                          (field.unit === "C" ? "C" : "F") === u ? "bg-olive text-text" : "text-dim"
                        }`}
                      >
                        °{u}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={field.min ?? ""}
                    onChange={(e) => updateField(i, { min: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder={`Min °${field.unit === "C" ? "C" : "F"}`}
                    className="w-20 bg-card border border-border rounded-card px-2 py-1.5 font-mono text-xs text-text placeholder:text-dim outline-none focus:border-olive"
                  />
                  <input
                    type="number"
                    value={field.max ?? ""}
                    onChange={(e) => updateField(i, { max: e.target.value === "" ? undefined : Number(e.target.value) })}
                    placeholder={`Max °${field.unit === "C" ? "C" : "F"}`}
                    className="w-20 bg-card border border-border rounded-card px-2 py-1.5 font-mono text-xs text-text placeholder:text-dim outline-none focus:border-olive"
                  />
                </>
              )}
            </div>

            {/* Checklist sub-items — one item = a single check-it-off action
                (e.g. "Take out garbage"); more than one = a checklist within
                this checklist (e.g. "Store lights" / "Music" / "Open sign"),
                all of which must be checked. */}
            {field.type === "checklist" && (
              <div className="space-y-1.5 pt-1">
                {(field.items ?? [""]).map((item, itemIdx) => (
                  <div key={itemIdx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const items = [...(field.items ?? [""])];
                        items[itemIdx] = e.target.value;
                        updateField(i, { items });
                      }}
                      placeholder={
                        (field.items?.length ?? 1) > 1 ? `Item ${itemIdx + 1}, e.g. Store lights` : "e.g. Take out garbage"
                      }
                      className="flex-1 bg-card border border-border rounded-card px-2 py-1.5 font-mono text-xs text-text placeholder:text-dim outline-none focus:border-olive"
                    />
                    {(field.items?.length ?? 0) > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const items = (field.items ?? []).filter((_, idx2) => idx2 !== itemIdx);
                          updateField(i, { items: items.length > 0 ? items : [""] });
                        }}
                        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-dim hover:text-burgundy-light transition-colors"
                        aria-label="Remove item"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updateField(i, { items: [...(field.items ?? [""]), ""] })}
                  className="font-mono text-[10px] text-olive uppercase tracking-widest"
                >
                  + Add item
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addField}
        className="mt-3 w-full flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-3 rounded-card hover:border-olive/40 hover:text-olive transition-colors min-h-[44px]"
      >
        + Add field
      </button>

      {fields.length === 0 && (
        <p className="font-mono text-[10px] text-dim mt-2">
          Add at least one field — a number or temperature reading, a yes/no answer, or a checklist to check off.
        </p>
      )}
    </div>
  );
}
