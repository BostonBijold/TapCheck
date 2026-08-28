import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { resolveSessionUser } from "@/lib/session";
import NfcTag from "@/models/NfcTag";
import Task from "@/models/Task";

export const dynamic = "force-dynamic";

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
// NFC hardware involved at all: for a manager who wants a silent Shortcuts
// trigger without a pre-written branded card. The tagCode this mints is
// otherwise indistinguishable from one written to a physical tag — the
// manager binds it to a physical (blank, any-brand) tag later, entirely
// within the Shortcuts app's own NFC Automation setup. See
// docs/features/nfc.md's "Generating a trigger without a physical tap".
// Manager-only, same as the other /api/nfc-tags routes.
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId, companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { taskId } = await req.json();
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  await connectDB();

  const task = await Task.findOne({ _id: taskId, companyId, isActive: true }).lean();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const tagCode = await uniqueTagCode();
  await NfcTag.create({
    tagCode,
    companyId,
    taskId: task._id,
    taskListId: task.taskListId,
    claimedByUserId: userId,
    claimedAt: new Date(),
  });

  return NextResponse.json({ ok: true, tagCode });
}
