import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IVirtue extends Document {
  philosophyId: mongoose.Types.ObjectId; // which Philosophy this virtue belongs to
  name: string;        // 'Present'
  slug: string;        // 'present' — globally unique, not scoped per-philosophy
  tagline: string;     // 'A good man is fully where he is'
  displayName: string; // 'A Good Man Is Present'
  order: number;       // 1..N *within* this philosophy, not a global 1–13
  essay: string;       // admin writes this over time
  etymology: string;   // word origin, optional
  isActive: boolean;
}

const VirtueSchema = new Schema<IVirtue>(
  {
    philosophyId: { type: Schema.Types.ObjectId, ref: "Philosophy", required: true },
    name:        { type: String, required: true },
    slug:        { type: String, required: true, unique: true },
    tagline:     { type: String, required: true },
    displayName: { type: String, required: true },
    order:       { type: Number, required: true },
    essay:       { type: String, default: "" },
    etymology:   { type: String, default: "" },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

VirtueSchema.index({ philosophyId: 1, order: 1 });

export default models.Virtue || model<IVirtue>("Virtue", VirtueSchema);
