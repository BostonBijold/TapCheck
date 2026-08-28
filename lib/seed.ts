import TaskList from "@/models/TaskList";
import Task from "@/models/Task";
import TaskTemplate from "@/models/TaskTemplate";
import {
  ensureSystemTemplates,
  DEFAULT_OPENING_NAMES,
  DEFAULT_MIDSHIFT_NAMES,
  DEFAULT_CLOSING_NAMES,
} from "@/lib/seed-templates";

export async function seedDefaultTaskLists(companyId: string) {
  // Ensure the catalog exists before referencing it
  await ensureSystemTemplates();

  const opening = await TaskList.create({
    companyId,
    name: "Opening Shift",
    timeOfDay: "morning",
    startTime: "08:00",
    order: 0,
    isDefault: true,
  });

  const midShift = await TaskList.create({
    companyId,
    name: "Mid-Shift",
    timeOfDay: "custom",
    startTime: "13:00",
    order: 1,
    isDefault: true,
  });

  const closing = await TaskList.create({
    companyId,
    name: "Closing Shift",
    timeOfDay: "evening",
    startTime: "21:00",
    order: 2,
    isDefault: true,
  });

  // Pull templates from DB by name so order + IDs are correct
  const [openingTemplates, midShiftTemplates, closingTemplates] = await Promise.all([
    TaskTemplate.find({ name: { $in: DEFAULT_OPENING_NAMES }, isSystem: true }).lean(),
    TaskTemplate.find({ name: { $in: DEFAULT_MIDSHIFT_NAMES }, isSystem: true }).lean(),
    TaskTemplate.find({ name: { $in: DEFAULT_CLOSING_NAMES }, isSystem: true }).lean(),
  ]);

  // Preserve the canonical order defined in DEFAULT_*_NAMES
  const sortByDefault = (templates: typeof openingTemplates, names: readonly string[]) =>
    [...templates].sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));

  const insertForList = (
    taskListId: typeof opening._id,
    templates: typeof openingTemplates,
    names: readonly string[]
  ) =>
    Task.insertMany(
      sortByDefault(templates, names).map((t, i) => ({
        companyId,
        taskListId,
        templateId: t._id,
        name: t.name,
        icon: t.icon,
        taskType: "form",
        projectedMinutes: t.defaultProjectedMinutes,
        formFields: t.formFields ?? [],
        order: i,
        isActive: true,
      }))
    );

  await Promise.all([
    insertForList(opening._id, openingTemplates, DEFAULT_OPENING_NAMES),
    insertForList(midShift._id, midShiftTemplates, DEFAULT_MIDSHIFT_NAMES),
    insertForList(closing._id, closingTemplates, DEFAULT_CLOSING_NAMES),
  ]);
}

// Idempotent — creates a standalone "Anytime Tasks" list (timeOfDay:
// 'anytime' — same standalone-list mechanics as any manager-created task
// list, just seeded with example form tasks) if none exists. These are
// anytime/recurring tasks (fridge/freezer temps, restroom checklists) that
// don't belong to a single shift window.
export async function ensureAnytimeTaskList(companyId: string) {
  const existing = await TaskList.findOne({ companyId, timeOfDay: "anytime" });
  if (existing) return;

  const topList = await TaskList.findOne({ companyId }).sort({ order: -1 }).lean();
  const nextOrder = topList ? topList.order + 1 : 10;

  const list = await TaskList.create({
    companyId,
    name: "Anytime Tasks",
    timeOfDay: "anytime",
    startTime: null,
    order: nextOrder,
    isDefault: false,
  });

  await Task.insertMany([
    {
      companyId,
      taskListId: list._id,
      templateId: null,
      name: "Fridge",
      icon: "🧊",
      taskType: "form",
      projectedMinutes: 2,
      order: 0,
      isActive: true,
      formFields: [
        { key: "temperature", label: "Fridge temperature", type: "number", unit: "°F", min: 33, max: 40 },
      ],
    },
    {
      companyId,
      taskListId: list._id,
      templateId: null,
      name: "Freezer",
      icon: "❄️",
      taskType: "form",
      projectedMinutes: 2,
      order: 1,
      isActive: true,
      formFields: [
        { key: "temperature", label: "Freezer temperature", type: "number", unit: "°F", max: 0 },
      ],
    },
    {
      companyId,
      taskListId: list._id,
      templateId: null,
      name: "Men's Room",
      icon: "🚹",
      taskType: "form",
      projectedMinutes: 3,
      order: 2,
      isActive: true,
      formFields: [
        { key: "clean", label: "Clean", type: "boolean" },
        { key: "stocked", label: "Stocked (soap, paper towels, TP)", type: "boolean" },
      ],
    },
    {
      companyId,
      taskListId: list._id,
      templateId: null,
      name: "Women's Room",
      icon: "🚺",
      taskType: "form",
      projectedMinutes: 3,
      order: 3,
      isActive: true,
      formFields: [
        { key: "clean", label: "Clean", type: "boolean" },
        { key: "stocked", label: "Stocked (soap, paper towels, TP)", type: "boolean" },
      ],
    },
  ]);
}
