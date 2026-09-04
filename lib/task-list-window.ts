// Pure time-of-day window math for a shift-window TaskList — zero imports,
// callable from both client code (components/TaskListCard.tsx) and server
// code (app/api/cron/check-missed-lists) so the two never diverge, same
// "one pure function, two callers" pattern as lib/task-progress.ts and
// lib/placement-resolution.ts.
//
// All times are "HH:MM" local-clock strings — this module has no concept
// of timezone or calendar date; callers resolve "what time is it right now
// in this company's zone" themselves (see lib/task-list-window.ts's
// minutesNowInZone for the server-side version) and pass in a plain
// minutes-since-midnight number.

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Derive a shift-window list's end time from its startTime plus the total
// projected minutes of its timed (non-checkbox) tasks scheduled for the
// day being evaluated. null = no window (an anytime list, or a list with
// nothing timed on it).
export function deriveCollapseAfter(startTime: string | null, projectedMins: number): string | null {
  if (!startTime || projectedMins <= 0) return null;
  const total = toMinutes(startTime) + projectedMins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isPastWindow(nowMinutesLocal: number, collapseAfter: string | null): boolean {
  if (!collapseAfter) return false;
  return nowMinutesLocal >= toMinutes(collapseAfter);
}

export function isBeforeWindow(nowMinutesLocal: number, startTime: string | null): boolean {
  if (!startTime) return false;
  return nowMinutesLocal < toMinutes(startTime);
}

// Minutes-since-midnight for "now" as seen in a specific IANA timezone —
// the server-side companion to components/TaskListCard.tsx's own
// browser-local minutesNow(). Uses Intl rather than a date library: no new
// dependency needed for something this small.
export function minutesNowInZone(timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

// Today's date (YYYY-MM-DD) as seen in a specific IANA timezone.
export function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

// A flat 30-minute grace period after a shift window's derived end time,
// before the missed-list sweep will alert on it — see
// docs/features/notifications.md's "What counts as missed." One constant
// for every shift-window list, every company, in v1; not yet
// per-list-configurable.
export const MISSED_LIST_GRACE_MINUTES = 30;

// True once a shift-window list's grace-adjusted end time has passed for
// "now" (already resolved to the company's own local minutes-since-midnight
// — see minutesNowInZone). Mirrors isPastWindow, offset by the grace period.
export function isPastGraceWindow(nowMinutesLocal: number, collapseAfter: string | null): boolean {
  if (!collapseAfter) return false;
  return nowMinutesLocal >= toMinutes(collapseAfter) + MISSED_LIST_GRACE_MINUTES;
}
