import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import NfcTag from "@/models/NfcTag";
import RoutineItem from "@/models/RoutineItem";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string) {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

// GET /api/nfc-tags — list this user's tags, optionally filtered to the
// ones linked to a single item (?routineItemId=...), with the linked item's
// name/icon populated for display.
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const routineItemId = req.nextUrl.searchParams.get("routineItemId");
  const query: Record<string, unknown> = { userId };
  if (routineItemId) query.routineItemId = routineItemId;

  const tags = await NfcTag.find(query).sort({ createdAt: 1 }).lean();

  const itemIds = tags.map((t) => t.routineItemId).filter(Boolean);
  const items = itemIds.length
    ? await RoutineItem.find({ _id: { $in: itemIds }, userId }).lean()
    : [];
  const itemsById = new Map(items.map((i) => [i._id.toString(), i]));

  return NextResponse.json(
    tags.map((t) => {
      const item = t.routineItemId ? itemsById.get(t.routineItemId.toString()) : undefined;
      return {
        _id: t._id.toString(),
        tagUID: t.tagUID,
        routineItemId: t.routineItemId ? t.routineItemId.toString() : null,
        groupId: t.groupId ? t.groupId.toString() : null,
        label: t.label,
        itemName: item?.name ?? null,
        itemIcon: item?.icon ?? null,
      };
    })
  );
}

// POST /api/nfc-tags — explicit create-or-reassign, called from the habit
// edit panel ("Link NFC tag"). Upserts on {userId, tagUID} with $set, so
// re-linking an existing tag to a different habit is expected and always
// applies — unlike the resolve page's idempotent tap-triggered register,
// which never overwrites an existing assignment.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tagUID, routineItemId, groupId, label } = await req.json();
  if (!tagUID || typeof tagUID !== "string") {
    return NextResponse.json({ error: "tagUID required" }, { status: 400 });
  }

  await connectDB();

  let item = null;
  if (routineItemId) {
    item = await RoutineItem.findOne({ _id: routineItemId, userId, isActive: true }).lean();
    if (!item) return NextResponse.json({ error: "Routine item not found" }, { status: 404 });
    if (groupId && item.groupId.toString() !== groupId) {
      return NextResponse.json({ error: "Item does not belong to that group" }, { status: 400 });
    }
  }

  const tag = await NfcTag.findOneAndUpdate(
    { userId, tagUID },
    {
      $set: {
        routineItemId: routineItemId ?? null,
        groupId: groupId ?? null,
        label: label ?? null,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return NextResponse.json({
    _id: tag._id.toString(),
    tagUID: tag.tagUID,
    routineItemId: tag.routineItemId ? tag.routineItemId.toString() : null,
    groupId: tag.groupId ? tag.groupId.toString() : null,
    label: tag.label,
  });
}
