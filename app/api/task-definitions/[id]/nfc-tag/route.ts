import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { bindNfcTag, unbindNfcTag } from "@/lib/task-definitions";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST /api/task-definitions/[id]/nfc-tag — binds a physical tag's raw UID
// directly to a TaskDefinition, by its own id — used by the Manage Tasks
// screen's company task catalog (components/ManageTasksView.tsx), which
// lists every saved task regardless of whether it's placed in any list yet.
// app/api/tasks/[id]/nfc-tag is the placement-addressed equivalent used by
// TaskListEditView's per-row "Scan-to-Complete Tag" panel; both share
// lib/task-definitions.ts's bindNfcTag/unbindNfcTag so the one-tag-one-task
// uniqueness enforcement lives in exactly one place. Manager-only, same
// gate as the other NFC-linking routes.
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

  const definition = await bindNfcTag(companyId, params.id, uid);
  if (!definition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ nfcTagUid: definition.nfcTagUid });
}

// DELETE /api/task-definitions/[id]/nfc-tag — unbind. Manager-only.
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

  const definition = await unbindNfcTag(companyId, params.id);
  if (!definition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
