// Pure date helper — safe to import from client or server code.
// This is a Sunday–Saturday calendar week — StreakDots and the Reports
// Overview 7-day view use this one.

// Returns all 7 dates (YYYY-MM-DD) of the Sunday-through-Saturday week
// containing anchorDate, oldest (Sunday) to newest (Saturday). Pinned to the
// calendar week, not a trailing "last 7 days" window — the result for a
// given anchor doesn't shift depending on what day of the week it is.
export function calendarWeekDates(anchorDate: string): string[] {
  const anchor = new Date(anchorDate + "T12:00:00"); // local noon avoids DST edge cases
  const sunday = new Date(anchor);
  sunday.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}
