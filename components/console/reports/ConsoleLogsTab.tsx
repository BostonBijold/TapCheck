"use client";

import { useEffect, useState } from "react";
import AppIcon from "@/components/AppIcon";
import { BADGE, LABEL } from "@/components/TaskRow";
import type { LogState } from "@/models/TaskLog";

interface HistoryLog {
  _id: string;
  date: string;
  state: LogState;
  actualMinutes: number | null;
  completedAt: string | null;
  startedAt: string | null;
  taskId: string;
  taskName: string;
  taskIcon: string;
  taskType: string;
  taskListId: string;
  taskListName: string;
  performedByUserId: string;
  performedByName: string;
  note: string | null;
  isBackEntry: boolean;
}

interface HistoryResponse {
  logs: HistoryLog[];
  page: number;
  limit: number;
  hasMore: boolean;
  totalCount: number;
}

interface TeamMember {
  _id: string;
  name: string;
}

interface TaskListOption {
  _id: string;
  name: string;
}

function trailingWindow(daysBack: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (daysBack - 1));
  const fmt = (d: Date) => d.toLocaleDateString("en-CA");
  return { startDate: fmt(start), endDate: fmt(end) };
}

function fmtLogTimestamp(log: HistoryLog): string {
  const iso = log.completedAt ?? log.startedAt;
  if (!iso) return new Date(log.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtMins(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Desktop-shaped Logs tab — same GET /api/task-logs/history data as
// mobile's LogsTab.tsx (stacked divide-y rows), rendered here as a real
// data table, matching the console's existing table convention
// (TeamTable.tsx/RollupTable.tsx). Every console viewer is manager-or-
// above, so this always shows the team-member filter and every
// performer's name — no employee-personal variant to branch on, unlike
// mobile. See docs/features/console-reports.md.
export default function ConsoleLogsTab() {
  const initialWindow = trailingWindow(14);
  const [startDate, setStartDate] = useState(initialWindow.startDate);
  const [endDate, setEndDate] = useState(initialWindow.endDate);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedTaskListId, setSelectedTaskListId] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [taskLists, setTaskLists] = useState<TaskListOption[]>([]);
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetch("/api/team").then((r) => r.json()).then((users: TeamMember[]) => setTeamMembers(users));
    fetch("/api/task-lists")
      .then((r) => r.json())
      .then((lists: TaskListOption[]) => setTaskLists(lists.map((l) => ({ _id: l._id, name: l.name }))));
  }, []);

  const fetchPage = (targetPage: number, replace: boolean) => {
    const params = new URLSearchParams({ startDate, endDate, page: String(targetPage) });
    if (selectedUserId) params.set("userId", selectedUserId);
    if (selectedTaskListId) params.set("taskListId", selectedTaskListId);

    if (replace) setLoading(true); else setLoadingMore(true);
    fetch(`/api/task-logs/history?${params.toString()}`)
      .then((r) => r.json())
      .then((d: HistoryResponse) => {
        setLogs((prev) => (replace ? d.logs : [...prev, ...d.logs]));
        setHasMore(d.hasMore);
        setPage(d.page);
        setLoading(false);
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedUserId, selectedTaskListId]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input
          type="date"
          value={startDate}
          max={endDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-card border border-border rounded-card px-3 py-2 font-mono text-xs text-text"
        />
        <input
          type="date"
          value={endDate}
          min={startDate}
          max={new Date().toLocaleDateString("en-CA")}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-card border border-border rounded-card px-3 py-2 font-mono text-xs text-text"
        />
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="flex-1 bg-card border border-border rounded-card px-3 py-2 font-mono text-xs text-text"
        >
          <option value="">All team members</option>
          {teamMembers.map((m) => (
            <option key={m._id} value={m._id}>{m.name}</option>
          ))}
        </select>
        <select
          value={selectedTaskListId}
          onChange={(e) => setSelectedTaskListId(e.target.value)}
          className="flex-1 bg-card border border-border rounded-card px-3 py-2 font-mono text-xs text-text"
        >
          <option value="">All lists</option>
          {taskLists.map((tl) => (
            <option key={tl._id} value={tl._id}>{tl.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-card h-11 animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-card border border-border rounded-card px-6 py-10 text-center">
          <p className="font-mono text-dim text-sm">No logs in this range.</p>
        </div>
      ) : (
        <div className="border border-border rounded-card overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card-hover text-left">
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Task</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">List</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Performed By</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">When</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">State</th>
                <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Minutes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <AppIcon name={log.taskIcon} size={14} className="text-muted flex-shrink-0" />
                      <span className="font-body text-sm text-text">{log.taskName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{log.taskListName}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    {log.performedByName}
                    {log.isBackEntry && <span className="text-dim"> · back-entry</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-dim">{fmtLogTimestamp(log)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded-pill ${BADGE[log.state]}`}>{LABEL[log.state]}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    {log.state === "done" && log.actualMinutes != null ? fmtMins(log.actualMinutes) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => fetchPage(page + 1, false)}
          disabled={loadingMore}
          className="w-full mt-4 font-mono text-xs text-dim hover:text-muted py-2 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
