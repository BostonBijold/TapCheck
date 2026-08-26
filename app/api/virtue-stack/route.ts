import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import VirtueModel from "@/models/Virtue";
import { resolveSelectedPhilosophyId, resolveVirtueStackStartWeek } from "@/lib/philosophy";
import { currentVirtueOrder, personalWeeksActive, personalStackSize } from "@/lib/virtue-dates";

export const dynamic = "force-dynamic";
const DEV_USER_ID = "dev-local-user";

function resolveUserId(id?: string | null) {
  return id ?? (process.env.SKIP_AUTH === "true" ? DEV_USER_ID : null);
}

// GET /api/virtue-stack — how many virtues belong in the caller's own daily
// check-in right now (progressive stacking, see lib/virtue-dates.ts). Never
// affects the shared "this week's virtue" highlight, which stays identical
// for every user regardless of this value.
export async function GET() {
  const session = await auth();
  const userId = resolveUserId(session?.user?.id);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const philosophyId = await resolveSelectedPhilosophyId(userId);
  if (!philosophyId) return NextResponse.json({ stackSize: null });

  const virtueCount = await VirtueModel.countDocuments({ philosophyId, isActive: true });
  const currentOrder = currentVirtueOrder(new Date(), virtueCount);
  const startWeek = await resolveVirtueStackStartWeek(userId);
  const weeksActive = personalWeeksActive(startWeek);
  const stackSize = personalStackSize(weeksActive, virtueCount);

  return NextResponse.json({ stackSize, weeksActive, virtueCount, currentOrder });
}
