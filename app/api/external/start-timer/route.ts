import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findSessionByApiKey } from "@/lib/api-key";
import { startInProgressLog, serializeLog } from "@/lib/routine-log-actions";
import RoutineItem from "@/models/RoutineItem";
import RoutineGroup from "@/models/RoutineGroup";

export const dynamic = "force-dynamic";

// External trigger — authenticated by API key (header, query param, or JSON
// body — not a browser session), meant to be called from an iPhone Shortcut
// fired by an NFC tag tap. Deliberately separate from the internal
// /api/routine-logs endpoints, which are session-authenticated and shaped
// for the app's own client, not for a third-party caller.
//
// routineItemId (required) starts that item's timer exactly like the
// standalone in-app "Start Timer" action — same single-active-timer
// enforcement, via the same startInProgressLog helper.
//
// routineGroupId (optional) additionally anchors the timer inside a Routine
// Session for that group: opening the app lands the user in the session
// view at this item, mid-timer, instead of the plain Routines home. See
// RoutineLog.sessionGroupId and RoutinesView's openInProgressTimer.
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

  const apiSession = await findSessionByApiKey(apiKey);
  if (!apiSession) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  const { userId, companyId } = apiSession;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const routineItemId = readParam(body, req.nextUrl.searchParams, "routineItemId");
  if (!routineItemId) {
    return NextResponse.json({ error: "Missing routineItemId" }, { status: 400 });
  }
  const routineGroupId = readParam(body, req.nextUrl.searchParams, "routineGroupId");
  const date = readParam(body, req.nextUrl.searchParams, "date") || todayString();

  let item;
  try {
    item = await RoutineItem.findOne({ _id: routineItemId, companyId, isActive: true }).lean();
  } catch {
    return NextResponse.json({ error: "Invalid routineItemId" }, { status: 400 });
  }
  if (!item) {
    return NextResponse.json({ error: "Routine item not found" }, { status: 404 });
  }

  if (routineGroupId) {
    let group;
    try {
      group = await RoutineGroup.findOne({ _id: routineGroupId, companyId }).lean();
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

  const log = await startInProgressLog(companyId, userId, routineItemId, date, routineGroupId);
  return NextResponse.json({ ok: true, log: serializeLog(log) });
}
