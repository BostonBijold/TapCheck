import { Schema, Document, model, models } from "mongoose";

export interface IPhilosophy extends Document {
  name: string;         // 'A Good Man', "Benjamin Franklin's 13 Virtues"
  slug: string;         // unique, stable id — e.g. 'agm', 'franklin-13'
  description: string;  // short marketplace-card blurb
  isSystem: boolean;    // seeded/built-in vs admin-created
  isActive: boolean;    // inactive philosophies are hidden from the marketplace,
                         // but any check-in history referencing them stays intact
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// Deliberately no `virtueCount` field here — computed at read time
// (Virtue.countDocuments({ philosophyId, isActive: true })) so it can never
// drift out of sync as virtues are added/removed within a philosophy.
const PhilosophySchema = new Schema<IPhilosophy>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PhilosophySchema.index({ order: 1 });

export default models.Philosophy || model<IPhilosophy>("Philosophy", PhilosophySchema);
