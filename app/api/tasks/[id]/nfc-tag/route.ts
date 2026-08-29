import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Task from "@/models/Task";
import TaskDefinition from "@/models/TaskDefinition";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/tasks/[id]/nfc-tag — binds a physical tag's raw UID (scanned
// in-app, see lib/native/nfc-scan.ts) to this task's saved TaskDefinition —
// see docs/features/nfc.md's "In-app scan-to-complete binding" and
// docs/features/task-lists.md's "Company Task Catalog" section. Still
// addressed by [id] (a specific list placement, matching how it's called
// from a single row in TaskListEditView), but resolves to the definition
// server-side — binding cascades to every list this task is placed in, not
// just the one the manager happened to click from. Manager-only, same gate
// as the other NFC-linking routes (app/api/nfc-tags).
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

  const task = await Task.findOne({ _id: params.id, companyId }).select("definitionId").lean();
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const definition = await TaskDefinition.findOneAndUpdate(
    { _id: task.definitionId, companyId },
    { $set: { nfcTagUid: uid.toLowerCase() } },
    { returnDocument: "after" }
  );
  if (!definition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ nfcTagUid: definition.nfcTagUid });
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

  const task = await Task.findOne({ _id: params.id, companyId }).select("definitionId").lean();
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const definition = await TaskDefinition.findOneAndUpdate(
    { _id: task.definitionId, companyId },
    { $set: { nfcTagUid: null } },
    { returnDocument: "after" }
  );
  if (!definition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
