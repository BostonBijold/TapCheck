import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TaskTemplate from "@/models/TaskTemplate";
import Task from "@/models/Task";
import TaskDefinition from "@/models/TaskDefinition";
import { sanitizeFormFields } from "@/lib/form-fields";
import { ensureSystemTemplates } from "@/lib/seed-templates";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/task-templates?taskListId=<id>
// Returns system templates + the company's custom templates, minus any already in the list
export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const taskListId = req.nextUrl.searchParams.get("taskListId");

  await connectDB();

  // Idempotent — re-syncs the system catalog's icon/fields on every browse
  // (see lib/seed-templates.ts), not just for a brand-new company (which
  // seeds it once via seedDefaultTaskLists). Keeps an existing company's
  // catalog current after a system template's icon changes.
  await ensureSystemTemplates();

  // Find template IDs already used in this list (if filtering) — templateId
  // lives on the TaskDefinition now (see models/TaskDefinition.ts), one
  // layer above the placement, so this goes through definitionId.
  let excludedTemplateIds: string[] = [];
  if (taskListId) {
    const existing = await Task.find({ taskListId, companyId, isActive: true }).select("definitionId").lean();
    const definitions = await TaskDefinition.find({ _id: { $in: existing.map((t) => t.definitionId) } })
      .select("templateId")
      .lean();
    excludedTemplateIds = definitions
      .map((d) => d.templateId?.toString())
      .filter(Boolean) as string[];
  }

  const templates = await TaskTemplate.find({
    isActive: true,
    _id: { $nin: excludedTemplateIds },
    $or: [{ isSystem: true }, { companyId }],
  })
    .sort({ timeOfDay: 1, category: 1, name: 1 })
    .lean();

  return NextResponse.json(
    templates.map((t) => ({
      _id: t._id.toString(),
      name: t.name,
      icon: t.icon,
      defaultProjectedMinutes: t.defaultProjectedMinutes,
      category: t.category,
      timeOfDay: t.timeOfDay,
      isSystem: t.isSystem,
      formFields: t.formFields ?? [],
    }))
  );
}

// POST /api/task-templates — create a custom company template
export async function POST(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const { name, icon, defaultProjectedMinutes, category, timeOfDay, description, formFields } =
    await req.json();

  if (!name?.trim() || !icon) {
    return NextResponse.json({ error: "Name and icon required" }, { status: 400 });
  }

  await connectDB();

  const template = await TaskTemplate.create({
    name: name.trim(),
    icon,
    defaultProjectedMinutes: defaultProjectedMinutes ?? 15,
    category: category ?? "custom",
    timeOfDay: timeOfDay ?? "any",
    description: description ?? null,
    isSystem: false,
    companyId,
    isActive: true,
    formFields: sanitizeFormFields(formFields),
  });

  return NextResponse.json({
    _id: template._id.toString(),
    name: template.name,
    icon: template.icon,
    defaultProjectedMinutes: template.defaultProjectedMinutes,
    category: template.category,
    timeOfDay: template.timeOfDay,
    isSystem: false,
    formFields: template.formFields,
  });
}
