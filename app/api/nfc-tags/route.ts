import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import NfcTag from "@/models/NfcTag";
import PendingNfcLink from "@/models/PendingNfcLink";
import RoutineItem from "@/models/RoutineItem";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

function resolveUserId(sessionId?: string) {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

// GET /api/nfc-tags — this user's linked tags, for the Manage Habit edit
// panel to show current link status per item.
export async function GET() {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const tags = await NfcTag.find({ userId }).lean();
  return NextResponse.json(
    tags.map((t) => ({
      tagCode: t.tagCode,
      routineItemId: t.routineItemId?.toString() ?? null,
    }))
  );
}

// POST /api/nfc-tags — arms a PendingNfcLink for routineItemId: "Link NFC
// Tag" in Manage Habit calls this, then the user physically taps an
// unclaimed tag, which claims it against whichever item was armed here (see
// app/nfc/[tagCode]/page.tsx). One pending link per user — a fresh arm
// replaces whatever was previously pending.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { routineItemId } = await req.json();
  if (!routineItemId) {
    return NextResponse.json({ error: "Missing routineItemId" }, { status: 400 });
  }

  await connectDB();

  const item = await RoutineItem.findOne({ _id: routineItemId, userId, isActive: true }).lean();
  if (!item) return NextResponse.json({ error: "Routine item not found" }, { status: 404 });

  await PendingNfcLink.findOneAndUpdate(
    { userId },
    { $set: { routineItemId, armedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
