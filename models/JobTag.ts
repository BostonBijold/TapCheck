import { Schema, Document, model, models } from "mongoose";

// A manager-defined job-function label ("Server," "Cook," "Busser," "Host")
// for tagging teammates — see docs/features/locations.md's "Job tags".
// Orthogonal to User.role, which governs access; this is company-scoped
// vocabulary only. Deliberately narrower than InventoryGroup: no
// containment relationship to keep in sync, just a name every User.jobTags
// entry references by string (see lib/job-tags.ts for the rename/archive
// cascade that keeps those references in sync with this catalog).
export interface IJobTag extends Document {
  companyId: string;
  name: string;
  createdByUserId: string;
  // Soft-delete/archive — same convention as InventoryGroup.isActive.
  isActive: boolean;
}

const JobTagSchema = new Schema<IJobTag>(
  {
    companyId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    createdByUserId: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default models.JobTag || model<IJobTag>("JobTag", JobTagSchema);
