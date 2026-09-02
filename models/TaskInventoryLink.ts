import mongoose, { Schema, Document, model, models } from "mongoose";

// Join row connecting a TaskDefinition to an InventoryItemType — see
// docs/features/inventory.md's "Task ↔ Inventory Linking". A row per pair,
// not a bare array field on either side, since `required` is a property of
// the PAIRING: the same item type can be required on one task and optional
// on another. Lives at the TaskDefinition level (not per Task placement),
// same reasoning as TaskDefinition.nfcTagUid — a link set from one list's
// edit screen is shared by every list this saved task is placed in.
export interface ITaskInventoryLink extends Document {
  companyId: string;
  taskDefinitionId: mongoose.Types.ObjectId;
  itemTypeId: mongoose.Types.ObjectId;
  required: boolean;
}

const TaskInventoryLinkSchema = new Schema<ITaskInventoryLink>(
  {
    companyId: { type: String, required: true, index: true },
    taskDefinitionId: { type: Schema.Types.ObjectId, ref: "TaskDefinition", required: true },
    itemTypeId: { type: Schema.Types.ObjectId, ref: "InventoryItemType", required: true },
    required: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One link per (task, item) pair — re-linking an already-linked item just
// updates `required` on the existing row instead of creating a duplicate.
TaskInventoryLinkSchema.index({ taskDefinitionId: 1, itemTypeId: 1 }, { unique: true });

export default models.TaskInventoryLink || model<ITaskInventoryLink>("TaskInventoryLink", TaskInventoryLinkSchema);
