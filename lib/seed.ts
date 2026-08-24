import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import HabitTemplate from "@/models/HabitTemplate";
import {
  ensureSystemTemplates,
  DEFAULT_MORNING_NAMES,
  DEFAULT_EVENING_NAMES,
} from "@/lib/seed-templates";

export async function seedDefaultRoutines(userId: string) {
  // Ensure the catalog exists before referencing it
  await ensureSystemTemplates();

  const morning = await RoutineGroup.create({
    userId,
    name: "Morning Routine",
    timeOfDay: "morning",
    startTime: "06:00",
    order: 0,
    isDefault: true,
  });

  // Afternoon is seeded empty — user builds it out over time
  await RoutineGroup.create({
    userId,
    name: "Afternoon Routine",
    timeOfDay: "custom",
    startTime: "12:00",
    order: 1,
    isDefault: true,
  });

  const evening = await RoutineGroup.create({
    userId,
    name: "Evening Routine",
    timeOfDay: "evening",
    startTime: "18:00",
    order: 2,
    isDefault: true,
  });

  // Pull templates from DB by name so order + IDs are correct
  const morningTemplates = await HabitTemplate.find({
    name: { $in: DEFAULT_MORNING_NAMES },
    isSystem: true,
  }).lean();

  const eveningTemplates = await HabitTemplate.find({
    name: { $in: DEFAULT_EVENING_NAMES },
    isSystem: true,
  }).lean();

  // Preserve the canonical order defined in DEFAULT_*_NAMES
  const sortByDefault = (templates: typeof morningTemplates, names: readonly string[]) =>
    [...templates].sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));

  await RoutineItem.insertMany(
    sortByDefault(morningTemplates, DEFAULT_MORNING_NAMES).map((t, i) => ({
      userId,
      groupId: morning._id,
      templateId: t._id,
      name: t.name,
      icon: t.icon,
      projectedMinutes: t.defaultProjectedMinutes,
      order: i,
      isActive: true,
      linkedGoalId: null,
    }))
  );

  await RoutineItem.insertMany(
    sortByDefault(eveningTemplates, DEFAULT_EVENING_NAMES).map((t, i) => ({
      userId,
      groupId: evening._id,
      templateId: t._id,
      name: t.name,
      icon: t.icon,
      projectedMinutes: t.defaultProjectedMinutes,
      order: i,
      isActive: true,
      linkedGoalId: null,
    }))
  );
}

// Idempotent — creates a standalone Habits group (timeOfDay: 'habit') if none exists.
export async function ensureHabitsGroup(userId: string) {
  const existing = await RoutineGroup.findOne({ userId, timeOfDay: "habit" });
  if (existing) return;

  const topGroup = await RoutineGroup.findOne({ userId }).sort({ order: -1 }).lean();
  const nextOrder = topGroup ? topGroup.order + 1 : 10;

  await RoutineGroup.create({
    userId,
    name: "Habits",
    timeOfDay: "habit",
    startTime: null,
    order: nextOrder,
    isDefault: false,
  });
}

// Idempotent — adds Virtue Check-in + Weekly Review items to evening routine.
export async function ensureVirtueCheckInItems(userId: string) {
  const alreadyDone = await RoutineItem.findOne({ userId, itemType: { $in: ["virtue_checkin", "weekly_review"] } }).lean();
  if (alreadyDone) return;

  const eveningGroup = await RoutineGroup.findOne({ userId, timeOfDay: "evening" }).lean();
  if (!eveningGroup) return;

  const lastItem = await RoutineItem.findOne({ groupId: eveningGroup._id, userId })
    .sort({ order: -1 }).lean();
  const nextOrder = lastItem ? lastItem.order + 1 : 0;

  await RoutineItem.insertMany([
    {
      userId,
      groupId: eveningGroup._id,
      templateId: null,
      name: "Virtue Check-in",
      icon: "compass",
      projectedMinutes: 5,
      order: nextOrder,
      isActive: true,
      itemType: "virtue_checkin",
      linkedGoalId: null,
    },
    {
      userId,
      groupId: eveningGroup._id,
      templateId: null,
      name: "Weekly Review",
      icon: "shield",
      projectedMinutes: 10,
      order: nextOrder + 1,
      isActive: true,
      itemType: "weekly_review",
      linkedGoalId: null,
    },
  ]);
}

// Idempotent — adds the Routine Review item to the evening routine. Kept
// separate from ensureVirtueCheckInItems (rather than folded into it) since
// this item type shipped later and the two are independently toggleable.
export async function ensureRoutineReviewItem(userId: string) {
  const alreadyDone = await RoutineItem.findOne({ userId, itemType: "routine_review" }).lean();
  if (alreadyDone) return;

  const eveningGroup = await RoutineGroup.findOne({ userId, timeOfDay: "evening" }).lean();
  if (!eveningGroup) return;

  const lastItem = await RoutineItem.findOne({ groupId: eveningGroup._id, userId })
    .sort({ order: -1 }).lean();
  const nextOrder = lastItem ? lastItem.order + 1 : 0;

  await RoutineItem.create({
    userId,
    groupId: eveningGroup._id,
    templateId: null,
    name: "Routine Review",
    icon: "list-checks",
    projectedMinutes: 10,
    order: nextOrder,
    isActive: true,
    itemType: "routine_review",
    linkedGoalId: null,
  });
}

// Idempotent — adds Afternoon Routine for users seeded before it existed.
// Slots it between morning (order 0) and evening, shifting evening up if needed.
export async function ensureAfternoonGroup(userId: string) {
  const existing = await RoutineGroup.findOne({ userId, name: "Afternoon Routine" });
  if (existing) return;

  const evening = await RoutineGroup.findOne({ userId, timeOfDay: "evening" });
  const afternoonOrder = evening ? evening.order : 1;

  // Shift evening (and anything else at or above that order) up by 1
  await RoutineGroup.updateMany(
    { userId, order: { $gte: afternoonOrder } },
    { $inc: { order: 1 } }
  );

  await RoutineGroup.create({
    userId,
    name: "Afternoon Routine",
    timeOfDay: "custom",
    startTime: "12:00",
    order: afternoonOrder,
    isDefault: true,
  });
}
