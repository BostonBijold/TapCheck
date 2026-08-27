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

// Relays every push token LiveActivityPlugin.swift reports to the server,
// which is what lets trigger-habit/completeActiveHabit (NFC/Shortcuts, the
// Lock Screen "Done" button) push a corrected card even while the app isn't
// open — see docs/features/live-activity.md's "Push-driven updates"
// section. Called once from components/NativeBootstrap.tsx, same as
// ApiKeyBridge's setup — a listener registered once here fires for every
// token the whole native session receives, not just the first.
export function registerPushTokenForwarding() {
  if (!Capacitor.isNativePlatform()) return;
  LiveActivity.addListener("pushTokenReceived", (data) => {
    fetch("/api/live-activity/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
  });
}
