import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import RoutineLog from "@/models/RoutineLog";
import Todo, { serializeTodo, todosForDateQuery } from "@/models/Todo";
import { seedDefaultRoutines, ensureHabitsGroup } from "@/lib/seed";
import { calendarWeekDates } from "@/lib/week-dates";
import RoutinesView from "@/components/RoutinesView";
import type { LogState } from "@/models/RoutineLog";
import { resolveSessionUser } from "@/lib/session";
import NoCompanyMessage from "@/components/NoCompanyMessage";

export const dynamic = "force-dynamic";

export default async function RoutinesPage({
  searchParams,
}: {
  searchParams?: { startNext?: string; addHabit?: string; date?: string; resumeTimer?: string };
}) {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();

  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) redirect("/login");
  const { companyId, userId } = sessionUser;

  const userName = session?.user?.name ?? "Developer";

  if (!companyId) {
    return <NoCompanyMessage userName={userName} />;
  }

  await connectDB();

  // First-time seeds — per company, not per user: the first employee or
  // manager of a newly-attached company to load this page seeds its default
  // shift groups.
  const groupCount = await RoutineGroup.countDocuments({ companyId });
  if (groupCount === 0) await seedDefaultRoutines(companyId);
  await ensureHabitsGroup(companyId);

  // Always trust the client-supplied date (local timezone).
  // Never fall back to server UTC — the server doesn't know the user's timezone.
  // The client-side useEffect in RoutinesView will redirect with ?date= on first load.
  const today = searchParams?.date ?? new Date().toISOString().split("T")[0];
  const weekDates = calendarWeekDates(today);

  const groups = await RoutineGroup.find({ companyId }).sort({ order: 1 }).lean();

  // Single query for every group's items instead of one query per group —
  // the result is already sorted by order, so grouping it in memory below
  // preserves each group's item order exactly as the old per-group query did.
  const allItems = await RoutineItem.find({
    groupId: { $in: groups.map((g) => g._id) },
    companyId,
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
        // Existing documents predate these fields — Mongoose defaults only
        // apply on create, so a .lean() read can come back undefined.
        scheduledDays: item.scheduledDays ?? [0, 1, 2, 3, 4, 5, 6],
        successThreshold: item.successThreshold ?? (item.scheduledDays?.length ?? 7),
        formFields: item.formFields ?? [],
      })),
    };
  });

  // Today's logs for initial state — company-wide, since any employee's
  // completion of a shared check should show up for everyone.
  const todayLogs = await RoutineLog.find({ companyId, date: today }).lean();
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
    companyId,
    date: { $in: weekDates },
  }).lean();

  const weekLogs = rawWeekLogs.map((l) => ({
    routineItemId: l.routineItemId.toString(),
    date: l.date,
    state: l.state as "done" | "missed" | "rest",
    actualMinutes: l.actualMinutes ?? null,
  }));

  // Today's standalone to-dos, plus any earlier undone ones carried forward as overdue
  const todayTodos = await Todo.find(todosForDateQuery(companyId, userId, today))
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
      autoStartNext={!!searchParams?.startNext}
      autoAddHabit={!!searchParams?.addHabit}
      autoResumeTimer={!!searchParams?.resumeTimer}
    />
  );
}
