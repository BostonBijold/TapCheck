import mongoose, { Schema, Document, model, models } from "mongoose";

// One count entry for an InventoryItemType — append-only, same "never
// mutate a past row" convention as TaskLog: a correction (including a
// manager fixing someone else's fat-fingered entry) is just a new log with
// the right number, not an edit to the old one. The "current count" shown
// anywhere in the UI is simply the most recent row for a given itemTypeId
// (highest loggedAt) — nothing computes or derives it any other way.
export interface IInventoryLog extends Document {
  companyId: string;
  // Which store this count was logged at — see docs/features/locations.md.
  // Null only for logs predating Locations, backfilled by the one-off
  // migration; every new log stamps the logging user's own locationId.
  locationId: string | null;
  itemTypeId: mongoose.Types.ObjectId;
  count: number;
  loggedByUserId: string;
  loggedAt: Date;
  // Set only when this log's count came from a save whose NFC scan matched
  // this item type's own nfcTagUid — null for a manually-typed count with
  // no tag involved, or a scan of the wrong tag (never stored as verified).
  // Purely informational: unlike TaskLog/assertNfcVerified, nothing ever
  // requires this to be set — see models/InventoryItemType.ts.
  verifiedNfcUid: string | null;
}

const InventoryLogSchema = new Schema<IInventoryLog>(
  {
    companyId: { type: String, required: true, index: true },
    locationId: { type: String, default: null },
    itemTypeId: { type: Schema.Types.ObjectId, ref: "InventoryItemType", required: true },
    count: { type: Number, required: true },
    loggedByUserId: { type: String, required: true },
    loggedAt: { type: Date, required: true, default: Date.now },
    verifiedNfcUid: { type: String, default: null },
  },
  { timestamps: true }
);

// Supports "most recent log per item type" (Inventory tab list view's
// current-count column) and the item detail screen's recent-history list —
// both are always "latest N for this itemTypeId at this location," never a
// range scan. The catalog (InventoryItemType) stays company-wide and
// shared across locations — see docs/features/locations.md's open
// questions — so the same item type's count is tracked independently per
// location via this compound key.
InventoryLogSchema.index({ companyId: 1, locationId: 1, itemTypeId: 1, loggedAt: -1 });

export default models.InventoryLog || model<IInventoryLog>("InventoryLog", InventoryLogSchema);
