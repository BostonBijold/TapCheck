"use client";

// Lightweight cross-component signal: fired whenever a RoutineLog mutation
// could change which item (if any) is currently in_progress, so the FAB
// (components/BottomNav.tsx) can refresh its active-timer indicator
// immediately instead of waiting on its background poll. No shared state
// library in this app yet — a plain window event is the simplest thing that
// works for a signal this infrequent.
export const ROUTINE_LOG_CHANGED_EVENT = "routine-log-changed";

export function emitRoutineLogChanged() {
  window.dispatchEvent(new Event(ROUTINE_LOG_CHANGED_EVENT));
}
