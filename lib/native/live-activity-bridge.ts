import { registerPlugin } from "@capacitor/core";

// Bridges to ios/App/App/LiveActivityPlugin.swift — puts a running routine
// timer on the Lock Screen / Dynamic Island. No-op-safe to call on web/PWA:
// registerPlugin resolves to a stub there, and every call site additionally
// guards with Capacitor.isNativePlatform(). See docs/features/live-activity.md.
export interface RoutineActivityState {
  routineItemId: string;
  routineGroupId?: string | null; // omit/undefined for a standalone (non-session) timer
  routineLabel: string;           // group name, or "Timer" for standalone
  habitName: string;
  startedAt: string;              // ISO string — server-authoritative RoutineLog.startedAt
  projectedMinutes: number;       // 0 for a stopwatch item (no target) — hides the estimated-finish line
}

interface LiveActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(options: RoutineActivityState): Promise<void>;
  update(options: RoutineActivityState): Promise<void>;
  end(): Promise<void>;
}

export const LiveActivity = registerPlugin<LiveActivityPlugin>("LiveActivity");
