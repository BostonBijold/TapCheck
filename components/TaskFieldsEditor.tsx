"use client";

import { X } from "lucide-react";
import type { FormFieldDef } from "@/models/Task";

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
                  onClick={() => updateField(i, { type: "boolean", unit: undefined, min: undefined, max: undefined })}
                  className={`px-3 py-1.5 rounded-card font-mono text-xs transition-colors ${
                    field.type === "boolean" ? "bg-olive text-text" : "text-dim"
                  }`}
                >
                  Yes / No
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
            </div>
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
          Add at least one field — a number reading or a yes/no answer.
        </p>
      )}
    </div>
  );
}
