import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/tasks/[id]/nfc-tag — binds a physical tag's raw UID (scanned
// in-app, see lib/native/nfc-scan.ts) directly to this task. Manager-only,
// same gate as the other NFC-linking routes (app/api/nfc-tags). Distinct
// from that tagCode/URL system — see docs/features/nfc.md's "In-app
// scan-to-complete binding".
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { uid } = await req.json();
  if (!uid || typeof uid !== "string") {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  await connectDB();

  const task = await Task.findOneAndUpdate(
    { _id: params.id, companyId },
    { $set: { nfcTagUid: uid.toLowerCase() } },
    { returnDocument: "after" }
  );
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ nfcTagUid: task.nfcTagUid });
}

// DELETE /api/tasks/[id]/nfc-tag — unbind. Manager-only.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  await connectDB();

  const task = await Task.findOneAndUpdate(
    { _id: params.id, companyId },
    { $set: { nfcTagUid: null } },
    { returnDocument: "after" }
  );
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
