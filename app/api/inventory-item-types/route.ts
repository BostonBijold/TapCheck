import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import InventoryItemType from "@/models/InventoryItemType";
import User from "@/models/User";
import { getLatestInventoryLogs } from "@/lib/inventory";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/inventory-item-types — the company's full inventory catalog, for
// the Inventory tab's list view (components/InventoryView.tsx). Open to any
// signed-in company user, same "any employee on shift" philosophy as the
// rest of Inventory — see docs/features/inventory.md. Each row is joined
// with its most recent InventoryLog (the "current count") and that log's
// author's display name, so the list view needs no further round trips.
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const itemTypes = await InventoryItemType.find({ companyId, isActive: true }).sort({ name: 1 }).lean();
  const latestLogs = await getLatestInventoryLogs(companyId, itemTypes.map((it) => it._id));

  // Excludes SKIP_AUTH's non-ObjectId dev sentinel (same filter as
  // app/api/task-logs/history/route.ts's identical join) — User._id is a
  // real ObjectId schema type, so an unfiltered $in throws a CastError.
  const loggerIds = Array.from(new Set(Array.from(latestLogs.values()).map((l) => l.loggedByUserId))).filter((id) =>
    mongoose.isValidObjectId(id)
  );
  const loggers = loggerIds.length > 0 ? await User.find({ _id: { $in: loggerIds } }, "name").lean() : [];
  const loggerNameById = new Map(loggers.map((u) => [u._id.toString(), u.name ?? "Unknown"]));

  return NextResponse.json(
    itemTypes.map((it) => {
      const latest = latestLogs.get(it._id.toString());
      // Below par: latest logged count <= parLevel — see
      // docs/features/inventory.md's "Par-level alerting". parLevel: null
      // (or nothing logged yet) can never be below par.
      const belowPar = it.parLevel !== null && latest !== undefined && latest.count <= it.parLevel;
      return {
        _id: it._id.toString(),
        name: it.name,
        unit: it.unit ?? null,
        parLevel: it.parLevel ?? null,
        nfcTagUid: it.nfcTagUid ?? null,
        nfcRequiredToLog: it.nfcRequiredToLog ?? false,
        groupId: it.groupId ? it.groupId.toString() : null,
        currentCount: latest?.count ?? null,
        lastLoggedAt: latest ? new Date(latest.loggedAt).toISOString() : null,
        lastLoggedByName: latest ? loggerNameById.get(latest.loggedByUserId) ?? "Unknown" : null,
        belowPar,
      };
    })
  );
}

// POST /api/inventory-item-types — create a new catalog entry. Manager-only,
// same gate as creating a TaskDefinition. NFC binding is a separate step
// (POST /api/inventory-item-types/[id]/nfc-tag, once the item exists) —
// mirrors the task catalog's own create-then-bind flow.
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const unit = typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null;
  const parLevel = typeof body.parLevel === "number" && Number.isFinite(body.parLevel) ? body.parLevel : null;
  const groupId = typeof body.groupId === "string" && body.groupId ? body.groupId : null;

  await connectDB();

  if (groupId && !mongoose.isValidObjectId(groupId)) {
    return NextResponse.json({ error: "Invalid groupId" }, { status: 400 });
  }

  const itemType = await InventoryItemType.create({
    companyId,
    name,
    unit,
    parLevel,
    groupId,
    createdByUserId: userId,
  });

  return NextResponse.json({
    _id: itemType._id.toString(),
    name: itemType.name,
    unit: itemType.unit,
    parLevel: itemType.parLevel,
    nfcTagUid: itemType.nfcTagUid,
    nfcRequiredToLog: itemType.nfcRequiredToLog,
    groupId: itemType.groupId ? itemType.groupId.toString() : null,
    currentCount: null,
    lastLoggedAt: null,
    lastLoggedByName: null,
    belowPar: false,
  });
}
