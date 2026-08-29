import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskDefinition from "@/models/TaskDefinition";
import { resolveMostRelevantPlacement } from "@/lib/task-definitions";
import { resolveFabScanTarget } from "@/lib/task-list-session-actions";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/tasks/by-nfc-uid?uid=<uid>&date=<local date>&nowMinutes=<local
// minutes since midnight> — resolves a scanned physical tag's raw UID (see
// docs/features/nfc.md's "In-app scan-to-complete binding") back to
// whichever task it's bound to, for the FAB's "scan to open a task"
// shortcut (components/BottomNav.tsx). Open to any signed-in company user —
// same "any employee on shift" philosophy as triggering an already-linked
// tap-to-trigger tag; only binding a tag in the first place is manager-only.
//
// NFC binding lives on the TaskDefinition, one layer above any single list
// placement (see docs/features/task-lists.md's "Company Task Catalog"
// section) — so a bound tag can now back more than one placement (the same
// fridge-temp check placed in both the opening and closing lists). date/
// nowMinutes (the client's own local date and local minutes-since-midnight)
// let resolveMostRelevantPlacement pick whichever placement is most likely
// the one being checked right now; both are optional and degrade to a
// simpler fallback without them.
export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, userId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  const date = req.nextUrl.searchParams.get("date") ?? new Date().toISOString().split("T")[0];
  const nowMinutesParam = req.nextUrl.searchParams.get("nowMinutes");
  const nowMinutes = nowMinutesParam !== null ? Number(nowMinutesParam) : null;

  await connectDB();

  const definition = await TaskDefinition.findOne({ companyId, nfcTagUid: uid.toLowerCase(), isActive: true }).lean();
  if (!definition) return NextResponse.json({ error: "No task is linked to this tag" }, { status: 404 });

  const taskId = await resolveMostRelevantPlacement(companyId, definition._id.toString(), date, nowMinutes);
  if (!taskId) return NextResponse.json({ error: "No task is linked to this tag" }, { status: 404 });

  const resolution = await resolveFabScanTarget(companyId, userId, taskId.toString(), date);
  if (!resolution) return NextResponse.json({ error: "No task is linked to this tag" }, { status: 404 });

  const { kind, ...rest } = resolution;
  return NextResponse.json({ mode: kind, ...rest });
}
