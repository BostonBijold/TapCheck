import {
  completeInProgressLog,
  serializeLog,
  startImmediateLog,
  startInProgressLog,
} from "@/lib/routine-log-actions";
import { findNextItemInGroup, incrementSessionPauseOrJump } from "@/lib/routine-session-actions";
import RoutineLog from "@/models/RoutineLog";
import RoutineItem, { type ItemType } from "@/models/RoutineItem";
import RoutineGroup from "@/models/RoutineGroup";
import User from "@/models/User";
import { sendLiveActivityPush, toAppleReferenceSeconds, type RoutineActivityContentState } from "@/lib/apns";
import { projectedFinishTime, type ItemProjection } from "@/lib/projected-finish";
import { computeTimeline } from "@/lib/routine-timeline";

// Server-side equivalent of RoutineSession.tsx's own projectionItems/timeline
// computation — same lib/projected-finish.ts + lib/routine-timeline.ts math,
// just built from a fresh DB query instead of React state, since a push
// notification has no client-side session open to read from. Returns null
// for a standalone (non-session) item — there's no "routine" to show a
// timeline of. See docs/features/live-activity.md's "Push-driven updates".
async function buildRoutineTimeline(
  companyId: string,
  groupId: string,
  date: string,
  activeRoutineItemId: string,
  activeStartedAtMs: number,
  activeProjectedMinutes: number
) {
  const groupItems = await RoutineItem.find({ groupId, companyId, isActive: true })
    .sort({ order: 1 })
    .lean();
  if (groupItems.length === 0) return null;

  const itemIds = groupItems.map((i) => i._id.toString());
  const logs = await RoutineLog.find({ companyId, date, routineItemId: { $in: itemIds } }).lean();
  const logByItemId = new Map(logs.map((l) => [l.routineItemId.toString(), l]));

  const projectionItems: ItemProjection[] = groupItems.map((it) => {
    const id = it._id.toString();
    if (id === activeRoutineItemId) {
      return {
        projectedMinutes: it.projectedMinutes,
        state: "active",
        targetInstant: activeStartedAtMs + activeProjectedMinutes * 60000,
      };
    }
    const log = logByItemId.get(id);
    if (log && (log.state === "done" || log.state === "missed" || log.state === "rest")) {
      return {
        projectedMinutes: it.projectedMinutes,
        state: log.state,
        actualMinutes: log.state === "done" ? (log.actualMinutes ?? undefined) : undefined,
      };
    }
    return { projectedMinutes: it.projectedMinutes, state: "pending" };
  });

  const nowMs = Date.now();
  const timeline = computeTimeline(
    groupItems.map((it, i) => ({ id: it._id.toString(), ...projectionItems[i] })),
    nowMs
  );
  const finishAt = projectedFinishTime(projectionItems, new Date(nowMs));

  // Live-Activity-only override — see the matching comment in
  // RoutineSession.tsx's identical logic. computeTimeline deliberately
  // reports "done" as olive regardless of variance everywhere else in the
  // app; only the pushed payload re-labels a done-but-over-target segment
  // as "activeOver" (amber) so that information isn't lost the moment a
  // habit that ran long gets marked done.
  const projectionById = new Map(groupItems.map((it, i) => [it._id.toString(), projectionItems[i]]));
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

// Best-effort push of the newly-current habit (or an "end" if nothing's
// active anymore) to performedByUserId's own Live Activity — see
// docs/features/live-activity.md's "Push-driven updates" section. Only
// meaningful for the two external-trigger entry points below (trigger-habit,
// completeActiveHabit): in-app switches already update the card locally
// from the app's own foreground JS (lib/native/routine-activity.ts) and
// don't need a push. Never throws — a push failure shouldn't fail the
// habit-completion request that triggered it, same as the AppIntentLink
// bookkeeping below.
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

    const item = await RoutineItem.findOne({ _id: target.routineItemId }).lean();
    if (!item) {
      console.log("[notifyLiveActivity] RoutineItem not found for", target.routineItemId);
      return;
    }
    const group = target.sessionGroupId
      ? await RoutineGroup.findOne({ _id: item.groupId }).lean()
      : null;

    const startedAtDate = target.startedAt ? new Date(target.startedAt) : new Date();
    const projectedMinutes = item.itemType === "stopwatch" ? 0 : item.projectedMinutes;

    const contentState: RoutineActivityContentState = {
      routineLabel: group ? group.name : "Timer",
      habitName: item.name,
      startedAt: toAppleReferenceSeconds(startedAtDate),
      projectedMinutes,
      routineItemId: target.routineItemId,
      routineGroupId: target.sessionGroupId,
      timelineSegments: [],
    };

    if (group && target.sessionGroupId) {
      const routineTimeline = await buildRoutineTimeline(
        companyId,
        target.sessionGroupId,
        target.date,
        target.routineItemId,
        startedAtDate.getTime(),
        projectedMinutes
      );
      if (routineTimeline) {
        contentState.timelineSegments = routineTimeline.segments as RoutineActivityContentState["timelineSegments"];
        contentState.routineStartedAt = toAppleReferenceSeconds(new Date(routineTimeline.startInstant));
        contentState.routineFinishAt = toAppleReferenceSeconds(routineTimeline.finishAt);
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
    // Best-effort — a push failure shouldn't fail the habit-completion
    // request that triggered it — but log it so it's visible in Vercel's
    // Runtime Logs, since there's no other feedback channel for this.
    console.error("[notifyLiveActivity] failed:", error);
  }
}

// The shared start/complete/advance dispatch behind POST /api/external/
// trigger-habit — called both directly (a caller who already knows the
// target routineItemId) and by the native TriggerHabitIntent App Intent
// (ios/App/App/AppIntents/TriggerHabitIntent.swift), which resolves the
// habit from a live Shortcuts/Siri picker instead. See
// docs/api/external-api.md for the full case breakdown this implements.
//
// Bidirectional: whether this starts or completes a habit is decided
// entirely by current server state (is there an active timer for this
// specific person, and does it match the tapped item), never by a param the
// caller sends.
//
// Items with no timer (checkbox) never pass through an in_progress state at
// all — "starting" one just writes a terminal done log immediately
// (startImmediateLog), zero minutes.

function isTimerItem(itemType: ItemType): boolean {
  return itemType === "standard" || itemType === "stopwatch";
}

// Starts routineItemId per Case 1's rules: standard/stopwatch → in_progress
// timer (sessionGroupId anchored if groupId given), anything else →
// immediate zero-minute done log. Both halves enforce the single-active-
// timer sweep internally (startInProgressLog / startImmediateLog).
async function startItem(
  companyId: string,
  performedByUserId: string,
  itemType: ItemType,
  routineItemId: string,
  date: string,
  groupId: string | null
) {
  return isTimerItem(itemType)
    ? startInProgressLog(companyId, performedByUserId, routineItemId, date, groupId)
    : startImmediateLog(companyId, performedByUserId, routineItemId, date, groupId);
}

export async function triggerHabit(
  companyId: string,
  performedByUserId: string,
  routineItemId: string,
  itemType: ItemType,
  routineGroupId: string | null,
  date: string
) {
  // Only one log is ever in_progress at a time per person by invariant, but
  // sort defensively in case more than one ever exists transiently — same
  // defensiveness as GET /api/routine-logs/active.
  const activeLog = await RoutineLog.findOne({ companyId, performedByUserId, state: "in_progress" })
    .sort({ startedAt: -1 })
    .lean();

  let completed = null;
  let started = null;

  if (activeLog && activeLog.routineItemId.toString() === routineItemId) {
    // Case 2 — tapped item is the currently active one: complete it.
    const completedLog = await completeInProgressLog(companyId, performedByUserId, routineItemId, activeLog.date);
    completed = serializeLog(completedLog);

    if (routineGroupId) {
      const next = await findNextItemInGroup(companyId, routineGroupId, activeLog.date);
      if (next) {
        const startedLog = await startItem(
          companyId,
          performedByUserId,
          next.itemType,
          next._id.toString(),
          activeLog.date,
          routineGroupId
        );
        started = serializeLog(startedLog);
      }
    }
  } else if (activeLog) {
    // Case 3 — a different item is active: complete it, then start the
    // tapped item (jump case — lands wherever was tapped, not the next in
    // sequence), passing routineGroupId through regardless of whether it
    // was supplied on this call for the completed item or not.
    const otherItemId = activeLog.routineItemId.toString();
    const otherSessionGroupId = activeLog.sessionGroupId ? activeLog.sessionGroupId.toString() : null;
    const completedLog = await completeInProgressLog(companyId, performedByUserId, otherItemId, activeLog.date);
    completed = serializeLog(completedLog);
    // This is the jump this counter exists for — attention moved to a
    // different item without the one that was running getting marked done
    // by the user themselves. Counted against the session the left-behind
    // item belonged to (see lib/routine-session-actions.ts).
    if (otherSessionGroupId) await incrementSessionPauseOrJump(companyId, otherSessionGroupId, activeLog.date);

    const startedLog = await startItem(companyId, performedByUserId, itemType, routineItemId, date, routineGroupId);
    started = serializeLog(startedLog);
  } else {
    // Case 1 — nothing active anywhere: start the tapped item.
    const startedLog = await startItem(companyId, performedByUserId, itemType, routineItemId, date, routineGroupId);
    started = serializeLog(startedLog);
  }

  await notifyLiveActivity(companyId, performedByUserId, started, completed);
  return { completed, started };
}

// Completes whichever item is currently in_progress for performedByUserId —
// no routineItemId needed, unlike triggerHabit above — and, if it was
// anchored to a Routine Session (sessionGroupId set), auto-starts the next
// unlogged item in that group. Built for the Live Activity's "Done" button
// (CompleteHabitFromActivityIntent.swift): that button can't reliably know
// which habit is current by the time it's tapped (see
// docs/features/live-activity.md's note on stale bound parameters vs.
// Activity.activities being unreliable from within a LiveActivityIntent's
// perform()), but the server always knows unambiguously — at most one
// in_progress log ever exists per person per the single-active-timer
// invariant. A no-op (both null) if nothing is currently active. Takes no
// `date` either — always acts on the active log's own `date`, same as Case
// 3 above, since there's no per-call caller intent to anchor to a
// particular day.
export async function completeActiveHabit(companyId: string, performedByUserId: string) {
  const activeLog = await RoutineLog.findOne({ companyId, performedByUserId, state: "in_progress" })
    .sort({ startedAt: -1 })
    .lean();

  if (!activeLog) {
    return { completed: null, started: null };
  }

  const completedLog = await completeInProgressLog(companyId, performedByUserId, activeLog.routineItemId.toString(), activeLog.date);
  const completed = serializeLog(completedLog);

  let started = null;
  const sessionGroupId = activeLog.sessionGroupId ? activeLog.sessionGroupId.toString() : null;
  if (sessionGroupId) {
    const next = await findNextItemInGroup(companyId, sessionGroupId, activeLog.date);
    if (next) {
      const startedLog = await startItem(companyId, performedByUserId, next.itemType, next._id.toString(), activeLog.date, sessionGroupId);
      started = serializeLog(startedLog);
    }
  }

  await notifyLiveActivity(companyId, performedByUserId, started, completed);
  return { completed, started };
}
