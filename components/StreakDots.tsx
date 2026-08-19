import type { LogState } from "@/models/RoutineLog";

interface Props {
  logs: Array<{ date: string; state: LogState }>;
  dates: string[]; // Sunday→Saturday, fixed calendar week (see lib/week-dates.ts)
  today: string;   // YYYY-MM-DD — marks today's dot and what counts as "future"
}

const DOT: Partial<Record<LogState, string>> = {
  done: "bg-olive",
  missed: "bg-burgundy",
  rest: "bg-blue-muted",
};

export default function StreakDots({ logs, dates, today }: Props) {
  const map = Object.fromEntries(logs.map((l) => [l.date, l.state]));
  return (
    <div className="flex items-center gap-[3px]">
      {dates.map((date) => {
        const state = map[date];
        // Days later this week that haven't happened yet — a distinct hollow
        // dot, never the same as a past/today day with no log (bg-border).
        const isFuture = date > today;
        const isToday = date === today;
        return (
          <div
            key={date}
            className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${
              isFuture ? "border border-dim" : state ? DOT[state] : "bg-border"
            }`}
            style={isToday ? { boxShadow: "0 0 0 1.5px #c4a84a" } : undefined}
          />
        );
      })}
    </div>
  );
}
