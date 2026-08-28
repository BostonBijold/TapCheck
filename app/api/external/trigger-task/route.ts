import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findSessionByApiKey } from "@/lib/api-key";
import { triggerTask } from "@/lib/task-trigger";
import Task from "@/models/Task";
import TaskList from "@/models/TaskList";
import AppIntentLink from "@/models/AppIntentLink";

export const dynamic = "force-dynamic";

// External trigger — same API-key auth as /api/external/start-timer. Called
// directly by a caller who already knows the target task (routineItemId),
// and by the native TriggerHabitIntent App Intent (ios/App/App/AppIntents),
// which resolves the task from a live Shortcuts/Siri picker instead —
// neither caller knows or cares whether this starts or finishes something.
//
// routineItemId/routineGroupId (request field names, kept as-is — see
// docs/api/external-api.md) so any already-configured Shortcut keeps
// working without editing its fields, only its URL.
//
// Thin wrapper: auth + param parsing + ownership checks live here, the
// actual start/complete case dispatch lives in lib/task-trigger.ts. See
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
  const source = readParam(body, req.nextUrl.searchParams, "source");

  let task;
  try {
    task = await Task.findOne({ _id: routineItemId, companyId, isActive: true }).lean();
  } catch {
    return NextResponse.json({ error: "Invalid routineItemId" }, { status: 400 });
  }
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (routineGroupId) {
    let taskList;
    try {
      taskList = await TaskList.findOne({ _id: routineGroupId, companyId }).lean();
    } catch {
      return NextResponse.json({ error: "Invalid routineGroupId" }, { status: 400 });
    }
    if (!taskList) {
      return NextResponse.json({ error: "Task list not found" }, { status: 404 });
    }
    if (task.taskListId.toString() !== routineGroupId) {
      return NextResponse.json({ error: "Task does not belong to that task list" }, { status: 400 });
    }
  }

  const { completed, started } = await triggerTask(companyId, userId, routineItemId, task.taskType, routineGroupId, date);

  // No hook exists for "user configured a Shortcut with this task" — App
  // Intents only tell us when one actually runs. This upsert is that signal,
  // surfaced in Manage Task List as "connected via Shortcut" — see
  // docs/features/app-intents.md. Purely additive bookkeeping, never fails
  // the request.
  if (source === "app_intent") {
    await AppIntentLink.findOneAndUpdate(
      { userId, taskId: routineItemId },
      { lastTriggeredAt: new Date() },
      { upsert: true }
    );
  }

  return NextResponse.json({ ok: true, completed, started });
}
