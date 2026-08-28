"use client";

// Lightweight cross-component signal: fired whenever a TaskLog mutation
// could change which task (if any) is currently in_progress, so the FAB
// (components/BottomNav.tsx) can refresh its active-timer indicator
// immediately instead of waiting on its background poll. No shared state
// library in this app yet — a plain window event is the simplest thing that
// works for a signal this infrequent.
export const TASK_LOG_CHANGED_EVENT = "task-log-changed";

export function emitTaskLogChanged() {
  window.dispatchEvent(new Event(TASK_LOG_CHANGED_EVENT));
}
