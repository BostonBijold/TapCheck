import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

// Bridges to ios/App/App/LiveActivityPlugin.swift — puts a running task
// timer on the Lock Screen / Dynamic Island. No-op-safe to call on web/PWA:
// registerPlugin resolves to a stub there, and every call site additionally
// guards with Capacitor.isNativePlatform(). See docs/features/live-activity.md.
// Mirrors ios/App/RoutineActivity/RoutineActivityAttributes.swift's
// TimelineSegment — pct/colorState only, matching lib/task-timeline.ts's
// TimelineSegment minus the fields the native view doesn't need (id, minutes).
//
// Field/type names here (routineItemId, routineGroupId, RoutineActivityState,
// ...) intentionally still say "routine" — they mirror the un-renamed iOS
// RoutineActivity target's Swift structs verbatim across the bridge/push
// wire format. See the note in lib/native/routine-activity.ts.
export interface RoutineActivityTimelineSegment {
  pct: number;
  colorState: "done" | "active" | "activeOver" | "pending";
}

export interface RoutineActivityState {
  routineItemId: string;
  routineGroupId?: string | null; // omit/undefined for a standalone (non-session) timer
  routineLabel: string;           // task list name, or "Timer" for standalone
  habitName: string;
  startedAt: string;              // ISO string — server-authoritative TaskLog.startedAt
  projectedMinutes: number;       // 0 for a stopwatch task (no target) — hides the estimated-finish line
  // Whole-task-list timeline — omit for a standalone timer, which has no
  // task list to show one for. See docs/features/live-activity.md.
  timelineSegments?: RoutineActivityTimelineSegment[];
  routineStartedAt?: string;      // ISO string
  routineFinishAt?: string;       // ISO string
}

export interface RoutineActivityPushToken {
  token: string;
  environment: "sandbox" | "production";
}

interface LiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(options: RoutineActivityState): Promise<void>;
  update(options: RoutineActivityState): Promise<void>;
  end(): Promise<void>;
  // Fired whenever ios/App/App/LiveActivityPlugin.swift's
  // Activity.pushTokenUpdates yields a new token — see
  // lib/native/routine-activity.ts's registerPushTokenForwarding, which
  // relays this to POST /api/live-activity/push-token.
  addListener(
    eventName: "pushTokenReceived",
    listenerFunc: (data: RoutineActivityPushToken) => void
  ): Promise<PluginListenerHandle>;
}

export const LiveActivity = registerPlugin<LiveActivityPlugin>("LiveActivity");
