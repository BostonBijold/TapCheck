import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import RoutineGroup from "@/models/RoutineGroup";
import RoutineItem from "@/models/RoutineItem";
import RoutineLog from "@/models/RoutineLog";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";
// Trailing window the rolling average is computed over — long enough for
// the average to be stable without outlier rejection or a trimmed mean
// (weekly-or-longer aggregation already smooths over one-off anomalies; see
// docs/features/routine-review.md).
const REVIEW_WINDOW_DAYS = 28;

function resolveUserId(sessionId?: string) {
  if (sessionId) return sessionId;
  if (process.env.SKIP_AUTH === "true") return DEV_USER_ID;
  return null;
}

// GET /api/routine-review?groupId=X&localDate=YYYY-MM-DD
// Per-item goal vs rolling-average duration for one routine group, plus the
// group's average start time — the data behind components/RoutineReviewFlow.tsx.
// A sibling to /api/analytics rather than a parameter on it: the review
// window and single-group scope don't share enough shape with the 7/30-day
// multi-group analytics payload to be worth entangling the two.
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const groupId = searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "Missing groupId" }, { status: 400 });

  const localDate = searchParams.get("localDate") ?? new Date().toISOString().split("T")[0];

  await connectDB();

  const group = await RoutineGroup.findOne({ _id: groupId, userId }).lean();
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await RoutineItem.find({ groupId, userId, isActive: true })
    .sort({ order: 1 })
    .lean();

  // Only items with a real time target are relevant to a goal-vs-average
  // review — same "isTimeable" convention RoutineItemRow.tsx uses (checkbox
  // items have no timer, and the special item types carry no goal time of
  // their own to review).
  const timeableItems = items.filter(
    (i) =>
      i.itemType !== "checkbox" &&
      i.itemType !== "virtue_checkin" &&
      i.itemType !== "weekly_review" &&
      i.itemType !== "routine_review"
  );

  const dates = Array.from({ length: REVIEW_WINDOW_DAYS }, (_, i) => {
    const d = new Date(localDate + "T12:00:00");
    d.setDate(d.getDate() - (REVIEW_WINDOW_DAYS - 1 - i));
    return d.toISOString().split("T")[0];
  });

  const logs = await RoutineLog.find({
    userId,
    routineItemId: { $in: timeableItems.map((i) => i._id) },
    date: { $in: dates },
  }).lean();

  const logsByItem: Record<string, typeof logs> = {};
  for (const log of logs) {
    const id = log.routineItemId.toString();
    if (!logsByItem[id]) logsByItem[id] = [];
    logsByItem[id].push(log);
  }

  const itemStats = timeableItems.map((item) => {
    const itemId = item._id.toString();
    const doneLogs = (logsByItem[itemId] ?? []).filter((l) => l.state === "done");
    const avgActualMins =
      doneLogs.length > 0
        ? Math.round(doneLogs.reduce((s, l) => s + (l.actualMinutes ?? item.projectedMinutes), 0) / doneLogs.length)
        : null;
    return {
      _id: itemId,
      name: item.name,
      icon: item.icon,
      order: item.order,
      projectedMinutes: item.projectedMinutes,
      avgActualMins,
    };
  });

  // Typical start time — earliest startedAt per day across this group's
  // items, then averaged. Same math as app/api/analytics/route.ts's
  // groupAvgStart, just scoped to one group over the review window instead
  // of every group over the 7/30-day analytics window.
  const earliestByDay: Record<string, number> = {};
  for (const log of logs) {
    if (!log.startedAt) continue;
    const utcMins = new Date(log.startedAt).getUTCHours() * 60 + new Date(log.startedAt).getUTCMinutes();
    const prev = earliestByDay[log.date];
    if (prev === undefined || utcMins < prev) earliestByDay[log.date] = utcMins;
  }
  const startTimes = Object.values(earliestByDay);
  const avgStartMinutesUtc =
    startTimes.length > 0 ? Math.round(startTimes.reduce((s, t) => s + t, 0) / startTimes.length) : null;

  return NextResponse.json({
    group: { _id: group._id.toString(), name: group.name, startTime: group.startTime ?? null },
    items: itemStats,
    avgStartMinutesUtc,
    startTimeSampleSize: startTimes.length,
  });
}
