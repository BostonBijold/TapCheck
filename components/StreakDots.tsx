import type { LogState } from "@/models/RoutineLog";
import { computeWeeklyProgress, type DayState } from "@/lib/routine-progress";

interface Props {
  logs: Array<{ date: string; state: LogState }>;
  dates: string[]; // Sunday→Saturday, fixed calendar week (see lib/week-dates.ts)
  today: string;   // YYYY-MM-DD — marks today's dot and what counts as "future"
  scheduledDays: number[];  // 0=Sun..6=Sat — which days this item is expected
  successThreshold: number; // unused by StreakDots' own rendering, but keeps
                             // the call signature symmetric with computeWeeklyProgress
}

// Only done/missed/rest are meaningful to the weekly-progress math — a
// same-day in_progress/paused log reads the same as "no log yet" (today
// stays "pending" until it's explicitly resolved).
function toLoggedState(state: LogState): "done" | "missed" | "rest" | undefined {
  return state === "done" || state === "missed" || state === "rest" ? state : undefined;
}

const DOT: Record<DayState, string> = {
  done: "bg-gold",
  rest: "bg-blue-muted",
  missed: "bg-burgundy",
  pending: "border border-dim",
  not_scheduled: "bg-border/40",
};

export default function StreakDots({ logs, dates, today, scheduledDays, successThreshold }: Props) {
  const logsByDate = Object.fromEntries(
    logs.map((l) => [l.date, toLoggedState(l.state)])
  );
  const { days } = computeWeeklyProgress(scheduledDays, successThreshold, logsByDate, dates, today);

  return (
    <div className="flex items-center gap-[3px]">
      {days.map(({ date, state }) => {
        const isToday = date === today;
        return (
          <div
            key={date}
            className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${DOT[state]}`}
            style={isToday ? { boxShadow: "0 0 0 1.5px #c4a84a" } : undefined}
          />
        );
      })}
    </div>
  );
}
