import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { resolveSessionUser, isOwner } from "@/lib/session";
import { listActiveLocations } from "@/lib/locations";
import { getDates } from "@/lib/report-dates";
import { getLocationTaskCounts, getBelowParCountForLocation } from "@/lib/reports";
import MissedListAlert from "@/models/MissedListAlert";
import User from "@/models/User";

export const dynamic = "force-dynamic";

// GET /api/reports/rollup — owner-only cross-location snapshot backing the
// Admin Console's Rollup Dashboard (see docs/features/admin-console.md's
// Phase 2). A manager/employee only ever has one location, so this view
// has no meaning for them — 403, not an empty/single-row result.
export async function GET(req: NextRequest) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { companyId, role } = sessionUser;
  if (!companyId) return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  if (!isOwner(role)) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const days = Math.min(30, Math.max(7, parseInt(searchParams.get("days") ?? "7")));
  // Client must send its local date so date windows match stored local-date
  // strings — same convention as GET /api/reports.
  const localDate = searchParams.get("localDate") ?? new Date().toISOString().split("T")[0];
  const dates = getDates(days, localDate);

  await connectDB();

  const activeLocations = await listActiveLocations(companyId);

  const perLocation = await Promise.all(
    activeLocations.map(async (loc) => {
      const locationId = (loc._id as { toString(): string }).toString();
      const [counts, missedTaskListCount, belowParItemCount, activeEmployeeCount] = await Promise.all([
        getLocationTaskCounts(companyId, locationId, dates),
        MissedListAlert.countDocuments({ companyId, locationId, date: { $in: dates } }),
        getBelowParCountForLocation(companyId, locationId),
        User.countDocuments({ companyId, locationId, role: { $ne: null } }),
      ]);
      return {
        locationId,
        locationName: loc.name as string,
        doneCount: counts.doneCount,
        engagedCount: counts.engagedCount,
        totalTasksLogged: counts.totalTasksLogged,
        missedTaskListCount,
        belowParItemCount,
        activeEmployeeCount,
      };
    })
  );

  const companyDoneCount = perLocation.reduce((s, l) => s + l.doneCount, 0);
  const companyEngagedCount = perLocation.reduce((s, l) => s + l.engagedCount, 0);

  const companyTotals = {
    // Summed numerator/denominator across locations, not an average of
    // per-location percentages — a low-volume location otherwise skews the
    // company figure as much as a high-volume one. See lib/reports.ts.
    avgCompletionRate: companyEngagedCount > 0 ? companyDoneCount / companyEngagedCount : 0,
    totalTasksLogged: perLocation.reduce((s, l) => s + l.totalTasksLogged, 0),
    missedTaskListCount: perLocation.reduce((s, l) => s + l.missedTaskListCount, 0),
    belowParItemCount: perLocation.reduce((s, l) => s + l.belowParItemCount, 0),
  };

  return NextResponse.json({
    dates,
    days,
    today: localDate,
    locations: perLocation.map(({ locationId, locationName, engagedCount, doneCount, totalTasksLogged, missedTaskListCount, belowParItemCount, activeEmployeeCount }) => ({
      locationId,
      locationName,
      avgCompletionRate: engagedCount > 0 ? doneCount / engagedCount : 0,
      totalTasksLogged,
      missedTaskListCount,
      belowParItemCount,
      activeEmployeeCount,
    })),
    companyTotals,
  });
}
