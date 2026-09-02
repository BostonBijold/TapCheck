import {
  completeInProgressLog,
  serializeLog,
  startImmediateLog,
  startInProgressLog,
} from "@/lib/task-log-actions";
import { findNextTaskInList, incrementSessionPauseOrJump } from "@/lib/task-list-session-actions";
import { resolveTask } from "@/lib/task-definitions";
import TaskLog from "@/models/TaskLog";
import Task from "@/models/Task";
import type { TaskType } from "@/models/TaskDefinition";
import TaskList from "@/models/TaskList";
import User from "@/models/User";
import { sendLiveActivityPush, toAppleReferenceSeconds, type RoutineActivityContentState } from "@/lib/apns";
import { projectedFinishTime, type TaskProjection } from "@/lib/projected-finish";
import { computeTimeline } from "@/lib/task-timeline";

// Server-side equivalent of TaskListSessionView.tsx's own projectionItems/
// timeline computation — same lib/projected-finish.ts + lib/task-timeline.ts
// math, just built from a fresh DB query instead of React state, since a
// push notification has no client-side session open to read from. Returns
// null for a standalone (non-session) task — there's no task list to show a
// timeline of. See docs/features/live-activity.md's "Push-driven updates".
async function buildTaskListTimeline(
  companyId: string,
  taskListId: string,
  date: string,
  activeTaskId: string,
  activeStartedAtMs: number,
  activeProjectedMinutes: number
) {
  const listTasks = await Task.find({ taskListId, companyId, isActive: true })
    .sort({ order: 1 })
    .lean();
  if (listTasks.length === 0) return null;

  const taskIds = listTasks.map((t) => t._id.toString());
  const logs = await TaskLog.find({ companyId, date, taskId: { $in: taskIds } }).lean();
  const logByTaskId = new Map(logs.map((l) => [l.taskId.toString(), l]));

  const projectionItems: TaskProjection[] = listTasks.map((t) => {
    const id = t._id.toString();
    if (id === activeTaskId) {
      return {
        projectedMinutes: t.projectedMinutes,
        state: "active",
        targetInstant: activeStartedAtMs + activeProjectedMinutes * 60000,
      };
    }
    const log = logByTaskId.get(id);
    if (log && (log.state === "done" || log.state === "missed" || log.state === "rest")) {
      return {
        projectedMinutes: t.projectedMinutes,
        state: log.state,
        actualMinutes: log.state === "done" ? (log.actualMinutes ?? undefined) : undefined,
      };
    }
    return { projectedMinutes: t.projectedMinutes, state: "pending" };
  });

  const nowMs = Date.now();
  const timeline = computeTimeline(
    listTasks.map((t, i) => ({ id: t._id.toString(), ...projectionItems[i] })),
    nowMs
  );
  const finishAt = projectedFinishTime(projectionItems, new Date(nowMs));

  // Live-Activity-only override — see the matching comment in
  // TaskListSessionView.tsx's identical logic. computeTimeline deliberately
  // reports "done" as olive regardless of variance everywhere else in the
  // app; only the pushed payload re-labels a done-but-over-target segment
  // as "activeOver" (amber) so that information isn't lost the moment a
  // task that ran long gets marked done.
  const projectionById = new Map(listTasks.map((t, i) => [t._id.toString(), projectionItems[i]]));
  const segments = timeline.segments.map((seg) => {
    const proj = projectionById.get(seg.id);
    const doneOverTarget =
      proj?.state === "done" && proj.actualMinutes != null && proj.actualMinutes > proj.projectedMinutes;
    return {
      pct: seg.pct,
      colorState:
        doneOverTarget || seg.colorState === "active-over" ? "activeOver" : (seg.colorState as string),
    };
  });

  return { startInstant: timeline.startInstant, finishAt, segments };
}

