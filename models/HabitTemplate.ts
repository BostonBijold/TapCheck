import { Schema, Document, model, models } from "mongoose";
import { FormFieldDefSchema, type FormFieldDef } from "@/models/RoutineItem";

export type HabitCategory =
  | "food_safety"
  | "cleaning"
  | "cash_handling"
  | "equipment"
  | "opening_closing"
  | "custom";

export interface IHabitTemplate extends Document {
  name: string;
  icon: string;
  defaultProjectedMinutes: number;
  category: HabitCategory;
  timeOfDay: "morning" | "evening" | "any";
  description?: string;
  isSystem: boolean;       // true = admin-seeded, visible to all
  companyId: string | null; // owning company for a company-created template, null for system
  isActive: boolean;
  formFields: FormFieldDef[]; // carried onto the RoutineItem created from this template
}

const HabitTemplateSchema = new Schema<IHabitTemplate>(
  {
    name: { type: String, required: true },
    icon: { type: String, required: true },
    defaultProjectedMinutes: { type: Number, default: 15 },
    category: {
      type: String,
      enum: ["food_safety", "cleaning", "cash_handling", "equipment", "opening_closing", "custom"],
      required: true,
    },
    timeOfDay: { type: String, enum: ["morning", "evening", "any"], default: "any" },
    description: { type: String, default: null },
    isSystem: { type: Boolean, default: false },
    companyId: { type: String, default: null, index: true },
    isActive: { type: Boolean, default: true },
    formFields: { type: [FormFieldDefSchema], default: [] },
  },
  { timestamps: true }
);

HabitTemplateSchema.index({ isSystem: 1, timeOfDay: 1 });

export default models.HabitTemplate || model<IHabitTemplate>("HabitTemplate", HabitTemplateSchema);
