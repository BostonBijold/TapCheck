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

// POST /api/nfc-tags/[tagCode] — claims an unclaimed tag against
// routineItemId. Used by app/nfc/[tagCode]'s cold-tap picker path (a tag
// tapped with no PendingNfcLink armed) — the auto-claim path for an armed
// pending link writes directly via the NfcTag model instead of this route,
// since it already runs server-side in the page.
export async function POST(
  req: NextRequest,
  { params }: { params: { tagCode: string } }
) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { routineItemId } = await req.json();
  if (!routineItemId) {
    return NextResponse.json({ error: "Missing routineItemId" }, { status: 400 });
  }

  await connectDB();

  const tag = await NfcTag.findOne({ tagCode: params.tagCode });
  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  if (tag.userId) return NextResponse.json({ error: "Tag already claimed" }, { status: 409 });

  const item = await RoutineItem.findOne({ _id: routineItemId, userId, isActive: true }).lean();
  if (!item) return NextResponse.json({ error: "Routine item not found" }, { status: 404 });

  tag.userId = userId;
  tag.routineItemId = item._id;
  tag.routineGroupId = item.groupId;
  tag.claimedAt = new Date();
  await tag.save();

  return NextResponse.json({ ok: true });
}

// DELETE /api/nfc-tags/[tagCode] — unlink: tag becomes reusable/unclaimed.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { tagCode: string } }
) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const tag = await NfcTag.findOne({ tagCode: params.tagCode, userId });
  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

  tag.userId = null;
  tag.routineItemId = null;
  tag.routineGroupId = null;
  tag.claimedAt = null;
  await tag.save();

  return NextResponse.json({ ok: true });
}
