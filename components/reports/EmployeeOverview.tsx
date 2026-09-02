"use client";

import { useState, useEffect } from "react";
import { Flame } from "lucide-react";
import TaskListChart from "@/components/reports/TaskListChart";
import TaskStatRow from "@/components/reports/TaskStatRow";
import { fmtMins, utcMinsToLocalTime, completionBarColor, type ReportsData } from "@/components/reports/shared";

// Employee's Reports Overview — a personal-only view scoped to their own
// logs. GET /api/reports personalizes every field server-side once the
// caller's role resolves to "employee" (see app/api/reports/route.ts), so
// this fetches the identical endpoint the manager view does and simply
// renders a summary strip on top of the same Task List Performance / Task
// Breakdown sections, reused as-is — see docs/features/reports.md.
export default function EmployeeOverview() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const localDate = new Date().toLocaleDateString("en-CA");
    fetch(`/api/reports?days=${days}&localDate=${localDate}`)
      .then((r) => r.json())
      .then((d: ReportsData) => {
        setData(d);
        setLoading(false);
      });
  }, [days]);

  const tasksByList = data
    ? data.taskLists.map((tl) => ({
        taskList: tl,
        tasks: data.tasks.filter((t) => t.taskListId === tl._id),
      }))
    : [];

  const dateRangeLabel =
    data && data.dates.length > 1
      ? `${new Date(data.dates[0] + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(data.dates[data.dates.length - 1] + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "";

  // Aggregate "this week's completion rate" across every task's own
  // weeklyProgress (only present in the 7-day fixed-week view — a weekly
  // threshold has no clean meaning against the 30-day trailing window).
  const weeklyAgg = data && data.days === 7
    ? data.tasks.reduce(
        (acc, t) => {
          if (!t.weeklyProgress) return acc;
          return {
            success: acc.success + t.weeklyProgress.successCount,
            threshold: acc.threshold + t.weeklyProgress.successThreshold,
          };
        },
        { success: 0, threshold: 0 }
      )
    : null;
  const weeklyCompletionPct = weeklyAgg && weeklyAgg.threshold > 0
    ? Math.round((weeklyAgg.success / weeklyAgg.threshold) * 100)
    : null;

  const tasksLoggedToday = data
    ? data.tasks.filter((t) => t.daily.find((d) => d.date === data.today)?.state === "done").length
    : 0;

  return (
    <>
      {!loading && data && (
        <section className="mb-8 bg-card rounded-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-amber" strokeWidth={1.75} />
              <div>
                <p className="font-mono text-lg font-semibold text-text leading-none">
                  {data.currentStreak ?? 0}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-dim mt-0.5">
                  day streak
                </p>
              </div>
            </div>
            {weeklyCompletionPct !== null && (
              <div className="text-center">
                <p
                  className="font-mono text-lg font-semibold leading-none"
                  style={{ color: completionBarColor(weeklyCompletionPct / 100) }}
                >
                  {weeklyCompletionPct}%
                </p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-dim mt-0.5">
                  this week
                </p>
              </div>
            )}
            <div className="text-right">
              <p className="font-mono text-lg font-semibold text-text leading-none">
                {tasksLoggedToday}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-widest text-dim mt-0.5">
                logged today
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Date range label + day toggle */}
      <div className="flex items-center justify-between mb-8">
        <div>
          {dateRangeLabel && (
            <p className="font-mono text-dim text-[10px] tracking-wide">{dateRangeLabel}</p>
          )}
        </div>
        <div className="flex bg-card border border-border rounded-pill p-0.5">
          <button
            onClick={() => setDays(7)}
            className={`font-mono text-xs px-3 py-1.5 rounded-pill transition-colors ${
              days === 7 ? "bg-olive text-text" : "text-dim hover:text-muted"
            }`}
          >
            7d
          </button>
          <button
            onClick={() => setDays(30)}
            className={`font-mono text-xs px-3 py-1.5 rounded-pill transition-colors ${
              days === 30 ? "bg-olive text-text" : "text-dim hover:text-muted"
            }`}
          >
            30d
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-card rounded-card h-32 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Task List Performance */}
          <section className="mb-10">
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
              Task List Performance
            </p>
            <div className="space-y-3">
              {data.taskLists.filter((tl) => tl.totalTasks > 0).map((taskList) => {
                const activeDays = taskList.daily.filter((d) => d.loggedCount > 0).length;
                const completionPct = Math.round(taskList.avgCompletionRate * 100);
                const variance = taskList.avgActualMins - taskList.totalProjectedMins;

                return (
                  <div key={taskList._id} className="bg-card rounded-card px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-heading text-base text-text">{taskList.name}</h3>
                      <span
                        className="font-mono text-lg font-semibold flex-shrink-0 ml-3"
                        style={{ color: completionBarColor(taskList.avgCompletionRate) }}
                      >
                        {completionPct}%
                      </span>
                    </div>

                    {taskList.avgStartMinutesUtc !== null && taskList.startTimeSampleSize >= 2 && (
                      <p className="font-mono text-[10px] text-dim mb-2">
                        Usually starts{" "}
                        <span className="text-muted">
                          ~{utcMinsToLocalTime(taskList.avgStartMinutesUtc)}
                        </span>
                        <span className="text-dim ml-1">
                          · {taskList.startTimeSampleSize}d sample
                        </span>
                      </p>
                    )}

                    <div className="flex items-center gap-2 mb-4">
                      <span className="font-mono text-xs text-dim">
                        {fmtMins(taskList.totalProjectedMins)} projected
                      </span>
                      <span className="font-mono text-dim text-xs">→</span>
                      {taskList.avgActualMins > 0 ? (
                        <>
                          <span className="font-mono text-xs text-text">
                            {fmtMins(taskList.avgActualMins)} actual avg
                          </span>
                          {variance !== 0 && (
                            <span
                              className="font-mono text-[10px] ml-auto font-medium"
                              style={{ color: variance > 0 ? "#78716c" : "#3582c1" }}
                            >
                              {variance > 0 ? `+${fmtMins(variance)}` : `-${fmtMins(Math.abs(variance))}`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="font-mono text-xs text-dim">no data yet</span>
                      )}
                    </div>

                    <TaskListChart
                      daily={taskList.daily}
                      totalTasks={taskList.totalTasks}
                      showLabels={days === 7}
                      today={data.today}
                    />

                    {days === 30 && (
                      <p className="font-mono text-[9px] text-dim mt-1.5">
                        {dateRangeLabel} · active {activeDays} of {days} days
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Task Breakdown */}
          <section>
            <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">
              Task Breakdown
            </p>
            {tasksByList.filter(({ tasks }) => tasks.length > 0).map(({ taskList, tasks }) => (
              <div key={taskList._id} className="mb-6">
                <p className="font-mono text-[10px] text-muted uppercase tracking-widest mb-2">
                  {taskList.name}
                </p>
                <div className="bg-card rounded-card px-4">
                  {tasks.map((task) => (
                    <TaskStatRow key={task._id} task={task} />
                  ))}
                </div>
              </div>
            ))}
            {data.tasks.length === 0 && (
              <div className="bg-card rounded-card px-6 py-10 text-center">
                <p className="font-mono text-dim text-sm">
                  Log some tasks to see task data here.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
