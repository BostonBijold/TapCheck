import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskDefinition from "@/models/TaskDefinition";
import Task from "@/models/Task";
import TaskList from "@/models/TaskList";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/task-definitions — the company's full saved-task catalog
// ("Company Task Catalog"), regardless of which lists currently use them —
// see docs/features/task-lists.md's "Company Task Catalog" section.
// Includes, per definition, which lists it's currently placed in (name +
// placement id), so the manager UI can show "used in Opening, Closing" and
// block/allow deletion accordingly. Also the pull-sync source for the
// offline SQLite cache's `task_definitions` table (companyId/updatedAt
// added for that purpose — see docs/features/offline.md).
export async function GET() {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  await connectDB();

  const definitions = await TaskDefinition.find({ companyId, isActive: true }).sort({ name: 1 }).lean();
  const placements = await Task.find({
    companyId,
    isActive: true,
    definitionId: { $in: definitions.map((d) => d._id) },
  }).lean();

  const taskLists = await TaskList.find({
    _id: { $in: placements.map((p) => p.taskListId) },
  }).select("name").lean();
  const listNameById = new Map(taskLists.map((tl) => [tl._id.toString(), tl.name]));

  const placementsByDefinitionId = new Map<string, Array<{ taskId: string; taskListId: string; taskListName: string }>>();
  for (const p of placements) {
    const key = p.definitionId.toString();
    const list = placementsByDefinitionId.get(key) ?? [];
    list.push({
      taskId: p._id.toString(),
      taskListId: p.taskListId.toString(),
      taskListName: listNameById.get(p.taskListId.toString()) ?? "",
    });
    placementsByDefinitionId.set(key, list);
  }

  return NextResponse.json(
    definitions.map((d) => ({
      _id: d._id.toString(),
      companyId,
      name: d.name,
      icon: d.icon,
      taskType: d.taskType,
      formFields: d.formFields ?? [],
      projectedMinutes: d.projectedMinutes,
      nfcTagUid: d.nfcTagUid ?? null,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
      placements: placementsByDefinitionId.get(d._id.toString()) ?? [],
    }))
  );
}
