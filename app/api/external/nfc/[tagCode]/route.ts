import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { findSessionByApiKey } from "@/lib/api-key";
import { triggerTask } from "@/lib/task-trigger";
import { resolveTask } from "@/lib/task-definitions";
import { NfcTagRequiredError } from "@/lib/task-log-actions";
import NfcTag from "@/models/NfcTag";
import PendingNfcLink from "@/models/PendingNfcLink";
import Task from "@/models/Task";

export const dynamic = "force-dynamic";

// Second entry point into triggerTask() (lib/task-trigger.ts), alongside
// POST /api/external/trigger-task. Built for a single generic iPhone
// Shortcut, built once per physical tag and paired with an NFC Automation,
// so a tap fires this silently — no OS confirmation card, no app-open
// requirement, works with the phone locked. See docs/features/nfc.md's
// "Setting up silent tap triggers" and docs/api/external-api.md for the
// full picture.
//
// Unlike trigger-task (caller supplies taskId directly), this resolves
// tagCode -> taskId server-side at tap time, mirroring
// app/nfc/[tagCode]/page.tsx's own NfcTag lookup so relinking a tag to a
// different task in-app needs zero changes on the Shortcuts side.
const PENDING_LINK_MAX_AGE_MS = 5 * 60 * 1000;

function todayString() {
  return new Date().toISOString().split("T")[0];
}

export async function GET(
  req: NextRequest,
  { params }: { params: { tagCode: string } }
) {
  const { tagCode } = params;

  // GET from Shortcuts' "Get Contents of URL" carries no body — apiKey only
  // ever arrives via header or query string, unlike the POST siblings.
  const apiKey = req.headers.get("x-api-key") || req.nextUrl.searchParams.get("apiKey");
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

  // Not .lean() — the unclaimed-tag auto-claim branch below needs tag.save().
  const tag = await NfcTag.findOne({ tagCode });

  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  // Claimed by a different company — same generic response as "not found",
  // never reveal a tag's existence/ownership. Matches app/nfc/[tagCode]/page.tsx.
  if (tag.companyId && tag.companyId !== companyId) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  let task;

  if (!tag.companyId) {
    // Unclaimed — auto-claim against a fresh PendingNfcLink exactly like the
    // in-app "arm, then tap" flow. No interactive picker is possible over a
    // Shortcut GET call, so a cold unclaimed tap is a dead end here.
    const pending = await PendingNfcLink.findOne({ userId });
    const isFresh = pending && Date.now() - pending.armedAt.getTime() < PENDING_LINK_MAX_AGE_MS;

    const claimedTask = isFresh
      ? await Task.findOne({ _id: pending.taskId, companyId, isActive: true }).lean()
      : null;

    if (!claimedTask) {
      return NextResponse.json(
        { error: "Tag is not linked to a task yet — link it in the app first" },
        { status: 422 }
      );
    }

    tag.companyId = companyId;
    tag.taskId = claimedTask._id;
    tag.taskListId = claimedTask.taskListId;
    tag.claimedByUserId = userId;
    tag.claimedAt = new Date();
    await tag.save();
    await PendingNfcLink.deleteOne({ userId });

    task = claimedTask;
  } else {
    // Claimed by this company — the everyday trigger case.
    task = await Task.findOne({ _id: tag.taskId, companyId, isActive: true }).lean();
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
  }

  // The tag's own stored taskListId is never caller input, so unlike
  // trigger-task/start-timer there's nothing to re-validate it against.
  const taskListId = tag.taskListId ? tag.taskListId.toString() : null;
  const date = todayString();

  const resolvedTask = await resolveTask(task);

  let completed, started;
  try {
    ({ completed, started } = await triggerTask(
      companyId,
      userId,
      task._id.toString(),
      resolvedTask.taskType,
      taskListId,
      date
    ));
  } catch (err) {
    if (err instanceof NfcTagRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true, completed, started });
}
