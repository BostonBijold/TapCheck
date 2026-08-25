import crypto from "crypto";
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

// Same alphabet as scripts/generate-nfc-tags.mjs (excludes 0/O and 1/l/I) —
// kept as its own copy since that script uses the raw mongodb driver and
// this route uses the NfcTag Mongoose model.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function randomTagCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

async function uniqueTagCode(): Promise<string> {
  for (;;) {
    const code = randomTagCode();
    const exists = await NfcTag.findOne({ tagCode: code }).lean();
    if (!exists) return code;
  }
}

// POST /api/nfc-tags/generate — creates and claims a tag with no physical
// NFC hardware involved at all: for a user who wants a silent Shortcuts
// trigger without a pre-written branded card. The tagCode this mints is
// otherwise indistinguishable from one written to a physical tag — the
// user binds it to a physical (blank, any-brand) tag later, entirely
// within the Shortcuts app's own NFC Automation setup. See
// docs/features/nfc.md's "Generating a trigger without a physical tap".
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

  const tagCode = await uniqueTagCode();
  await NfcTag.create({
    tagCode,
    userId,
    routineItemId: item._id,
    routineGroupId: item.groupId,
    claimedAt: new Date(),
  });

  return NextResponse.json({ ok: true, tagCode });
}
