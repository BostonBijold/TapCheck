import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskDefinition from "@/models/TaskDefinition";
import Task from "@/models/Task";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// DELETE /api/task-definitions/[id] — removes a saved task from the
// company's catalog entirely (soft delete). Manager-only. Blocked while any
// active Task placement still references it — a manager has to remove it
// from every list first ("used in Opening, Closing — remove those first"),
// per the deliberate choice in docs/features/task-lists.md's "Company Task
// Catalog" section: simplest to build, no cascading-delete surprise state.
// Removing a single placement (not the whole definition) is
// DELETE /api/tasks/[id] instead — unaffected by this route.
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

  const definition = await TaskDefinition.findOne({ _id: params.id, companyId });
  if (!definition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const activePlacementCount = await Task.countDocuments({ companyId, definitionId: definition._id, isActive: true });
  if (activePlacementCount > 0) {
    return NextResponse.json(
      { error: `Still used in ${activePlacementCount} task list${activePlacementCount === 1 ? "" : "s"} — remove it from those first.` },
      { status: 409 }
    );
  }

  definition.isActive = false;
  await definition.save();

  return NextResponse.json({ ok: true });
}
