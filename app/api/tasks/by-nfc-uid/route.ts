import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/tasks/by-nfc-uid?uid=<uid> — resolves a scanned physical tag's
// raw UID (see docs/features/nfc.md's "In-app scan-to-complete binding")
// back to whichever task it's bound to, for the FAB's "scan to open a task"
// shortcut (components/BottomNav.tsx). Open to any signed-in company user —
// same "any employee on shift" philosophy as triggering an already-linked
// tap-to-trigger tag; only binding a tag in the first place is manager-only.
export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  await connectDB();

  const task = await Task.findOne({ companyId, nfcTagUid: uid.toLowerCase(), isActive: true }).lean();
  if (!task) return NextResponse.json({ error: "No task is linked to this tag" }, { status: 404 });

  return NextResponse.json({ taskId: task._id.toString() });
}
