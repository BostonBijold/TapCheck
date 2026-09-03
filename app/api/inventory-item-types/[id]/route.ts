import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import InventoryItemType from "@/models/InventoryItemType";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/inventory-item-types/[id] — single item type, for the detail/log
// screen's server-rendered page (app/(app)/inventory/[itemTypeId]/page.tsx).
// Open to any signed-in company user, same as the list route.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const itemType = await InventoryItemType.findOne({ _id: params.id, companyId, isActive: true }).lean();
  if (!itemType) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: itemType._id.toString(),
    name: itemType.name,
    unit: itemType.unit ?? null,
    parLevel: itemType.parLevel ?? null,
    nfcTagUid: itemType.nfcTagUid ?? null,
    nfcRequiredToLog: itemType.nfcRequiredToLog ?? false,
    groupId: itemType.groupId ? itemType.groupId.toString() : null,
  });
}

// PATCH /api/inventory-item-types/[id] — edit name/unit/parLevel/groupId/
// nfcRequiredToLog. Manager-only. NFC binding (the tag itself) has its own
// route (./nfc-tag), same split as TaskDefinition — groupId and
// nfcRequiredToLog are plain fields here, not a binding lifecycle, see
// docs/features/inventory.md's "Grouping" and "NFC enforcement".
const EDITABLE_FIELDS = ["name", "unit", "parLevel", "groupId", "nfcRequiredToLog"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = await req.json();
  const updates: Partial<Record<(typeof EDITABLE_FIELDS)[number], unknown>> = {};
  for (const key of EDITABLE_FIELDS) if (key in body) updates[key] = body[key];

  if ("name" in updates) {
    const name = typeof updates.name === "string" ? updates.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    updates.name = name;
  }
  if ("unit" in updates) {
    updates.unit = typeof updates.unit === "string" && updates.unit.trim() ? updates.unit.trim() : null;
  }
  if ("parLevel" in updates) {
    updates.parLevel = typeof updates.parLevel === "number" && Number.isFinite(updates.parLevel) ? updates.parLevel : null;
  }
  if ("groupId" in updates) {
    const groupId = typeof updates.groupId === "string" && updates.groupId ? updates.groupId : null;
    if (groupId && !mongoose.isValidObjectId(groupId)) {
      return NextResponse.json({ error: "Invalid groupId" }, { status: 400 });
    }
    updates.groupId = groupId;
  }
  if ("nfcRequiredToLog" in updates) {
    updates.nfcRequiredToLog = updates.nfcRequiredToLog === true;
  }

  await connectDB();

  const itemType = await InventoryItemType.findOneAndUpdate(
    { _id: params.id, companyId },
    { $set: updates },
    { returnDocument: "after" }
  );
  if (!itemType) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: itemType._id.toString(),
    name: itemType.name,
    unit: itemType.unit,
    parLevel: itemType.parLevel,
    nfcTagUid: itemType.nfcTagUid,
    nfcRequiredToLog: itemType.nfcRequiredToLog,
    groupId: itemType.groupId ? itemType.groupId.toString() : null,
  });
}

// DELETE /api/inventory-item-types/[id] — archive (soft delete). Manager-
// only. No "still in use" block like TaskDefinition's — an item type has no
// placement concept to check, and historical InventoryLog rows stay valid
// (and readable — they carry their own count/loggedAt) once archived, same
// as an archived TaskDefinition's TaskLog history stays intact.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  await connectDB();

  const itemType = await InventoryItemType.findOne({ _id: params.id, companyId });
  if (!itemType) return NextResponse.json({ error: "Not found" }, { status: 404 });

  itemType.isActive = false;
  await itemType.save();

  return NextResponse.json({ ok: true });
}
