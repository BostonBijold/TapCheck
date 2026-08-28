import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import HabitTemplate from "@/models/HabitTemplate";
import RoutineItem from "@/models/RoutineItem";
import { sanitizeFormFields } from "@/lib/form-fields";
import { resolveSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/habit-templates?groupId=<id>
// Returns system templates + the company's custom templates, minus any already in the group
export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });

  const groupId = req.nextUrl.searchParams.get("groupId");

  await connectDB();

  // Find template IDs already used in this group (if filtering)
  let excludedTemplateIds: string[] = [];
  if (groupId) {
    const existing = await RoutineItem.find({ groupId, companyId, isActive: true }).lean();
    excludedTemplateIds = existing
      .map((i) => i.templateId?.toString())
      .filter(Boolean) as string[];
  }

  const templates = await HabitTemplate.find({
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

// POST /api/habit-templates — create a custom company template
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

  const template = await HabitTemplate.create({
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
