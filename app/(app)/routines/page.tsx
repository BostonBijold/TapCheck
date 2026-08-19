import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import RoutineLog from "@/models/RoutineLog";
import Todo, { serializeTodo, todosForDateQuery } from "@/models/Todo";
import VirtueModel from "@/models/Virtue";
import { seedDefaultRoutines, ensureAfternoonGroup, ensureHabitsGroup, ensureVirtueCheckInItems } from "@/lib/seed";
import { currentVirtueOrder } from "@/lib/seed-virtues";
import RoutinesView from "@/components/RoutinesView";
import type { LogState } from "@/models/RoutineLog";

const ADMIN_EMAIL = "bostonrbijold@gmail.com";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

function getWeekDates(anchorDate: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    // Parse anchor as a local noon to avoid DST edge cases
    const d = new Date(anchorDate + "T12:00:00");
    d.setDate(d.getDate() - (6 - i)); // oldest → newest, anchor last
    return d.toISOString().split("T")[0];
  });
}

export default async function RoutinesPage({
  searchParams,
}: {
  searchParams?: { startNext?: string; addHabit?: string; date?: string; resumeTimer?: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();

  if (!skipAuth && !session?.user?.id) redirect("/login");

  const userId = session?.user?.id ?? (skipAuth ? DEV_USER_ID : null);
  if (!userId) redirect("/login");

  const userName = session?.user?.name ?? "Developer";

  await connectDB();

  // First-time seeds
  const groupCount = await RoutineGroup.countDocuments({ userId });
  if (groupCount === 0) await seedDefaultRoutines(userId);
  else await ensureAfternoonGroup(userId); // backfill for existing users
  await ensureHabitsGroup(userId);
  await ensureVirtueCheckInItems(userId);

  // Backfill startTime for groups created before this field existed
  await RoutineGroup.updateOne(
    { userId, timeOfDay: "morning", startTime: { $in: [null, undefined] } },
    { $set: { startTime: "06:00" } }
  );
  await RoutineGroup.updateOne(
    { userId, timeOfDay: "evening", startTime: { $in: [null, undefined] } },
    { $set: { startTime: "18:00" } }
  );
  await RoutineGroup.updateOne(
    { userId, name: "Afternoon Routine", startTime: { $in: [null, undefined] } },
    { $set: { startTime: "12:00" } }
  );

  // Current virtue
  const virtueOrder = currentVirtueOrder(new Date());
  const virtueDoc = await VirtueModel.findOne({ order: virtueOrder, isActive: true }).lean();
  const currentVirtue = virtueDoc
    ? {
        _id: virtueDoc._id.toString(),
        name: virtueDoc.name,
        slug: virtueDoc.slug,
        tagline: virtueDoc.tagline,
        displayName: virtueDoc.displayName,
        order: virtueDoc.order,
        essay: virtueDoc.essay ?? "",
        etymology: virtueDoc.etymology ?? "",
      }
    : null;

  const isAdmin = skipAuth || session?.user?.email === ADMIN_EMAIL;

  // Always trust the client-supplied date (local timezone).
  // Never fall back to server UTC — the server doesn't know the user's timezone.
  // The client-side useEffect in RoutinesView will redirect with ?date= on first load.
  const today = searchParams?.date ?? new Date().toISOString().split("T")[0];
  const weekDates = getWeekDates(today);

  const groups = await RoutineGroup.find({ userId }).sort({ order: 1 }).lean();

  // Single query for every group's items instead of one query per group —
  // the result is already sorted by order, so grouping it in memory below
  // preserves each group's item order exactly as the old per-group query did.
  const allItems = await RoutineItem.find({
    groupId: { $in: groups.map((g) => g._id) },
    userId,
    isActive: true,
  })
    .sort({ order: 1 })
    .lean();

  const itemsByGroupId = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const key = item.groupId.toString();
    const list = itemsByGroupId.get(key);
    if (list) list.push(item);
    else itemsByGroupId.set(key, [item]);
  }

  const groupsWithItems = groups.map((group) => {
    const items = itemsByGroupId.get(group._id.toString()) ?? [];
    return {
      _id: group._id.toString(),
      name: group.name,
      timeOfDay: group.timeOfDay as "morning" | "evening" | "custom" | "habit",
      startTime: group.startTime ?? null,
      order: group.order,
      items: items.map((item) => ({
        _id: item._id.toString(),
        name: item.name,
        icon: item.icon,
        projectedMinutes: item.projectedMinutes,
        order: item.order,
        itemType: item.itemType,
      })),
    };
  });

  // Today's logs for initial state
  const todayLogs = await RoutineLog.find({ userId, date: today }).lean();
  const initialLogs = todayLogs.map((l) => ({
    _id: l._id.toString(),
    routineItemId: l.routineItemId.toString(),
    date: l.date,
    actualMinutes: l.actualMinutes ?? undefined,
    startedAt: l.startedAt ? (l.startedAt as Date).toISOString() : undefined,
    completedAt: l.completedAt ? (l.completedAt as Date).toISOString() : undefined,
    pausedSeconds: l.pausedSeconds ?? 0,
    state: l.state as LogState,
  }));

  // 7-day streak logs
  const rawWeekLogs = await RoutineLog.find({
    userId,
    date: { $in: weekDates },
  }).lean();

  const weekLogs = rawWeekLogs.map((l) => ({
    routineItemId: l.routineItemId.toString(),
    date: l.date,
    state: l.state as "done" | "missed" | "rest",
  }));

  // Today's standalone to-dos, plus any earlier undone ones carried forward as overdue
  const todayTodos = await Todo.find(todosForDateQuery(userId, today))
    .sort({ scheduledDate: 1, order: 1, createdAt: 1 })
    .lean();
  const initialTodos = todayTodos.map(serializeTodo);

  return (
    <RoutinesView
      groups={groupsWithItems}
      initialLogs={initialLogs}
      initialTodos={initialTodos}
      weekLogs={weekLogs}
      weekDates={weekDates}
      today={today}
      userName={userName}
      skipAuth={skipAuth}
      currentVirtue={currentVirtue}
      isAdmin={isAdmin}
      autoStartNext={!!searchParams?.startNext}
      autoAddHabit={!!searchParams?.addHabit}
      autoResumeTimer={!!searchParams?.resumeTimer}
    />
  );
}
