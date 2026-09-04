import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { getDates } from "@/lib/report-dates";
import { resolveSessionUser } from "@/lib/session";
import InventoryItemType from "@/models/InventoryItemType";
import InventoryLog from "@/models/InventoryLog";

export const dynamic = "force-dynamic";

// GET /api/reports/inventory?days=7|30[&itemTypeId=] — manager-only trend
// history for the Reports Inventory sub-tab's bar charts (Story 5). The
// below-par callout (Story 6) needs no query here at all — it reuses GET
// /api/inventory-item-types's existing belowPar/lastLoggedAt fields
// client-side. See docs/features/reports.md's "Reports v2" addendum.
//
// `itemTypeId` omitted (the InventoryTab.tsx default — every item's chart
// shown at once, not opened one at a time) returns every active item's
// trend in one batched response: one query for the catalog, one query for
// every matching log, grouped in memory — not N+1 round trips. Passing
// `itemTypeId` narrows to that one item's trend only (kept for any future
// single-item consumer).
export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const itemTypeId = searchParams.get("itemTypeId");
  if (itemTypeId && !mongoose.isValidObjectId(itemTypeId)) {
    return NextResponse.json({ error: "Invalid itemTypeId" }, { status: 400 });
  }
  const days = Math.min(30, Math.max(7, parseInt(searchParams.get("days") ?? "30")));

  await connectDB();

  const localDate = new Date().toISOString().split("T")[0];
  const dates = getDates(days, localDate);
  // loggedAt is a Date, not a stored YYYY-MM-DD string like TaskLog.date —
  // convert the window's first/last date strings to local-midnight
  // boundaries, same "T12:00:00"-anchor-trick convention lib/report-dates.ts
  // itself uses rather than a rigorous Company.timezone conversion.
  const start = new Date(dates[0] + "T00:00:00");
  const end = new Date(dates[dates.length - 1] + "T23:59:59.999");

  const itemTypes = await InventoryItemType.find(
    itemTypeId ? { _id: itemTypeId, companyId } : { companyId, isActive: true }
  ).lean();
  if (itemTypeId && itemTypes.length === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const rawLogs = itemTypes.length > 0
    ? await InventoryLog.find({
        companyId,
        itemTypeId: { $in: itemTypes.map((it) => it._id) },
        loggedAt: { $gte: start, $lte: end },
      })
        .sort({ loggedAt: 1 })
        .lean()
    : [];

  const logsByItem = new Map<string, typeof rawLogs>();
  for (const log of rawLogs) {
    const key = log.itemTypeId.toString();
    if (!logsByItem.has(key)) logsByItem.set(key, []);
    logsByItem.get(key)!.push(log);
  }

  const items = itemTypes.map((it) => ({
    itemTypeId: it._id.toString(),
    name: it.name,
    unit: it.unit ?? null,
    parLevel: it.parLevel ?? null,
    logs: (logsByItem.get(it._id.toString()) ?? []).map((l) => ({
      _id: l._id.toString(),
      count: l.count,
      loggedAt: new Date(l.loggedAt).toISOString(),
    })),
  }));

  // Single-item shape stays back-compat for a ?itemTypeId= caller; the
  // no-arg (default) path returns the batched `items[]` shape.
  if (itemTypeId) {
    return NextResponse.json(items[0]);
  }
  return NextResponse.json({ days, today: localDate, items });
}
