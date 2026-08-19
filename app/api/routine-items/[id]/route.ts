import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineItem from "@/models/RoutineItem";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string) {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

// DELETE /api/routine-items/[id] — remove from user's routine (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const item = await RoutineItem.findOne({ _id: params.id, userId });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft delete — keeps log history intact
  item.isActive = false;
  await item.save();

  return NextResponse.json({ ok: true });
}

// PATCH /api/routine-items/[id] — update name/icon/projectedMinutes
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const updates = await req.json();
  const allowed = ["name", "icon", "projectedMinutes", "itemType", "scheduledDays", "successThreshold"] as const;
  const sanitized: Partial<Record<(typeof allowed)[number], unknown>> = {};
  for (const key of allowed) {
    if (key in updates) sanitized[key] = updates[key];
  }

  await connectDB();

  // Clamp threshold against whichever scheduledDays is now in effect —
  // the one just sent, or the item's existing one if only the threshold
  // changed — rather than rejecting a mathematically impossible value.
  // If neither is actually changing the threshold, preserve whatever it
  // already was (only clamping it down, never bumping it up to days.length
  // just because scheduledDays changed for an unrelated reason).
  if ("scheduledDays" in sanitized || "successThreshold" in sanitized) {
    const existing = await RoutineItem.findOne({ _id: params.id, userId }).lean();
    const days = Array.isArray(sanitized.scheduledDays)
      ? (sanitized.scheduledDays as number[])
      : existing?.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6];
    const requestedThreshold = "successThreshold" in sanitized
      ? Number(sanitized.successThreshold)
      : existing?.successThreshold ?? days.length;
    sanitized.successThreshold = Math.max(1, Math.min(requestedThreshold, days.length));
  }

  const item = await RoutineItem.findOneAndUpdate(
    { _id: params.id, userId },
    { $set: sanitized },
    { returnDocument: "after" }
  );
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    _id: item._id.toString(),
    name: item.name,
    icon: item.icon,
    projectedMinutes: item.projectedMinutes,
    itemType: item.itemType,
    scheduledDays: item.scheduledDays,
    successThreshold: item.successThreshold,
  });
}
