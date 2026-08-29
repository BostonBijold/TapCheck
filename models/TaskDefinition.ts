import mongoose, { Schema, Document, model, models } from "mongoose";

// "standard"/"stopwatch"/"checkbox" are retired timer-based item types from
// the pre-pivot personal-habit tracker, kept only for schema compatibility
// with any pre-pivot data — "form" is the only creatable type. "checkbox"
// here names a UI control style (tap to complete, no reading captured), not
// a reference to the old "check" product vocabulary.
export type TaskType = "standard" | "stopwatch" | "checkbox" | "form";

// Schema-driven field definitions for a "form" task — the "in progress"
// screen renders one control per entry instead of a timer. Kept generic
// (not hardcoded to e.g. temperature) so the next form task (bathroom
// clean, closing checklist) is just a different formFields array, no code
// change. Only populated when taskType === "form"; empty otherwise.
export interface FormFieldDef {
  key: string;              // stable key, e.g. "temperature"
  label: string;            // display label, e.g. "Walk-in temperature"
  type: "number" | "text" | "boolean";
  unit?: string;             // e.g. "°F" — display only
  min?: number;               // optional pass/fail bound, number fields only — not yet enforced
  max?: number;
}

export const FormFieldDefSchema = new Schema<FormFieldDef>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ["number", "text", "boolean"], required: true },
    unit: { type: String, default: undefined },
    min: { type: Number, default: undefined },
    max: { type: Number, default: undefined },
  },
  { _id: false }
);

// The company's reusable, physical-location-bound "saved task" — the check
// itself (fridge temp, restroom clean, opening cash count), independent of
// any one TaskList placement. A `Task` (models/Task.ts) is a lightweight
// join connecting one of these into a specific list; the same
// TaskDefinition can be placed in more than one list (e.g. fridge temp
// checked in both the opening and closing lists), and its NFC binding,
// name, icon, and form fields are shared across every placement — the same
// physical check, done more than once. See the "Company Task Catalog"
// design in docs/features/task-lists.md.
export interface ITaskDefinition extends Document {
  companyId: string;
  // Which TaskTemplate this was cloned from, if any — informational only,
  // used to exclude an already-in-use template from the catalog browser
  // (see app/api/task-templates/route.ts). Null for a fully custom task.
  templateId: mongoose.Types.ObjectId | null;
  name: string;
  icon: string;
  taskType: TaskType;
  formFields: FormFieldDef[];
  // Default time budget — a placement (Task.projectedMinutes) may override
  // this per list; null there means "inherit this default."
  projectedMinutes: number;
  // Raw hardware UID (lowercase hex) of a physical NFC tag bound to this
  // saved task, scanned in-app — see docs/features/nfc.md's "In-app
  // scan-to-complete binding". Binding lives here, one layer above any
  // single list placement, so every list this task is placed in shares the
  // same tag automatically. null/unset = completes normally, no scan
  // required. Distinct from models/NfcTag.ts's tagCode/URL-based
  // tap-to-trigger system.
  nfcTagUid: string | null;
  // Archived once a manager deletes it from the catalog — blocked while any
  // active Task placement still references it (see
  // app/api/task-definitions/[id]/route.ts), so an isActive: false
  // definition should never have live placements pointing at it.
  isActive: boolean;
}

const TaskDefinitionSchema = new Schema<ITaskDefinition>(
  {
    // Company's shared task configuration — see TaskList.companyId for why
    // this stays a plain String rather than an ObjectId ref.
    companyId: { type: String, required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: "TaskTemplate", default: null },
    name: { type: String, required: true },
    icon: { type: String, default: "✓" },
    taskType: { type: String, enum: ["standard", "stopwatch", "checkbox", "form"], default: "form" },
    formFields: { type: [FormFieldDefSchema], default: [] },
    projectedMinutes: { type: Number, default: 0 },
    nfcTagUid: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default models.TaskDefinition || model<ITaskDefinition>("TaskDefinition", TaskDefinitionSchema);
