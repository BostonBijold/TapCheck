import mongoose from "mongoose";
import InventoryItemType from "@/models/InventoryItemType";
import InventoryLog from "@/models/InventoryLog";
import TaskDefinition from "@/models/TaskDefinition";

// Binds a physical tag's raw UID to an item type's storage location — see
// docs/features/nfc.md's "Multi-target binding". Mirrors
// lib/task-definitions.ts's bindNfcTag: no uniqueness enforcement, since the
// whole point of Part 1's multi-target model is that the same tag can also
// already be bound to a TaskDefinition (or another InventoryItemType) at
// the same physical location. `alsoBoundTo` is informational only, checked
// across BOTH collections since either one could already be claiming this
// UID — the binding UI surfaces it so a manager isn't surprised later.
export async function bindInventoryNfcTag(companyId: string, itemTypeId: string, uid: string) {
  const normalizedUid = uid.toLowerCase();
  const itemType = await InventoryItemType.findOneAndUpdate(
    { _id: itemTypeId, companyId },
    { $set: { nfcTagUid: normalizedUid } },
    { returnDocument: "after" }
  );
  if (!itemType) return null;

  const [otherItemTypes, boundTasks] = await Promise.all([
    InventoryItemType.find(
      { companyId, nfcTagUid: normalizedUid, isActive: true, _id: { $ne: itemTypeId } },
      { name: 1 }
    ).lean(),
    TaskDefinition.find({ companyId, nfcTagUid: normalizedUid, isActive: true }, { name: 1 }).lean(),
  ]);

  return { itemType, alsoBoundTo: [...otherItemTypes, ...boundTasks].map((d) => d.name) };
}

export async function unbindInventoryNfcTag(companyId: string, itemTypeId: string) {
  return InventoryItemType.findOneAndUpdate(
    { _id: itemTypeId, companyId },
    { $set: { nfcTagUid: null } },
    { returnDocument: "after" }
  );
}

// Batch "most recent log per item type" — the Inventory tab's list view
// needs a current-count + last-logged-by/when for every active item type in
// one shot, not a per-row round trip. Pulls every log for the given
// itemTypeIds sorted newest-first and keeps only the first (= most recent)
// row seen per id, same Map-based join style as lib/task-definitions.ts's
// resolveTasks.
export async function getLatestInventoryLogs(
  companyId: string,
  itemTypeIds: mongoose.Types.ObjectId[]
): Promise<Map<string, { count: number; loggedByUserId: string; loggedAt: Date }>> {
  if (itemTypeIds.length === 0) return new Map();

  const logs = await InventoryLog.find({ companyId, itemTypeId: { $in: itemTypeIds } })
    .sort({ loggedAt: -1 })
    .lean();

  const latestByItemTypeId = new Map<string, { count: number; loggedByUserId: string; loggedAt: Date }>();
  for (const log of logs) {
    const key = log.itemTypeId.toString();
    if (!latestByItemTypeId.has(key)) {
      latestByItemTypeId.set(key, { count: log.count, loggedByUserId: log.loggedByUserId, loggedAt: log.loggedAt });
    }
  }
  return latestByItemTypeId;
}
