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

export interface ITask extends Document {
  taskListId: mongoose.Types.ObjectId;
  companyId: string;
  templateId: mongoose.Types.ObjectId | null;
  name: string;
  icon: string;
  projectedMinutes: number;
  order: number;
  isActive: boolean;
  taskType: TaskType;
  // 0=Sun..6=Sat — which days this task is expected. Defaults to (and can be
  // pushed down from) its TaskList's own scheduledDays — see
  // models/TaskList.ts — but can be edited independently afterward.
  scheduledDays: number[];
  // How many of this week's *scheduled* days need to be done/rest to read
  // as 100% — never allowed to exceed scheduledDays.length (see the API
  // routes, which clamp on write; this field alone doesn't enforce it).
  successThreshold: number;
  formFields: FormFieldDef[];
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

const TaskSchema = new Schema<ITask>(
  {
    taskListId: { type: Schema.Types.ObjectId, ref: "TaskList", required: true },
    // Company's shared task configuration — see TaskList.companyId for why
    // this stays a plain String rather than an ObjectId ref.
    companyId: { type: String, required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: "TaskTemplate", default: null },
    name: { type: String, required: true },
    icon: { type: String, default: "✓" },
    projectedMinutes: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    taskType: { type: String, enum: ["standard", "stopwatch", "checkbox", "form"], default: "form" },
    scheduledDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    successThreshold: { type: Number, default: 7 },
    formFields: { type: [FormFieldDefSchema], default: [] },
  },
  { timestamps: true }
);

export default models.Task || model<ITask>("Task", TaskSchema);
