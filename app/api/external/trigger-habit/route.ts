import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findUserIdByApiKey } from "@/lib/api-key";
import { triggerHabit } from "@/lib/habit-trigger";
import RoutineItem from "@/models/RoutineItem";
import RoutineGroup from "@/models/RoutineGroup";
import AppIntentLink from "@/models/AppIntentLink";

export const dynamic = "force-dynamic";

// External trigger — same API-key auth as /api/external/start-timer. Called
// directly by a caller who already knows the target routineItemId, and by
// the native TriggerHabitIntent App Intent (ios/App/App/AppIntents), which
// resolves the habit from a live Shortcuts/Siri picker instead — neither
// caller knows or cares whether this starts or finishes something.
//
// Thin wrapper: auth + param parsing + ownership checks live here, the
// actual start/complete case dispatch lives in lib/habit-trigger.ts. See
// docs/api/external-api.md for the full case breakdown.
function todayString() {
  return new Date().toISOString().split("T")[0];
}

function readParam(
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
  key: string
): string | null {
  const fromBody = body[key];
  if (typeof fromBody === "string" && fromBody) return fromBody;
  return searchParams.get(key);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // No/invalid JSON body — fine, fall back to query params below.
  }

  const apiKey =
    req.headers.get("x-api-key") || readParam(body, req.nextUrl.searchParams, "apiKey");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  await connectDB();

  const userId = await findUserIdByApiKey(apiKey);
  if (!userId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const routineItemId = readParam(body, req.nextUrl.searchParams, "routineItemId");
  if (!routineItemId) {
    return NextResponse.json({ error: "Missing routineItemId" }, { status: 400 });
  }
  const routineGroupId = readParam(body, req.nextUrl.searchParams, "routineGroupId");
  const date = readParam(body, req.nextUrl.searchParams, "date") || todayString();
  const source = readParam(body, req.nextUrl.searchParams, "source");

  let item;
  try {
    item = await RoutineItem.findOne({ _id: routineItemId, userId, isActive: true }).lean();
  } catch {
    return NextResponse.json({ error: "Invalid routineItemId" }, { status: 400 });
  }
  if (!item) {
    return NextResponse.json({ error: "Routine item not found" }, { status: 404 });
  }

  if (routineGroupId) {
    let group;
    try {
      group = await RoutineGroup.findOne({ _id: routineGroupId, userId }).lean();
    } catch {
      return NextResponse.json({ error: "Invalid routineGroupId" }, { status: 400 });
    }
    if (!group) {
      return NextResponse.json({ error: "Routine group not found" }, { status: 404 });
    }
    if (item.groupId.toString() !== routineGroupId) {
      return NextResponse.json({ error: "Item does not belong to that group" }, { status: 400 });
    }
  }

  const { completed, started } = await triggerHabit(userId, routineItemId, item.itemType, routineGroupId, date);

  // No hook exists for "user configured a Shortcut with this habit" — App
  // Intents only tell us when one actually runs. This upsert is that signal,
  // surfaced in Manage Habit as "connected via Shortcut" — see
  // docs/features/app-intents.md. Purely additive bookkeeping, never fails
  // the request.
  if (source === "app_intent") {
    await AppIntentLink.findOneAndUpdate(
      { userId, routineItemId },
      { lastTriggeredAt: new Date() },
      { upsert: true }
    );
  }

  return NextResponse.json({ ok: true, completed, started });
}
