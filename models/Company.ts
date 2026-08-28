import { Schema, Document, model, models } from "mongoose";

// Top-level tenant record. Deliberately generic — a restaurant, gym, hotel,
// or any other location-based service business is just a Company with its
// own users, shift groups, tasks, and check history. Nothing here (or in
// code that touches it) should be restaurant-specific.
export interface ICompany extends Document {
  companyName: string;
  // Stubbed for v1 — no UI or logic reads these yet, but every tenant will
  // eventually need them, so the fields exist ahead of that work.
  industry: string | null;
  timezone: string | null;
  notificationPreferences: Record<string, unknown>;
}

const CompanySchema = new Schema<ICompany>(
  {
    companyName: { type: String, required: true },
    industry: { type: String, default: null },
    timezone: { type: String, default: null },
    notificationPreferences: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default models.Company || model<ICompany>("Company", CompanySchema);
