import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findSessionByApiKey } from "@/lib/api-key";
import { completeActiveHabit } from "@/lib/habit-trigger";

export const dynamic = "force-dynamic";

// Same API-key auth as trigger-habit/start-timer, but takes no
// routineItemId — completes whichever log is currently in_progress for
// this user (server-authoritative, via the single-active-timer invariant)
// and auto-advances its Routine Session if it's anchored to one. Built for
// the Live Activity's "Done" button (CompleteHabitFromActivityIntent.swift)
// specifically because it can't reliably identify which habit is current
// on its own from the widget extension process — see
// docs/features/live-activity.md.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // No/invalid JSON body — fine, fall back to header/query below.
  }

  const apiKey =
    req.headers.get("x-api-key") ||
    (typeof body.apiKey === "string" ? body.apiKey : null) ||
    req.nextUrl.searchParams.get("apiKey");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  await connectDB();

  const apiSession = await findSessionByApiKey(apiKey);
  if (!apiSession) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  const { userId, companyId } = apiSession;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { completed, started } = await completeActiveHabit(companyId, userId);

  return NextResponse.json({ ok: true, completed, started });
}
