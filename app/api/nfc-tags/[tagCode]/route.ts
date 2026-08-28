import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { resolveSessionUser } from "@/lib/session";
import NfcTag from "@/models/NfcTag";
import Task from "@/models/Task";

export const dynamic = "force-dynamic";

// POST /api/nfc-tags/[tagCode] — claims an unclaimed tag against taskId.
// Used by app/nfc/[tagCode]'s cold-tap picker path (a tag tapped with no
// PendingNfcLink armed) — the auto-claim path for an armed pending link
// writes directly via the NfcTag model instead of this route, since it
// already runs server-side in the page. Manager-only, same as POST
// /api/nfc-tags.
export async function POST(
  req: NextRequest,
  { params }: { params: { tagCode: string } }
) {
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

  const tag = await NfcTag.findOne({ tagCode: params.tagCode });
  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  if (tag.companyId) return NextResponse.json({ error: "Tag already claimed" }, { status: 409 });

  const task = await Task.findOne({ _id: taskId, companyId, isActive: true }).lean();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  tag.companyId = companyId;
  tag.taskId = task._id;
  tag.taskListId = task.taskListId;
  tag.claimedByUserId = userId;
  tag.claimedAt = new Date();
  await tag.save();

  return NextResponse.json({ ok: true });
}

// DELETE /api/nfc-tags/[tagCode] — unlink: tag becomes reusable/unclaimed.
// Manager-only.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { tagCode: string } }
) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (role !== "manager") return NextResponse.json({ error: "Managers only" }, { status: 403 });

  await connectDB();

  const tag = await NfcTag.findOne({ tagCode: params.tagCode, companyId });
  if (!tag) return NextResponse.json({ error: "Tag not found" }, { status: 404 });

  tag.companyId = null;
  tag.taskId = null;
  tag.taskListId = null;
  tag.claimedByUserId = null;
  tag.claimedAt = null;
  await tag.save();

  return NextResponse.json({ ok: true });
}
