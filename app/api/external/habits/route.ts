import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findUserIdByApiKey } from "@/lib/api-key";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";

export const dynamic = "force-dynamic";

// GET-based, read-only sibling to trigger-habit/nfc/[tagCode] — lists a
// user's active habits so a caller can pick one before triggering it.
// Built for the native App Intents HabitEntityQuery (ios/App/App/AppIntents),
// which needs a live list to back a Shortcuts/Siri picker; no Shortcut or
// URL-based flow calls this directly. See docs/features/app-intents.md.
//
// Flat, denormalized shape (group context inlined per habit) rather than
// GET /api/routines's nested-group array — a picker entry needs "Morning
// Routine: Shower" in one row, not a tree to flatten client-side.
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") || req.nextUrl.searchParams.get("apiKey");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  await connectDB();

  const userId = await findUserIdByApiKey(apiKey);
  if (!userId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const groups = await RoutineGroup.find({ userId }).sort({ order: 1 }).lean();
  const groupOrder = new Map(groups.map((g, i) => [g._id.toString(), i]));
  const groupName = new Map(groups.map((g) => [g._id.toString(), g.name]));

  const items = await RoutineItem.find({ userId, isActive: true }).sort({ order: 1 }).lean();

  // Stable sort by group order — items within a group keep the item-order
  // sort the query above already applied.
  const sortedItems = [...items].sort(
    (a, b) => (groupOrder.get(a.groupId.toString()) ?? 0) - (groupOrder.get(b.groupId.toString()) ?? 0)
  );

  const habits = sortedItems.map((item) => {
    const groupId = item.groupId.toString();
    return {
      id: item._id.toString(),
      name: item.name,
      icon: item.icon,
      itemType: item.itemType,
      groupId,
      groupName: groupName.get(groupId) ?? "",
    };
  });

  return NextResponse.json({ ok: true, habits });
}
