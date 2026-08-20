import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import VirtueCheckIn from "@/models/VirtueCheckIn";
import VirtueModel from "@/models/Virtue";
import { weekStartDate } from "@/lib/seed-virtues";
import { resolveSelectedPhilosophyId } from "@/lib/philosophy";

export const dynamic = "force-dynamic";

const DEV_USER_ID = "dev-local-user";

function resolveUserId(id?: string) {
  return id ?? (process.env.SKIP_AUTH === "true" ? DEV_USER_ID : null);
}

// anchorDate: the client's local today (YYYY-MM-DD). Never use server UTC here.
function getDates(days: number, anchorDate: string): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(anchorDate + "T12:00:00");
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().split("T")[0];
  });
}

// GET /api/virtue-checkins
// ?date=YYYY-MM-DD        → single check-in for that date
// ?weekStart=YYYY-MM-DD   → all check-ins for that week
// ?days=7|30              → rolling window, per-virtue daily dots + effectiveness %
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);

  const date = searchParams.get("date");
  const weekStart = searchParams.get("weekStart");
  const daysParam = searchParams.get("days");

  // Every mode is scoped to the caller's currently-selected philosophy, so
  // switching philosophies never mixes one philosophy's history into
  // another's summary. Resolved server-side, never a client-sent param.
  const philosophyId = await resolveSelectedPhilosophyId(userId);
  if (!philosophyId) {
    // No philosophy selected — nothing to report yet.
    if (date) return NextResponse.json(null);
    if (weekStart) return NextResponse.json([]);
    if (daysParam) {
      const days = Math.min(30, Math.max(7, parseInt(daysParam) || 7));
      const localDate = searchParams.get("localDate") ?? new Date().toISOString().split("T")[0];
      return NextResponse.json({
        days, dates: getDates(days, localDate), checkInDays: 0, overallPct: 0,
        strongest: null, needsWork: null, virtues: [],
      });
    }
    return NextResponse.json({ error: "Missing query param" }, { status: 400 });
  }

  if (date) {
    const doc = await VirtueCheckIn.findOne({ userId, date, philosophyId }).lean();
    return NextResponse.json(doc ?? null);
  }

  if (weekStart) {
    const docs = await VirtueCheckIn.find({ userId, weekStartDate: weekStart, philosophyId })
      .sort({ date: 1 })
      .lean();
    return NextResponse.json(docs);
  }

  if (daysParam) {
    const days = Math.min(30, Math.max(7, parseInt(daysParam) || 7));
    // localDate must be supplied by the client (browser knows the user's local date; server only knows UTC)
    const localDate = searchParams.get("localDate") ?? new Date().toISOString().split("T")[0];
    const dates = getDates(days, localDate);

    const docs = await VirtueCheckIn.find({ userId, date: { $in: dates }, philosophyId }).lean();
    const byDate: Record<string, (typeof docs)[0]> = {};
    for (const d of docs) byDate[d.date] = d;

    const virtues = await VirtueModel.find({ philosophyId, isActive: true }).sort({ order: 1 }).lean();

    const virtueRows = virtues.map((v) => {
      const vId = v._id.toString();
      let yes = 0;
      let total = 0;
      const dots = dates.map((date) => {
        const ci = byDate[date];
        if (!ci) return null;
        const ans = ci.answers.find((a: { virtueId: { toString(): string } }) => a.virtueId.toString() === vId);
        if (!ans) return null;
        total++;
        if (ans.answer === "yes") yes++;
        return ans.answer;
      });
      const pct = total > 0 ? Math.round((yes / total) * 100) : 0;
      return { virtueId: vId, virtueName: v.name, slug: v.slug, order: v.order, dots, yes, total, pct };
    });

    const sorted = [...virtueRows].filter((v) => v.total > 0).sort((a, b) => b.pct - a.pct);
    const overallPct = sorted.length > 0
      ? Math.round(sorted.reduce((s, v) => s + v.pct, 0) / sorted.length)
      : 0;

    return NextResponse.json({
      days,
      dates,
      checkInDays: docs.length,
      overallPct,
      strongest: sorted[0] ? { virtueId: sorted[0].virtueId, virtueName: sorted[0].virtueName, pct: sorted[0].pct } : null,
      needsWork: sorted.length > 1 ? { virtueId: sorted[sorted.length - 1].virtueId, virtueName: sorted[sorted.length - 1].virtueName, pct: sorted[sorted.length - 1].pct } : null,
      virtues: virtueRows,
    });
  }

  return NextResponse.json({ error: "Missing query param" }, { status: 400 });
}

// POST /api/virtue-checkins
// Body: { date, answers: [{ virtueId, virtueName, answer }] }
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    date: string;
    answers: Array<{ virtueId: string; virtueName: string; answer: "yes" | "no" }>;
  };

  // Validate date — only today or yesterday in the user's local timezone.
  // The server is UTC; the client sends the local YYYY-MM-DD.
  // Accept any date within 2 calendar days of UTC now — this covers every timezone
  // on earth (max offset ±14 h) without requiring the server to know the user's tz.
  const nowUtc = Date.now();
  const submittedMs = new Date(body.date + "T12:00:00Z").getTime();
  const diffDays = (nowUtc - submittedMs) / 86400000;
  if (diffDays < -1 || diffDays > 2) {
    return NextResponse.json(
      { error: "You can only check in for today or yesterday." },
      { status: 400 }
    );
  }

  await connectDB();

  // Defense-in-depth — the UI shouldn't be able to reach this state (the
  // marketplace replaces the check-in flow until a philosophy is picked),
  // but the route shouldn't trust that.
  const philosophyId = await resolveSelectedPhilosophyId(userId);
  if (!philosophyId) {
    return NextResponse.json({ error: "No philosophy selected" }, { status: 400 });
  }

  const ws = weekStartDate(new Date(body.date + "T12:00:00"));

  const doc = await VirtueCheckIn.findOneAndUpdate(
    { userId, date: body.date },
    {
      $set: {
        weekStartDate: ws,
        philosophyId,
        answers: body.answers,
      },
    },
    { upsert: true, returnDocument: "after" }
  ).lean();

  return NextResponse.json(doc);
}
