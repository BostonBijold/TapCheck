import { Schema, Document, model, models } from "mongoose";

// One physical store under a Company — see docs/features/locations.md.
// Scope is deliberately narrow: one company, many locations, never the
// other way around (an owner running two legally-separate businesses still
// needs two separate Company accounts). A Location never exists without a
// Company — companyId is the only relationship, same pattern as
// TaskList/Task under Company.
export interface ILocation extends Document {
  companyId: string;
  name: string;
  address: string | null;
  timezone: string | null;
  isActive: boolean;
  createdAt: Date;
}

const LocationSchema = new Schema<ILocation>(
  {
    companyId: { type: String, required: true },
    name: { type: String, required: true },
    address: { type: String, default: null },
    timezone: { type: String, default: null },
    // Soft-delete/close — same convention as TaskList.isActive — so a closed
    // location's historical TaskLog/InventoryLog/TaskListSession rows stay
    // intact rather than being orphaned.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// "List this company's active locations" — the location switcher, invite
// defaults, and team roster scoping all run this lookup constantly.
LocationSchema.index({ companyId: 1, isActive: 1 });

export default models.Location || model<ILocation>("Location", LocationSchema);
