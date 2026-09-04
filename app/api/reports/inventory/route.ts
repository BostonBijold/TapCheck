import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { getDates } from "@/lib/report-dates";
import { resolveSessionUser } from "@/lib/session";
import InventoryItemType from "@/models/InventoryItemType";
import InventoryLog from "@/models/InventoryLog";

export const dynamic = "force-dynamic";

// GET /api/reports/inventory?itemTypeId=&days=7|30 — manager-only trend
// history for one InventoryItemType's logged counts, for the Reports
// Inventory sub-tab's line/bar chart (Story 5). The below-par callout
// (Story 6) needs no query here at all — it reuses GET
// /api/inventory-item-types's existing belowPar/lastLoggedAt fields
// client-side. See docs/features/reports.md's "Reports v2" addendum.
export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const itemTypeId = searchParams.get("itemTypeId");
  if (!itemTypeId || !mongoose.isValidObjectId(itemTypeId)) {
    return NextResponse.json({ error: "Valid itemTypeId is required" }, { status: 400 });
  }
  const days = Math.min(30, Math.max(7, parseInt(searchParams.get("days") ?? "30")));

  await connectDB();

  const itemType = await InventoryItemType.findOne({ _id: itemTypeId, companyId }).lean();
  if (!itemType) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const localDate = new Date().toISOString().split("T")[0];
  const dates = getDates(days, localDate);
  // loggedAt is a Date, not a stored YYYY-MM-DD string like TaskLog.date —
  // convert the window's first/last date strings to local-midnight
  // boundaries, same "T12:00:00"-anchor-trick convention lib/report-dates.ts
  // itself uses rather than a rigorous Company.timezone conversion.
  const start = new Date(dates[0] + "T00:00:00");
  const end = new Date(dates[dates.length - 1] + "T23:59:59.999");

  const rawLogs = await InventoryLog.find({
    companyId,
    itemTypeId,
    loggedAt: { $gte: start, $lte: end },
  })
    .sort({ loggedAt: 1 })
    .lean();

  return NextResponse.json({
    itemTypeId,
    name: itemType.name,
    unit: itemType.unit ?? null,
    parLevel: itemType.parLevel ?? null,
    logs: rawLogs.map((l) => ({
      _id: l._id.toString(),
      count: l.count,
      loggedAt: new Date(l.loggedAt).toISOString(),
    })),
  });
}
