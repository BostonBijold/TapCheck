import { Schema, Document, model, models } from "mongoose";

export interface IRoutineGroup extends Document {
  companyId: string;
  name: string;
  timeOfDay: "morning" | "evening" | "custom" | "habit";
  startTime: string | null;    // 'HH:MM' — when routine window opens (end is derived from projected mins)
  order: number;
  isDefault: boolean;
}

const RoutineGroupSchema = new Schema<IRoutineGroup>(
  {
    // Company's shared shift-group configuration — not any individual's
    // personal data. String, not ObjectId, matching every other model's
    // company/user id fields — this travels as the string a session or API
    // key resolves to, and SKIP_AUTH's dev company id isn't a valid ObjectId
    // at all, so it must stay a plain string here too.
    companyId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    timeOfDay: { type: String, enum: ["morning", "evening", "custom", "habit"], required: true },
    startTime: { type: String, default: null },
    order: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default models.RoutineGroup || model<IRoutineGroup>("RoutineGroup", RoutineGroupSchema);
