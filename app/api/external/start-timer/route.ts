import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findSessionByApiKey } from "@/lib/api-key";
import { startInProgressLog, serializeLog } from "@/lib/task-log-actions";
import Task from "@/models/Task";
import TaskList from "@/models/TaskList";

export const dynamic = "force-dynamic";

// External trigger — authenticated by API key (header, query param, or JSON
// body — not a browser session), meant to be called from an iPhone Shortcut
// fired by an NFC tag tap. Deliberately separate from the internal
// /api/task-logs endpoints, which are session-authenticated and shaped for
// the app's own client, not for a third-party caller.
//
// routineItemId/routineGroupId (request field names, kept as-is — see
// docs/api/external-api.md) map onto this app's Task/TaskList vocabulary
// internally, but the external contract itself is unchanged so any
// already-configured Shortcut keeps working without editing its fields,
// only its URL (see CLAUDE.md's Vocabulary note).
//
// routineItemId (required) starts that task's timer exactly like the
// standalone in-app "Start Timer" action — same single-active-timer
// enforcement, via the same startInProgressLog helper.
//
// routineGroupId (optional) additionally anchors the timer inside a Task
// List Session for that list: opening the app lands the user in the
// session view at this task, mid-timer, instead of the plain Tasks home.
// See TaskLog.sessionTaskListId and TasksView's openInProgressTimer.
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

  const log = await startInProgressLog(companyId, userId, routineItemId, date, routineGroupId);
  return NextResponse.json({ ok: true, log: serializeLog(log) });
}
