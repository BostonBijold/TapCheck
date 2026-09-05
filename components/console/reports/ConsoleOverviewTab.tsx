"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import AppIcon from "@/components/AppIcon";
import TaskListMiniChart from "@/components/console/reports/TaskListMiniChart";
import {
  fmtMins,
  utcMinsToLocalTime,
  completionBarColor,
  PACING,
  type ReportsData,
} from "@/components/reports/shared";

interface RankedRow {
  userId: string;
  name: string;
  doneCount: number;
  missedCount: number;
  onTimeCount: number;
  lateCount: number;
  engaged: number;
  completionRate: number;
}

interface InsufficientRow {
  userId: string;
  name: string;
  doneCount: number;
  missedCount: number;
}

interface LeaderboardData {
  ranked: RankedRow[];
  insufficientData: InsufficientRow[];
}

function StatTile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border border-border rounded-card bg-card p-4">
      <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-1">{label}</p>
      <p className={`font-heading text-2xl ${warn ? "text-burgundy-light" : "text-text"}`}>{value}</p>
    </div>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Desktop-shaped Overview — same GET /api/reports + GET
// /api/reports/leaderboard data as mobile's ManagerOverview.tsx/
// Leaderboard.tsx/ExceptionCallouts.tsx, laid out for the extra width a
// console page has: a stat strip up top, exception callouts side by side
// instead of stacked, the leaderboard as a full data table instead of
// expand-per-row, and Task List Performance as a card grid instead of a
// single column. Every console viewer is manager-or-above already, so
// this is always the manager-shaped view (no EmployeeOverview
// equivalent). See docs/features/console-reports.md.
export default function ConsoleOverviewTab() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<ReportsData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);

  useEffect(() => {
    setData(null);
    setLeaderboard(null);
    const localDate = new Date().toLocaleDateString("en-CA");
    fetch(`/api/reports?days=${days}&localDate=${localDate}`).then((r) => r.json()).then(setData);
    fetch(`/api/reports/leaderboard?days=${days}&localDate=${localDate}`).then((r) => r.json()).then(setLeaderboard);
  }, [days]);

  if (!data) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card rounded-card h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  const activeLists = data.taskLists.filter((tl) => tl.totalTasks > 0);
  const avgCompletion = activeLists.length > 0
    ? activeLists.reduce((s, tl) => s + tl.avgCompletionRate, 0) / activeLists.length
    : 0;
  const tasksLogged = data.tasks.reduce((s, t) => s + t.doneCount + t.missedCount + t.restCount, 0);

  const worstLists = data.taskLists
    .filter((tl) => tl.totalTasks > 0 && tl.avgCompletionRate < 0.9)
    .sort((a, b) => a.avgCompletionRate - b.avgCompletionRate)
    .slice(0, 3);
  const varianceOutliers = data.tasks
    .filter((t) => t.engagedDays >= 3 && t.avgVariance !== null)
    .sort((a, b) => Math.abs(b.avgVariance!) - Math.abs(a.avgVariance!))
    .slice(0, 3);

  const tasksByList = data.taskLists.map((tl) => ({
    taskList: tl,
    tasks: data.tasks.filter((t) => t.taskListId === tl._id),
  }));

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <div className="flex bg-card border border-border rounded-pill p-0.5">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`font-mono text-xs px-4 py-1.5 rounded-pill transition-colors ${
                days === d ? "bg-olive text-text" : "text-dim hover:text-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatTile label="Avg Completion" value={`${Math.round(avgCompletion * 100)}%`} />
        <StatTile label="Tasks Logged" value={String(tasksLogged)} />
        <StatTile label="Needs Attention" value={String(worstLists.length)} warn={worstLists.length > 0} />
        <StatTile label="Timing Outliers" value={String(varianceOutliers.length)} warn={varianceOutliers.length > 0} />
      </div>

      {(worstLists.length > 0 || varianceOutliers.length > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {worstLists.length > 0 && (
            <div className="bg-card border border-border rounded-card px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={13} className="text-burgundy-light" strokeWidth={2} />
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim">Needs attention</p>
              </div>
              <div className="space-y-1.5">
                {worstLists.map((tl) => (
                  <button
                    key={tl._id}
                    type="button"
                    onClick={() => scrollTo(`tasklist-${tl._id}`)}
                    className="w-full flex items-center justify-between gap-2 text-left"
                  >
                    <span className="font-body text-sm text-text truncate">{tl.name}</span>
                    <span className="font-mono text-xs text-burgundy-light flex-shrink-0">
                      {Math.round(tl.avgCompletionRate * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {varianceOutliers.length > 0 && (
            <div className="bg-card border border-border rounded-card px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={13} className="text-amber" strokeWidth={2} />
                <p className="font-mono text-[10px] uppercase tracking-widest text-dim">Timing outliers</p>
              </div>
              <div className="space-y-1.5">
                {varianceOutliers.map((t) => {
                  const running = t.avgVariance! > 0;
                  return (
                    <button
                      key={t._id}
                      type="button"
                      onClick={() => scrollTo(`task-${t._id}`)}
                      className="w-full flex items-center justify-between gap-2 text-left"
                    >
                      <span className="font-body text-sm text-text truncate">{t.name}</span>
                      <span className={`font-mono text-xs flex-shrink-0 flex items-center gap-1 ${running ? "text-tobacco" : "text-gold"}`}>
                        {running ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {running ? `+${t.avgVariance}m long` : `${t.avgVariance}m fast`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {leaderboard && (leaderboard.ranked.length > 0 || leaderboard.insufficientData.length > 0) && (
        <section className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">Team Leaderboard</p>
          <div className="border border-border rounded-card overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-hover text-left">
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3 w-8">#</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Name</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Done / Engaged</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">On-time</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Late</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Missed</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Completion</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.ranked.map((row, i) => (
                  <tr key={row.userId} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs text-dim">{i + 1}</td>
                    <td className="px-4 py-3 text-text font-body">{row.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{row.doneCount}/{row.engaged}</td>
                    <td className="px-4 py-3 font-mono text-xs text-olive">{row.onTimeCount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-amber">{row.lateCount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-burgundy-light">{row.missedCount}</td>
                    <td className="px-4 py-3 font-mono text-sm font-semibold" style={{ color: completionBarColor(row.completionRate) }}>
                      {Math.round(row.completionRate * 100)}%
                    </td>
                  </tr>
                ))}
                {leaderboard.insufficientData.map((row) => (
                  <tr key={row.userId} className="border-b border-border last:border-b-0 opacity-50">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-text font-body">{row.name}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-dim" colSpan={5}>Not enough data</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-10">
        <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">Task List Performance</p>
        <div className="grid grid-cols-2 gap-3">
          {activeLists.map((taskList) => {
            const variance = taskList.avgActualMins - taskList.totalProjectedMins;
            return (
              <div key={taskList._id} id={`tasklist-${taskList._id}`} className="bg-card border border-border rounded-card px-4 pt-4 pb-3">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-heading text-base text-text">{taskList.name}</h3>
                  <span className="font-mono text-lg font-semibold flex-shrink-0 ml-3" style={{ color: completionBarColor(taskList.avgCompletionRate) }}>
                    {Math.round(taskList.avgCompletionRate * 100)}%
                  </span>
                </div>
                {taskList.avgStartMinutesUtc !== null && taskList.startTimeSampleSize >= 2 && (
                  <p className="font-mono text-[10px] text-dim mb-2">
                    Usually starts <span className="text-muted">~{utcMinsToLocalTime(taskList.avgStartMinutesUtc)}</span>
                    <span className="text-dim ml-1">· {taskList.startTimeSampleSize}d sample</span>
                  </p>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-mono text-xs text-dim">{fmtMins(taskList.totalProjectedMins)} projected</span>
                  <span className="font-mono text-dim text-xs">→</span>
                  {taskList.avgActualMins > 0 ? (
                    <>
                      <span className="font-mono text-xs text-text">{fmtMins(taskList.avgActualMins)} actual avg</span>
                      {variance !== 0 && (
                        <span className="font-mono text-[10px] ml-auto font-medium" style={{ color: variance > 0 ? "#78716c" : "#3582c1" }}>
                          {variance > 0 ? `+${fmtMins(variance)}` : `-${fmtMins(Math.abs(variance))}`}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="font-mono text-xs text-dim">no data yet</span>
                  )}
                </div>
                <TaskListMiniChart daily={taskList.daily} totalTasks={taskList.totalTasks} today={data.today} />
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-3">Task Breakdown</p>
        {tasksByList.filter(({ tasks }) => tasks.length > 0).map(({ taskList, tasks }) => (
          <div key={taskList._id} className="mb-6">
            <p className="font-mono text-[10px] text-muted uppercase tracking-widest mb-2">{taskList.name}</p>
            <div className="border border-border rounded-card overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card-hover text-left">
                    <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-2.5">Task</th>
                    <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-2.5">Done</th>
                    <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-2.5">Missed</th>
                    <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-2.5">Rest</th>
                    <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-2.5">Unlogged</th>
                    <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-2.5">Avg Actual</th>
                    <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-2.5">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const wp = task.weeklyProgress;
                    const varianceColor =
                      task.avgVariance === null ? "text-dim"
                      : task.avgVariance > 5 ? "text-tobacco"
                      : task.avgVariance < -5 ? "text-gold"
                      : "text-dim";
                    return (
                      <tr key={task._id} id={`task-${task._id}`} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <AppIcon name={task.icon} size={14} strokeWidth={1.75} className="text-muted flex-shrink-0" />
                            <span className="font-body text-sm text-text">{task.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-olive">{task.doneCount}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-burgundy-light">{task.missedCount}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-blue-muted">{task.restCount}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-dim">{task.unloggedCount}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {task.avgActualMins !== null ? (
                            <span className="text-text">
                              {task.avgActualMins}m
                              {task.avgVariance !== null && task.avgVariance !== 0 && (
                                <span className={`ml-1.5 font-medium ${varianceColor}`}>
                                  {task.avgVariance > 0 ? `+${task.avgVariance}m` : `${task.avgVariance}m`}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-dim">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {wp ? (
                            <span style={{ color: PACING[wp.pacing].color }}>
                              {wp.successCount}/{wp.successThreshold} · {PACING[wp.pacing].label}
                            </span>
                          ) : (
                            <span style={{ color: completionBarColor(task.completionRate) }}>
                              {task.engagedDays > 0 ? `${Math.round(task.completionRate * 100)}%` : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {data.tasks.length === 0 && (
          <div className="bg-card border border-border rounded-card px-6 py-10 text-center">
            <p className="font-mono text-dim text-sm">Log some tasks to see task data here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
