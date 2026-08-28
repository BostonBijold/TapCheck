import mongoose, { Schema, Document, model, models } from "mongoose";

// "routine_review" was the Sunday goal-vs-actual-minutes feature, retired
// when the app pivoted from personal habits to restaurant work checks.
// standard/stopwatch/checkbox are kept for schema compatibility with any
// pre-pivot data, but nothing in the UI creates them anymore — form_check
// is the only creatable type.
export type ItemType = "standard" | "stopwatch" | "checkbox" | "form_check";

// Schema-driven field definitions for a form_check item — the "in progress"
// screen renders one control per entry instead of a timer. Kept generic
// (not hardcoded to e.g. temperature) so the next form check (bathroom
// clean, closing checklist) is just a different formFields array, no code
// change. Only populated when itemType === "form_check"; empty otherwise.
export interface FormFieldDef {
  key: string;              // stable key, e.g. "temperature"
  label: string;            // display label, e.g. "Walk-in temperature"
  type: "number" | "text" | "boolean";
  unit?: string;             // e.g. "°F" — display only
  min?: number;               // optional pass/fail bound, number fields only — not yet enforced
  max?: number;
}

export interface IRoutineItem extends Document {
  groupId: mongoose.Types.ObjectId;
  companyId: string;
  templateId: mongoose.Types.ObjectId | null;
  name: string;
  icon: string;
  projectedMinutes: number;
  order: number;
  isActive: boolean;
  itemType: ItemType;
  // 0=Sun..6=Sat — which days this item is expected. Defaults to every day
  // so existing items are unaffected until a user opts in.
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

const RoutineItemSchema = new Schema<IRoutineItem>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "RoutineGroup", required: true },
    // Company's shared shift-item configuration — see RoutineGroup.companyId
    // for why this stays a plain String rather than an ObjectId ref.
    companyId: { type: String, required: true, index: true },
    templateId: { type: Schema.Types.ObjectId, ref: "HabitTemplate", default: null },
    name: { type: String, required: true },
    icon: { type: String, default: "✓" },
    projectedMinutes: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    itemType: { type: String, enum: ["standard", "stopwatch", "checkbox", "form_check"], default: "form_check" },
    scheduledDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    successThreshold: { type: Number, default: 7 },
    formFields: { type: [FormFieldDefSchema], default: [] },
  },
  { timestamps: true }
);

export default models.RoutineItem || model<IRoutineItem>("RoutineItem", RoutineItemSchema);
