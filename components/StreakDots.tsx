import type { LogState } from "@/models/TaskLog";
import { computeWeeklyProgress, type DayBreakdown } from "@/lib/task-progress";

interface Props {
  logs: Array<{ date: string; state: LogState; actualMinutes: number | null }>;
  dates: string[]; // Sunday→Saturday, fixed calendar week (see lib/week-dates.ts)
  today: string;   // YYYY-MM-DD, real — what counts as "future" for the weekly math
  viewingDate: string; // YYYY-MM-DD — which dot gets the ring; the date the
                        // user is currently browsing via DateNav, which may
                        // differ from `today` when looking at a past day.
                        // Deliberately kept separate from `today`: which
                        // days are "pending" must stay anchored to the real
                        // date regardless of what's being viewed.
  scheduledDays: number[];  // 0=Sun..6=Sat — which days this item is expected
  successThreshold: number; // unused by StreakDots' own rendering, but keeps
                             // the call signature symmetric with computeWeeklyProgress
  targetMinutes: number | null; // the item's time target, or null for
                                 // checkbox/stopwatch items — gates the
                                 // green/amber "done" timing color
}

// Only done/missed/rest are meaningful to the weekly-progress math — a
// same-day in_progress/paused log reads the same as "no log yet" (today
// stays "pending" until it's explicitly resolved).
function toLoggedState(l: { state: LogState; actualMinutes: number | null }) {
  return l.state === "done" || l.state === "missed" || l.state === "rest"
    ? { state: l.state, actualMinutes: l.actualMinutes }
    : undefined;
}

// Done is colored by how close it came to the target (green = on/under
// time, amber = over target by any amount) rather than a flat "done" color
// — red is reserved exclusively for `missed`, no other state ever renders
// red, so amber covers "overtime" regardless of severity. Everything that
// isn't a solid-fill success (done or rest) is a hollow, no-fill ring
// instead — border style/color carries the meaning, which reads more
// clearly at 5px than another close-but-different fill color would: dashed
// grey = still open (pending), solid grey = past and simply never logged,
// solid red = explicitly marked missed.
function dotClass({ state, timing }: DayBreakdown): string {
  if (state === "done") {
    return timing === "amber" ? "bg-amber" : "bg-done";
  }
  switch (state) {
    case "rest": return "bg-blue-muted";
    case "missed": return "bg-transparent border border-burgundy-light";
    case "unlogged": return "bg-transparent border border-dim";
    case "pending": return "bg-transparent border border-dashed border-dim";
    case "not_scheduled": return "bg-border/40";
    default: return "bg-border/40";
  }
}

export default function StreakDots({ logs, dates, today, viewingDate, scheduledDays, successThreshold, targetMinutes }: Props) {
  const logsByDate = Object.fromEntries(
    logs.map((l) => [l.date, toLoggedState(l)])
  );
  const { days } = computeWeeklyProgress(scheduledDays, successThreshold, logsByDate, dates, today, targetMinutes);

  return (
    <div className="flex items-center gap-[3px]">
      {days.map((day) => {
        const isViewing = day.date === viewingDate;
        return (
          <div
            key={day.date}
            className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${dotClass(day)}`}
            style={isViewing ? { boxShadow: "0 0 0 1.5px #3b82f6" } : undefined}
          />
        );
      })}
    </div>
  );
}
