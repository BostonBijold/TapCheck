// Pure date helpers — safe to import from client components.
// No mongoose/model imports here.

// ISO week number (1-based)
export function isoWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  );
}

// Returns Monday (start of ISO week) for a given date as YYYY-MM-DD
export function weekStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon ...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

// Returns the virtue order (1..virtueCount) for the given date, within
// whichever philosophy virtueCount belongs to. Fully stateless — nothing in
// the database tracks "which week we're on"; every call recomputes fresh
// from the calendar date and the caller-supplied count. Switching
// philosophies mid-cycle just means the next call passes a different count;
// no special-casing needed.
export function currentVirtueOrder(date: Date, virtueCount: number): number {
  if (virtueCount <= 0) return 1;
  return ((isoWeekNumber(date) - 1) % virtueCount) + 1;
}

// ── Progressive virtue stacking (per-user, separate from the shared rotation above) ──
//
// A user's daily check-in only includes virtues up to how many weeks
// they've personally been active on their current philosophy (since
// signup, their last reset, or their last philosophy switch) — capped and
// wrapped the same way the shared rotation above wraps every `virtueCount`
// weeks. None of this changes which virtue is highlighted for anyone
// (currentVirtueOrder, above) — it only controls how many additional
// virtues ride along in a given user's own check-in list.

// Weeks elapsed (1-indexed, min 1) between a user's stack start week and
// `date`, both Monday-anchored via weekStartDate — so this advances in
// lockstep with the shared rotation's own week boundaries, with nothing to
// increment or store beyond the start-week anchor itself.
export function personalWeeksActive(startWeekMonday: string, date: Date = new Date()): number {
  const start = new Date(startWeekMonday + "T12:00:00").getTime();
  const current = new Date(weekStartDate(date) + "T12:00:00").getTime();
  const diffWeeks = Math.round((current - start) / (7 * 86400000));
  return Math.max(1, diffWeeks + 1);
}

// How many virtues belong in this user's check-in list right now — cycles
// 1..virtueCount and wraps back to 1, mirroring currentVirtueOrder's own
// wraparound formula, just parameterized by the user's personal
// weeksActive instead of weeks-since-launch.
export function personalStackSize(weeksActive: number, virtueCount: number): number {
  if (virtueCount <= 0) return 0;
  return ((Math.max(1, weeksActive) - 1) % virtueCount) + 1;
}

// The `stackSize` virtues (as `order` values, ascending) that belong in a
// user's check-in list: `currentOrder` (this week's shared highlight) and
// then walking backward through the fixed rotation order, wrapping around
// the start the same way the shared rotation wraps.
export function personalStackOrders(currentOrder: number, stackSize: number, virtueCount: number): number[] {
  if (virtueCount <= 0) return [];
  const size = Math.min(stackSize, virtueCount);
  const orders: number[] = [];
  for (let i = 0; i < size; i++) {
    orders.push((((currentOrder - i - 1) % virtueCount) + virtueCount) % virtueCount + 1);
  }
  return orders.sort((a, b) => a - b);
}
