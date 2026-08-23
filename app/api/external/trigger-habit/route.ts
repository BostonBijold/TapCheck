import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findUserIdByApiKey } from "@/lib/api-key";
import { toggleRoutineItemLog } from "@/lib/routine-log-actions";
import RoutineItem from "@/models/RoutineItem";
import RoutineGroup from "@/models/RoutineGroup";

export const dynamic = "force-dynamic";

// External trigger — same API-key auth as /api/external/start-timer, meant
// to be fired from a single iPhone Shortcut (NFC tap or manual run) that
// doesn't know or care whether it's starting or finishing something.
//
// Bidirectional: whether this call starts or completes a habit is decided
// entirely by current server state (is there an active timer, does it match
// the tapped item, and is the tapped item already done today), never by a
// param the caller sends. The state-transition decision itself lives in
// lib/routine-log-actions.ts's toggleRoutineItemLog, shared with the
// session-authenticated NFC resolve page (app/(app)/nfc/t/[tagUID]) — see
// docs/api/external-api.md and docs/api/nfc-api.md for the full case
// breakdown.
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

  const { completed, started, alreadyDone } = await toggleRoutineItemLog(
    userId,
    item,
    date,
    routineGroupId
  );

  return NextResponse.json({ ok: true, completed, started, alreadyDone });
}