// Best-effort push of the newly-current task (or an "end" if nothing's
// active anymore) to performedByUserId's own Live Activity — see
// docs/features/live-activity.md's "Push-driven updates" section. Only
// meaningful for triggerTask below (the Universal Link NFC entry point):
// in-app switches already update the card locally from the app's own
// foreground JS (lib/native/routine-activity.ts) and don't need a push.
// Never throws — a push failure shouldn't fail the task-completion request
// that triggered it.
//
// NOTE ON FIELD NAMES: the payload built here (RoutineActivityContentState)
// is decoded verbatim by ios/App/RoutineActivity/RoutineActivityAttributes.
// swift, which this rename pass deliberately left untouched (see
// lib/apns.ts) — so `routineItemId`/`routineGroupId`/`habitName`/
// `routineLabel` below are wire-contract keys, not leftover vocabulary, and
// must keep these exact names even though everything feeding them is now
// Task/TaskList-shaped.
async function notifyLiveActivity(
  companyId: string,
  performedByUserId: string,
  started: ReturnType<typeof serializeLog> | null,
  completed: ReturnType<typeof serializeLog> | null
) {
  try {
    const user = await User.findOne(
      { _id: performedByUserId },
      "liveActivityPushToken liveActivityPushEnvironment"
    ).lean();
    if (!user?.liveActivityPushToken || !user.liveActivityPushEnvironment) {
      console.log("[notifyLiveActivity] no push token registered for user", performedByUserId);
      return;
    }

    const target = started ?? completed;
    if (!target) {
      console.log("[notifyLiveActivity] no started/completed target — nothing to notify");
      return;
    }

    const rawTask = await Task.findOne({ _id: target.taskId }).lean();
    if (!rawTask) {
      console.log("[notifyLiveActivity] Task not found for", target.taskId);
      return;
    }
    const task = await resolveTask(rawTask);
    const taskList = target.sessionTaskListId
      ? await TaskList.findOne({ _id: task.taskListId }).lean()
      : null;

    const startedAtDate = target.startedAt ? new Date(target.startedAt) : new Date();
    const projectedMinutes = task.taskType === "stopwatch" ? 0 : task.projectedMinutes;

    const contentState: RoutineActivityContentState = {
      routineLabel: taskList ? taskList.name : "Timer",
      habitName: task.name,
      startedAt: toAppleReferenceSeconds(startedAtDate),
      projectedMinutes,
      routineItemId: target.taskId,
      routineGroupId: target.sessionTaskListId,
      timelineSegments: [],
    };

    if (taskList && target.sessionTaskListId) {
      const taskListTimeline = await buildTaskListTimeline(
        companyId,
        target.sessionTaskListId,
        target.date,
        target.taskId,
        startedAtDate.getTime(),
        projectedMinutes
      );
      if (taskListTimeline) {
        contentState.timelineSegments = taskListTimeline.segments as RoutineActivityContentState["timelineSegments"];
        contentState.routineStartedAt = toAppleReferenceSeconds(new Date(taskListTimeline.startInstant));
        contentState.routineFinishAt = toAppleReferenceSeconds(taskListTimeline.finishAt);
      }
    }

    const event = started ? "update" : "end";
    console.log(
      "[notifyLiveActivity] sending",
      event,
      "push to token",
      user.liveActivityPushToken.slice(-12),
      "env",
      user.liveActivityPushEnvironment,
      "content:",
      contentState
    );
    await sendLiveActivityPush({
      pushToken: user.liveActivityPushToken,
      environment: user.liveActivityPushEnvironment as "sandbox" | "production",
      event,
      contentState,
    });
    console.log("[notifyLiveActivity] push sent successfully");
  } catch (error) {
    // Best-effort — a push failure shouldn't fail the task-completion
    // request that triggered it — but log it so it's visible in Vercel's
    // Runtime Logs, since there's no other feedback channel for this.
    console.error("[notifyLiveActivity] failed:", error);
  }
}

// The shared start/complete/advance dispatch — called directly by
// app/nfc/[tagCode]/page.tsx (Universal Link NFC tap), the only entry point
// left since the external API and native App Intents/Shortcuts layer that
// used to also call this were removed entirely (see
// docs/project-structure.md's "iOS Native Shell" section). See
// docs/features/nfc.md's "triggerTask()'s three-case dispatch" section for
// the full case breakdown this implements, including the known form-task
// data-loss gap.
//
// Bidirectional: whether this starts or completes a task is decided
// entirely by current server state (is there an active timer for this
// specific person, and does it match the tapped task), never by a param the
// caller sends.
//
// Tasks with no timer (checkbox) never pass through an in_progress state at
// all — "starting" one just writes a terminal done log immediately
// (startImmediateLog), zero minutes.

