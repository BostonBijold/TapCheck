import { Schema, Document, model, models } from "mongoose";

// A manager-defined organizational label for InventoryItemTypes — "Freezer,"
// "Cold Storage," "Dry Storage," "Bar." Purely organizational: no NFC tag of
// its own, no par level of its own — see docs/features/inventory.md's
// "Grouping". Archiving a group does NOT archive its items; see
// lib/inventory.ts's archiveInventoryGroup, which sets every member item's
// groupId back to null ("Ungrouped") as part of the same request.
export interface IInventoryGroup extends Document {
  companyId: string;
  name: string;
  createdByUserId: string;
  // Soft-delete/archive — same convention as InventoryItemType.isActive.
  isActive: boolean;
}

const InventoryGroupSchema = new Schema<IInventoryGroup>(
  {
    companyId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    createdByUserId: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default models.InventoryGroup || model<IInventoryGroup>("InventoryGroup", InventoryGroupSchema);
