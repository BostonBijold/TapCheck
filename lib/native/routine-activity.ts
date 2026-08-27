import { Capacitor } from "@capacitor/core";
import { LiveActivity, type RoutineActivityState } from "@/lib/native/live-activity-bridge";

// Thin, always-safe wrappers around lib/native/live-activity-bridge.ts —
// every call site (RoutinesView.tsx, RoutineSession.tsx) just calls these
// directly without its own Capacitor.isNativePlatform() guard or try/catch.
// See docs/features/live-activity.md.

export function startRoutineActivity(state: RoutineActivityState) {
  if (!Capacitor.isNativePlatform()) return;
  LiveActivity.start(state).catch(() => {});
}

export function updateRoutineActivity(state: RoutineActivityState) {
  if (!Capacitor.isNativePlatform()) return;
  LiveActivity.update(state).catch(() => {});
}

export function endRoutineActivity() {
  if (!Capacitor.isNativePlatform()) return;
  LiveActivity.end().catch(() => {});
}