function isTimerTask(taskType: TaskType): boolean {
  return taskType === "standard" || taskType === "stopwatch";
}

// Starts taskId per Case 1's rules: standard/stopwatch → in_progress timer
// (sessionTaskListId anchored if taskListId given), anything else →
// immediate zero-minute done log. Both halves enforce the single-active-
// timer sweep internally (startInProgressLog / startImmediateLog).
async function startTask(
  companyId: string,
  performedByUserId: string,
  taskType: TaskType,
  taskId: string,
  date: string,
  taskListId: string | null
) {
  return isTimerTask(taskType)
    ? startInProgressLog(companyId, performedByUserId, taskId, date, taskListId)
    : startImmediateLog(companyId, performedByUserId, taskId, date, taskListId);
}

export async function triggerTask(
  companyId: string,
  performedByUserId: string,
  taskId: string,
  taskType: TaskType,
  taskListId: string | null,
  date: string
) {
  // Only one log is ever in_progress at a time per person by invariant, but
  // sort defensively in case more than one ever exists transiently — same
  // defensiveness as GET /api/task-logs/active.
  const activeLog = await TaskLog.findOne({ companyId, performedByUserId, state: "in_progress" })
    .sort({ startedAt: -1 })
    .lean();

  let completed = null;
  let started = null;

  if (activeLog && activeLog.taskId.toString() === taskId) {
    // Case 2 — tapped task is the currently active one: complete it.
    const completedLog = await completeInProgressLog(companyId, performedByUserId, taskId, activeLog.date);
    completed = serializeLog(completedLog);

    if (taskListId) {
      const next = await findNextTaskInList(companyId, taskListId, activeLog.date);
      if (next) {
        const startedLog = await startTask(
          companyId,
          performedByUserId,
          next.taskType,
          next._id.toString(),
          activeLog.date,
          taskListId
        );
        started = serializeLog(startedLog);
      }
    }
  } else if (activeLog) {
    // Case 3 — a different task is active: complete it, then start the
    // tapped task (jump case — lands wherever was tapped, not the next in
    // sequence), passing taskListId through regardless of whether it was
    // supplied on this call for the completed task or not.
    const otherTaskId = activeLog.taskId.toString();
    const otherSessionTaskListId = activeLog.sessionTaskListId ? activeLog.sessionTaskListId.toString() : null;
    const completedLog = await completeInProgressLog(companyId, performedByUserId, otherTaskId, activeLog.date);
    completed = serializeLog(completedLog);
    // This is the jump this counter exists for — attention moved to a
    // different task without the one that was running getting marked done
    // by the user themselves. Counted against the session the left-behind
    // task belonged to (see lib/task-list-session-actions.ts).
    if (otherSessionTaskListId) await incrementSessionPauseOrJump(companyId, otherSessionTaskListId, activeLog.date);

    const startedLog = await startTask(companyId, performedByUserId, taskType, taskId, date, taskListId);
    started = serializeLog(startedLog);
  } else {
    // Case 1 — nothing active anywhere: start the tapped task.
    const startedLog = await startTask(companyId, performedByUserId, taskType, taskId, date, taskListId);
    started = serializeLog(startedLog);
  }

  await notifyLiveActivity(companyId, performedByUserId, started, completed);
  return { completed, started };
}

// completeActiveTask() used to live here — built for the Live Activity's
// old "Done" button, then for the external API generally once the button
// was replaced with a plain open-the-app Link (see
// docs/features/live-activity.md's "Open App button" section). Removed
// outright once its only caller (POST /api/external/complete-active-task)
// was deleted along with the rest of the API-key-authenticated external API
// surface — see docs/features/nfc.md's history note on why. `triggerTask`
// above is the only entry point left; it's called directly as a library
// function by app/nfc/[tagCode]/page.tsx (Universal Links), not over HTTP.
