import { calendarWeekDates } from "@/lib/week-dates";

// Shared window logic for every Reports route — originally lived only in
// app/api/reports/route.ts; pulled out so app/api/reports/leaderboard and
// app/api/reports/inventory (see docs/features/reports.md's "Reports v2"
// addendum) compute the exact same 7d/30d window instead of a second,
// possibly-drifting copy.

// anchorDate: client's local today (YYYY-MM-DD). Never derive from server
// UTC. The 7-day view is a fixed Sunday–Saturday calendar week containing
// anchorDate — it can include days after anchorDate (later this week),
// which callers should treat as not-yet-happened. The 30-day view stays a
// trailing window ending at anchorDate, which by construction never
// includes a future date.
export function getDates(days: number, anchorDate: string): string[] {
  if (days === 7) return calendarWeekDates(anchorDate);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(anchorDate + "T12:00:00");
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().split("T")[0];
  });
}

// Days in `dates` that have actually happened yet — excludes the
// later-this-week placeholder days a 7-day window can include.
export function elapsedDates(dates: string[], anchorDate: string): string[] {
  return dates.filter((d) => d <= anchorDate);
}
