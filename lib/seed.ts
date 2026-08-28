import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import HabitTemplate from "@/models/HabitTemplate";
import {
  ensureSystemTemplates,
  DEFAULT_OPENING_NAMES,
  DEFAULT_MIDSHIFT_NAMES,
  DEFAULT_CLOSING_NAMES,
} from "@/lib/seed-templates";

export async function seedDefaultRoutines(companyId: string) {
  // Ensure the catalog exists before referencing it
  await ensureSystemTemplates();

  const opening = await RoutineGroup.create({
    companyId,
    name: "Opening Shift",
    timeOfDay: "morning",
    startTime: "08:00",
    order: 0,
    isDefault: true,
  });

  const midShift = await RoutineGroup.create({
    companyId,
    name: "Mid-Shift",
    timeOfDay: "custom",
    startTime: "13:00",
    order: 1,
    isDefault: true,
  });

  const closing = await RoutineGroup.create({
    companyId,
    name: "Closing Shift",
    timeOfDay: "evening",
    startTime: "21:00",
    order: 2,
    isDefault: true,
  });

  // Pull templates from DB by name so order + IDs are correct
  const [openingTemplates, midShiftTemplates, closingTemplates] = await Promise.all([
    HabitTemplate.find({ name: { $in: DEFAULT_OPENING_NAMES }, isSystem: true }).lean(),
    HabitTemplate.find({ name: { $in: DEFAULT_MIDSHIFT_NAMES }, isSystem: true }).lean(),
    HabitTemplate.find({ name: { $in: DEFAULT_CLOSING_NAMES }, isSystem: true }).lean(),
  ]);

  // Preserve the canonical order defined in DEFAULT_*_NAMES
  const sortByDefault = (templates: typeof openingTemplates, names: readonly string[]) =>
    [...templates].sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));

  const insertForGroup = (
    groupId: typeof opening._id,
    templates: typeof openingTemplates,
    names: readonly string[]
  ) =>
    RoutineItem.insertMany(
      sortByDefault(templates, names).map((t, i) => ({
        companyId,
        groupId,
        templateId: t._id,
        name: t.name,
        icon: t.icon,
        itemType: "form_check",
        projectedMinutes: t.defaultProjectedMinutes,
        formFields: t.formFields ?? [],
        order: i,
        isActive: true,
      }))
    );

  await Promise.all([
    insertForGroup(opening._id, openingTemplates, DEFAULT_OPENING_NAMES),
    insertForGroup(midShift._id, midShiftTemplates, DEFAULT_MIDSHIFT_NAMES),
    insertForGroup(closing._id, closingTemplates, DEFAULT_CLOSING_NAMES),
  ]);
}

// Idempotent — creates a standalone "Facility Checks" group (timeOfDay:
// 'habit' — same standalone-group mechanics as any user-created habit group,
// just seeded with example form_check items) if none exists. These are
// anytime/recurring checks (fridge/freezer temps, restroom checklists) that
// don't belong to a single shift window.
export async function ensureHabitsGroup(companyId: string) {
  const existing = await RoutineGroup.findOne({ companyId, timeOfDay: "habit" });
  if (existing) return;

  const topGroup = await RoutineGroup.findOne({ companyId }).sort({ order: -1 }).lean();
  const nextOrder = topGroup ? topGroup.order + 1 : 10;

  const group = await RoutineGroup.create({
    companyId,
    name: "Facility Checks",
    timeOfDay: "habit",
    startTime: null,
    order: nextOrder,
    isDefault: false,
  });

  await RoutineItem.insertMany([
    {
      companyId,
      groupId: group._id,
      templateId: null,
      name: "Fridge",
      icon: "🧊",
      itemType: "form_check",
      projectedMinutes: 2,
      order: 0,
      isActive: true,
      formFields: [
        { key: "temperature", label: "Fridge temperature", type: "number", unit: "°F", min: 33, max: 40 },
      ],
    },
    {
      companyId,
      groupId: group._id,
      templateId: null,
      name: "Freezer",
      icon: "❄️",
      itemType: "form_check",
      projectedMinutes: 2,
      order: 1,
      isActive: true,
      formFields: [
        { key: "temperature", label: "Freezer temperature", type: "number", unit: "°F", max: 0 },
      ],
    },
    {
      companyId,
      groupId: group._id,
      templateId: null,
      name: "Men's Room",
      icon: "🚹",
      itemType: "form_check",
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
      groupId: group._id,
      templateId: null,
      name: "Women's Room",
      icon: "🚺",
      itemType: "form_check",
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
