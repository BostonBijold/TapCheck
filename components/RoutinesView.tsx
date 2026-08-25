"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import DateNav from "@/components/DateNav";
import RoutineGroupCard, { type GroupCardGroup } from "@/components/RoutineGroupCard";
import TimerScreen, { type TimerItem } from "@/components/TimerScreen";
import RoutineSession from "@/components/RoutineSession";
import VirtueSheet, { type VirtueData } from "@/components/VirtueSheet";
import VirtueCheckInModal from "@/components/VirtueCheckInModal";
import AddHabitSheet from "@/components/AddHabitSheet";
import TodoSection, { type TodoEntry } from "@/components/TodoSection";
import EditTodoSheet from "@/components/EditTodoSheet";
import FABTaskSheet from "@/components/FABTaskSheet";
import type { LogState } from "@/models/RoutineLog";
import type { RowItem } from "@/components/RoutineItemRow";
import { isItemVisibleOn } from "@/lib/routine-visibility";
import { useTodoActions } from "@/lib/useTodoActions";
import { emitRoutineLogChanged } from "@/lib/routine-log-events";

export type RoutineItem = RowItem;
export type RoutineGroup = GroupCardGroup;

export interface RoutineLogEntry {
  _id: string;
  routineItemId: string;
  date: string;
  actualMinutes?: number;
  startedAt?: string;   // ISO string — set when timer starts; null/unset while paused
  completedAt?: string; // ISO string — set when timer finishes
  pausedSeconds?: number; // elapsed seconds banked from an earlier running segment (see models/RoutineLog)
  state: LogState;
  sessionGroupId?: string | null; // set when this in_progress timer is anchored inside a Routine Session
}

export type WeekLog = { routineItemId: string; date: string; state: LogState; actualMinutes: number | null };

interface Props {
  groups: RoutineGroup[];
  initialLogs: RoutineLogEntry[];
  initialTodos: TodoEntry[];
  weekLogs: WeekLog[];
  weekDates: string[];
  today: string;
  userName: string;
  skipAuth?: boolean;
  currentVirtue?: VirtueData | null;
  isAdmin?: boolean;
  autoStartNext?: boolean;
  autoAddHabit?: boolean;
  autoResumeTimer?: boolean;
}

interface ActiveSession {
  group: GroupCardGroup;
  startIndex: number;
}

export default function RoutinesView({
  groups, initialLogs, initialTodos, weekLogs, weekDates,
  today, userName, skipAuth,
  currentVirtue: initialVirtue = null,
  isAdmin = false,
  autoStartNext = false,
  autoAddHabit = false,
  autoResumeTimer = false,
}: Props) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(today);
  const prevTodayRef = useRef(today);
  const [virtue, setVirtue] = useState(initialVirtue);
  const [virtueOpen, setVirtueOpen] = useState(false);
  const [logs, setLogs] = useState<Record<string, RoutineLogEntry>>(
    Object.fromEntries(initialLogs.map((l) => [l.routineItemId, l]))
  );
  const [liveWeekLogs, setLiveWeekLogs] = useState<WeekLog[]>(weekLogs);
  const [timerItem, setTimerItem] = useState<TimerItem | null>(null);
  const [timerInitialElapsed, setTimerInitialElapsed] = useState(0);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [addHabitGroup, setAddHabitGroup] = useState<{ id: string; name: string } | null>(null);
  const [checkInItem, setCheckInItem] = useState<RowItem | null>(null);
  const [todos, setTodos] = useState<TodoEntry[]>(initialTodos);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoEntry | null>(null);

  const isPastDate = selectedDate !== today;

  // Split into timed routine groups and standalone habit groups
  const routineGroups = useMemo(() => groups.filter((g) => g.timeOfDay !== "habit"), [groups]);
  const habitGroups = useMemo(() => groups.filter((g) => g.timeOfDay === "habit"), [groups]);

  // Handle URL params passed from FAB navigation
  useEffect(() => {
    if (autoStartNext) {
      const logsMap = Object.fromEntries(initialLogs.map((l) => [l.routineItemId, l]));
      let found: TimerItem | null = null;
      outer: for (const g of routineGroups) {
        const visible = g.items.filter((i) => isItemVisibleOn(i, today));
        for (const item of visible) {
          if (!logsMap[item._id]) { found = item; break outer; }
        }
      }
      if (found) { setTimerInitialElapsed(0); setTimerItem(found); }
      router.replace("/routines");
    }
    if (autoAddHabit) {
      const target = habitGroups[0];
      if (target) setAddHabitGroup({ id: target._id, name: target.name });
      router.replace("/routines");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared by both resume effects below — finds the day's in_progress log.
  // Only one is ever in_progress at a time (jumping to a different item
  // inside a Routine Session pauses whatever was running instead of leaving
  // it in_progress — see switchActiveLog in lib/routine-log-actions.ts), but
  // sort defensively in case more than one ever exists transiently.
  // If it carries a sessionGroupId (set via the session itself, or the
  // external API's routineGroupId param), reopen it inside a RoutineSession
  // for that group, anchored at that item, instead of the standalone timer —
  // reproducing "tapped Start Routine and navigated to that item by hand."
  // Otherwise opens TimerScreen as before, seeded with elapsed time computed
  // from the server-recorded startedAt. Returns whether it found one.
  const openInProgressTimer = useCallback(() => {
    const inProgressLogs = initialLogs.filter((l) => l.state === "in_progress" && l.startedAt);
    const inProgressLog = inProgressLogs.sort(
      (a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime()
    )[0];
    if (!inProgressLog?.startedAt) return false;

    if (inProgressLog.sessionGroupId) {
      const group = groups.find((g) => g._id === inProgressLog.sessionGroupId);
      const startIndex = group?.items.findIndex((i) => i._id === inProgressLog.routineItemId) ?? -1;
      if (group && startIndex !== -1) {
        setActiveSession({ group, startIndex });
        return true;
      }
      // Fall through to the standalone timer if the group/item can't be
      // resolved (e.g. the group was deleted after the anchor was set).
    }

    for (const g of [...routineGroups, ...habitGroups]) {
      const item = g.items.find((i) => i._id === inProgressLog.routineItemId);
      if (item) {
        const elapsed = (inProgressLog.pausedSeconds ?? 0) + Math.max(0, Math.floor((Date.now() - new Date(inProgressLog.startedAt).getTime()) / 1000));
        setTimerInitialElapsed(elapsed);
        setTimerItem(item as TimerItem);
        return true;
      }
    }
    return false;
  }, [initialLogs, routineGroups, habitGroups, groups]);

  // Auto-resume any in_progress timer from a previous session
  useEffect(() => {
    if (autoStartNext) return; // FAB will handle timer open
    openInProgressTimer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Explicit resume request from the FAB's active-timer indicator (see
  // BottomNav.tsx) — must work even when RoutinesView was already mounted on
  // this route, unlike the mount-only effect above, since navigating to the
  // same route with a new search param doesn't remount the component.
  useEffect(() => {
    if (!autoResumeTimer) return;
    openInProgressTimer();
    router.replace("/routines");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResumeTimer]);

  // Correct for server/client timezone mismatch — server uses UTC, browser knows local date.
  useEffect(() => {
    const localDate = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
    if (localDate !== today) {
      router.replace(`/routines?date=${localDate}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run that same check whenever the app returns to the foreground, not just
  // at mount. A backgrounded/suspended PWA (the normal case on iOS — it isn't
  // killed, just frozen in memory) never remounts on its own, so without this
  // the mount-only check above can't catch the calendar day having rolled over
  // while it was asleep — you'd keep seeing last night's "today" until some
  // other navigation happened to force a reload. Only acts while viewing
  // Today; doesn't yank the user out of intentional history browsing.
  useEffect(() => {
    const recheckDate = () => {
      if (document.visibilityState !== "visible") return;
      if (selectedDate !== today) return;
      const localDate = new Date().toLocaleDateString("en-CA");
      if (localDate !== today) {
        router.replace(`/routines?date=${localDate}`);
      }
    };
    document.addEventListener("visibilitychange", recheckDate);
    window.addEventListener("focus", recheckDate);
    window.addEventListener("pageshow", recheckDate);
    return () => {
      document.removeEventListener("visibilitychange", recheckDate);
      window.removeEventListener("focus", recheckDate);
      window.removeEventListener("pageshow", recheckDate);
    };
  }, [today, selectedDate, router]);

  // If `today` changes (e.g. timezone redirect delivers a new date from the server),
  // move selectedDate forward so logs sync to the correct day.
  useEffect(() => {
    if (prevTodayRef.current !== today) {
      if (selectedDate === prevTodayRef.current) setSelectedDate(today);
      prevTodayRef.current = today;
    }
  }, [today, selectedDate]);

  // Re-fetch logs whenever the selected date changes
  useEffect(() => {
    if (selectedDate === today) {
      setLogs(Object.fromEntries(initialLogs.map((l) => [l.routineItemId, l])));
      return;
    }
    let cancelled = false;
    fetch(`/api/routine-logs?date=${selectedDate}`)
      .then((r) => r.json())
      .then((data: RoutineLogEntry[]) => {
        if (!cancelled) {
          setLogs(Object.fromEntries(data.map((l) => [l.routineItemId, l])));
        }
      });
    return () => { cancelled = true; };
  }, [selectedDate, today, initialLogs]);

  // Re-fetch to-dos whenever the selected date changes
  useEffect(() => {
    if (selectedDate === today) {
      setTodos(initialTodos);
      return;
    }
    let cancelled = false;
    fetch(`/api/todos?date=${selectedDate}`)
      .then((r) => r.json())
      .then((data: TodoEntry[]) => {
        if (!cancelled) setTodos(data);
      });
    return () => { cancelled = true; };
  }, [selectedDate, today, initialTodos]);

  // A todo stays visible on this (today's) list if it's due today, or if it's
  // an earlier undone item carried forward as overdue.
  const isTodoVisibleToday = useCallback(
    (t: TodoEntry) => t.scheduledDate === selectedDate || (!t.done && t.scheduledDate < selectedDate),
    [selectedDate]
  );
  const { toggle: handleToggleTodo, remove: handleDeleteTodo, update: handleUpdateTodo } =
    useTodoActions(todos, setTodos, isTodoVisibleToday);

  // weekLogs keyed by itemId → array of {date, state, actualMinutes}
  const weekLogsByItem: Record<string, Array<{ date: string; state: LogState; actualMinutes: number | null }>> = {};
  for (const wl of liveWeekLogs) {
    if (!weekLogsByItem[wl.routineItemId]) weekLogsByItem[wl.routineItemId] = [];
    weekLogsByItem[wl.routineItemId].push({ date: wl.date, state: wl.state, actualMinutes: wl.actualMinutes });
  }

  const handleStateChange = useCallback(
    async (
      routineItemId: string,
      newState: LogState | null,
      opts?: { actualMinutes?: number; isBackEntry?: boolean; startedAt?: string; completedAt?: string }
    ) => {
      const prev = logs[routineItemId];

      // Keep streak dots in sync without a full refresh
      const patchWeekLog = (state: LogState | null, actualMinutes: number | null = null) => {
        setLiveWeekLogs((prev) => {
          const next = prev.filter(
            (w) => !(w.routineItemId === routineItemId && w.date === selectedDate)
          );
          if (state && state !== "in_progress") {
            next.push({ routineItemId, date: selectedDate, state, actualMinutes });
          }
          return next;
        });
      };

      if (newState === null) {
        patchWeekLog(null);
        setLogs((l) => {
          const next = { ...l };
          delete next[routineItemId];
          return next;
        });
        await fetch("/api/routine-logs", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routineItemId, date: selectedDate }),
        });
      } else if (opts?.startedAt && opts?.completedAt) {
        // Manual time edit — use PATCH with explicit timestamps
        const mins = Math.max(1, Math.round(
          (new Date(opts.completedAt).getTime() - new Date(opts.startedAt).getTime()) / 60000
        ));
        patchWeekLog(newState, mins);
        const optimistic: RoutineLogEntry = {
          _id: prev?._id ?? "",
          routineItemId,
          date: selectedDate,
          state: newState,
          actualMinutes: mins,
          startedAt: opts.startedAt,
          completedAt: opts.completedAt,
        };
        setLogs((l) => ({ ...l, [routineItemId]: optimistic }));
        const res = await fetch("/api/routine-logs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routineItemId,
            date: selectedDate,
            state: newState,
            startedAt: opts.startedAt,
            completedAt: opts.completedAt,
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          setLogs((l) => ({ ...l, [routineItemId]: saved }));
        }
      } else {
        patchWeekLog(newState, opts?.actualMinutes ?? prev?.actualMinutes ?? null);
        const optimistic: RoutineLogEntry = {
          _id: prev?._id ?? "",
          routineItemId,
          date: selectedDate,
          state: newState,
          actualMinutes: opts?.actualMinutes ?? prev?.actualMinutes,
        };
        setLogs((l) => ({ ...l, [routineItemId]: optimistic }));

        const res = await fetch("/api/routine-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routineItemId,
            date: selectedDate,
            state: newState,
            actualMinutes: opts?.actualMinutes,
            isBackEntry: opts?.isBackEntry ?? isPastDate,
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          setLogs((l) => ({ ...l, [routineItemId]: saved }));
        }
      }
    },
    [logs, selectedDate, isPastDate]
  );

  // Opens the timer for an item. Creates an in_progress log on first tap;
  // resumes from stored startedAt if one already exists.
  const handleStartTimer = useCallback(
    async (item: TimerItem) => {
      const existingLog = logs[item._id];

      if (existingLog?.state === "in_progress" || existingLog?.state === "paused") {
        // Session-anchored (started via the session itself, or the external API
        // with a group id) — resuming this item means resuming the session, not
        // the standalone timer. A paused item always carries its session anchor
        // (pausing only ever happens from within an open session), and its
        // startedAt is null, so it can't be resumed as a standalone timer anyway.
        if (existingLog.sessionGroupId) {
          const group = groups.find((g) => g._id === existingLog.sessionGroupId);
          if (group) {
            const startIndex = Math.max(0, group.items.findIndex((i) => i._id === item._id));
            setActiveSession({ group, startIndex });
            return;
          }
        }
        if (existingLog.state === "in_progress" && existingLog.startedAt) {
          const elapsed = (existingLog.pausedSeconds ?? 0) + Math.max(0, Math.floor((Date.now() - new Date(existingLog.startedAt).getTime()) / 1000));
          setTimerInitialElapsed(elapsed);
          setTimerItem(item);
          return;
        }
        // Paused with no resolvable session (e.g. the group was deleted) — fall
        // through to start fresh below; the server still preserves its banked
        // time (see startInProgressLog), only the initial display resets to 0.
      }

      // Create in_progress log immediately so startedAt is server-authoritative
      const optimistic: RoutineLogEntry = {
        _id: existingLog?._id ?? "",
        routineItemId: item._id,
        date: selectedDate,
        state: "in_progress",
        startedAt: new Date().toISOString(),
      };
      setLogs((l) => ({ ...l, [item._id]: optimistic }));

      await fetch("/api/routine-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineItemId: item._id, date: selectedDate, state: "in_progress" }),
      });

      // The server also auto-completes any other dangling in_progress log for
      // this user (single-active-timer invariant, enforced in the route
      // handler) — re-fetch the whole day so that gets reflected locally too,
      // not just the item we just started.
      try {
        const res = await fetch(`/api/routine-logs?date=${selectedDate}`);
        if (res.ok) {
          const fresh: RoutineLogEntry[] = await res.json();
          setLogs(Object.fromEntries(fresh.map((l) => [l.routineItemId, l])));
        }
      } catch { /* optimistic state already applied; will resync on next refresh */ }

      emitRoutineLogChanged();
      setTimerInitialElapsed(0);
      setTimerItem(item);
    },
    [logs, selectedDate, groups]
  );

  // PATCH the in_progress log to done. Server derives actualMinutes from startedAt.
  // Falls back to client-computed actualMinutes if no server timestamp exists.
  const handleTimerComplete = useCallback(
    async (actualMinutes: number) => {
      if (!timerItem) return;
      setLogs((l) => ({
        ...l,
        [timerItem._id]: { ...(l[timerItem._id] ?? { _id: "", routineItemId: timerItem._id, date: selectedDate }), state: "done", actualMinutes },
      }));
      const res = await fetch("/api/routine-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineItemId: timerItem._id, date: selectedDate, state: "done", actualMinutes }),
      });
      if (res.ok) {
        const saved: RoutineLogEntry = await res.json();
        setLogs((l) => ({ ...l, [timerItem._id]: saved }));
      }
      emitRoutineLogChanged();
      setTimerItem(null);
    },
    [timerItem, selectedDate]
  );

  const handleTimerMissed = useCallback(async () => {
    if (!timerItem) return;
    setLogs((l) => ({
      ...l,
      [timerItem._id]: { ...(l[timerItem._id] ?? { _id: "", routineItemId: timerItem._id, date: selectedDate }), state: "missed" },
    }));
    await fetch("/api/routine-logs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routineItemId: timerItem._id, date: selectedDate, state: "missed" }),
    });
    emitRoutineLogChanged();
    setTimerItem(null);
  }, [timerItem, selectedDate]);

  const handleSessionFinish = useCallback(async () => {
    setActiveSession(null);
    // Re-fetch logs immediately so isComplete is accurate before router.refresh() arrives.
    // RoutineSession writes directly to the DB without updating the parent logs state,
    // so without this the group would briefly re-open with the Start/Continue button.
    try {
      const res = await fetch(`/api/routine-logs?date=${selectedDate}`);
      if (res.ok) {
        const fresh = (await res.json()) as RoutineLogEntry[];
        setLogs(Object.fromEntries(fresh.map((l) => [l.routineItemId, l])));
      }
    } catch { /* silent — router.refresh() below will sync eventually */ }
    router.refresh();
  }, [router, selectedDate]);

  const handleAddHabit = useCallback(
    async (
      templateId: string | null,
      name: string,
      icon: string,
      projectedMinutes: number,
      itemType: "standard" | "stopwatch" | "checkbox" = "standard",
      scheduledDays: number[] = [0, 1, 2, 3, 4, 5, 6],
      successThreshold: number = 7
    ) => {
      if (!addHabitGroup) return;
      await fetch("/api/routine-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: addHabitGroup.id,
          templateId,
          name,
          icon,
          projectedMinutes,
          itemType,
          scheduledDays,
          successThreshold,
        }),
      });
      setAddHabitGroup(null);
      router.refresh();
    },
    [addHabitGroup, router]
  );

  const totalDone = Object.values(logs).filter((l) => l.state === "done").length;
  const totalItems = groups.reduce(
    (acc, g) => acc + g.items.filter((i) => isItemVisibleOn(i, selectedDate)).length,
    0
  );

  const sessionGroup = activeSession
    ? groups.find((g) => g._id === activeSession.group._id) ?? activeSession.group
    : null;
  const sessionItems = sessionGroup
    ? sessionGroup.items.filter((i) => isItemVisibleOn(i, selectedDate))
    : [];

  return (
    <div className="min-h-dvh bg-bg">
      {timerItem && (
        <TimerScreen
          item={timerItem}
          initialElapsed={timerInitialElapsed}
          onComplete={handleTimerComplete}
          onMissed={handleTimerMissed}
          onClose={() => setTimerItem(null)}
        />
      )}

      {sessionGroup && (
        <RoutineSession
          groupId={sessionGroup._id}
          groupName={sessionGroup.name}
          groupStartTime={sessionGroup.startTime}
          items={sessionItems}
          logs={logs}
          today={selectedDate}
          startIndex={activeSession?.startIndex ?? 0}
          onClose={handleSessionFinish}
          onFinish={handleSessionFinish}
        />
      )}

      {virtue && virtueOpen && (
        <VirtueSheet
          virtue={virtue}
          isAdmin={isAdmin}
          onClose={() => setVirtueOpen(false)}
          onEssayChange={(essay) => setVirtue((v) => v ? { ...v, essay } : v)}
        />
      )}

      {addHabitGroup && (
        <AddHabitSheet
          groupId={addHabitGroup.id}
          groupName={addHabitGroup.name}
          onAdd={handleAddHabit}
          onClose={() => setAddHabitGroup(null)}
        />
      )}

      {checkInItem && (
        <VirtueCheckInModal
          thisWeekVirtue={virtue}
          date={selectedDate}
          onDone={(mins) => {
            handleStateChange(checkInItem._id, "done", { actualMinutes: mins });
            setCheckInItem(null);
          }}
          onClose={() => setCheckInItem(null)}
        />
      )}

      {addTodoOpen && (
        <FABTaskSheet
          date={selectedDate}
          startWithNoGoal
          onClose={() => setAddTodoOpen(false)}
        />
      )}

      {editingTodo && (
        <EditTodoSheet
          todo={editingTodo}
          onSave={(updates) => handleUpdateTodo(editingTodo._id, updates)}
          onDelete={() => { handleDeleteTodo(editingTodo._id); setEditingTodo(null); }}
          onClose={() => setEditingTodo(null)}
        />
      )}

      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        {/* Virtue strip */}
        {virtue && (
          <button
            onClick={() => setVirtueOpen(true)}
            className="w-full text-left bg-card border border-gold/25 rounded-card px-4 py-3 mt-6 mb-4 hover:bg-card-hover active:opacity-90 transition-colors flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-widest text-gold mb-0.5">
                This Week&apos;s Virtue
              </p>
              <p className="font-heading text-base italic text-text leading-tight truncate">
                {virtue.displayName}
              </p>
            </div>
            <span className="text-gold/60 text-sm flex-shrink-0">›</span>
          </button>
        )}

        <>
          {/* Date navigation */}
            <DateNav
              selectedDate={selectedDate}
              today={today}
              maxDaysBack={7}
              onChange={setSelectedDate}
            />

            {/* Progress bar */}
            <div className="mb-8">
              <div className="flex items-center gap-3">
                <span className="font-mono text-olive text-sm tabular-nums">
                  {totalDone}/{totalItems}
                </span>
                <div className="flex-1 h-px bg-card relative overflow-hidden rounded-full">
                  <div
                    className="absolute inset-y-0 left-0 bg-olive transition-all duration-500"
                    style={{ width: totalItems > 0 ? `${(totalDone / totalItems) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            </div>

            {/* Routine groups (morning / afternoon / evening) */}
            <div className="space-y-8">
              {routineGroups.map((group) => (
                <RoutineGroupCard
                  key={`${group._id}-${selectedDate}`}
                  group={group}
                  logs={logs}
                  weekLogs={weekLogsByItem}
                  weekDates={weekDates}
                  isPastDate={isPastDate}
                  selectedDate={selectedDate}
                  today={today}
                  onStateChange={handleStateChange}
                  onStartTimer={handleStartTimer}
                  onStartRoutine={(g, startIndex) => setActiveSession({ group: g, startIndex })}
                  onOpenCheckIn={(item) => setCheckInItem(item)}
                  onOpenReview={() => router.push(`/virtues?mode=weekly&date=${selectedDate}&return=routines`)}
                  onOpenRoutineReview={() => router.push(`/routines/review?date=${selectedDate}&entryPoint=sunday_prompt&return=routines`)}
                />
              ))}

              <Link
                href="/routines/new"
                className="flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-3.5 rounded-card hover:border-olive/40 hover:text-olive transition-colors min-h-[44px]"
              >
                + Add New Routine
              </Link>
            </div>

            {/* To-dos for the day */}
            <TodoSection
              todos={todos}
              viewingDate={selectedDate}
              onToggle={handleToggleTodo}
              onDelete={handleDeleteTodo}
              onEdit={setEditingTodo}
              onAdd={() => setAddTodoOpen(true)}
            />

            {/* Standalone habits section */}
            {(habitGroups.length > 0) && (
              <div className="mt-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
                    Habits
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <button
                    onClick={() => {
                      const target = habitGroups[0];
                      if (target) setAddHabitGroup({ id: target._id, name: target.name });
                    }}
                    className="font-mono text-[10px] text-olive hover:text-olive-light transition-colors"
                  >
                    + Add
                  </button>
                </div>

                <div className="space-y-8">
                  {habitGroups.map((group) => (
                    <RoutineGroupCard
                      key={`${group._id}-${selectedDate}`}
                      group={group}
                      logs={logs}
                      weekLogs={weekLogsByItem}
                      weekDates={weekDates}
                      isPastDate={isPastDate}
                      selectedDate={selectedDate}
                      today={today}
                      onStateChange={handleStateChange}
                      onStartTimer={handleStartTimer}
                      onStartRoutine={() => {}}
                      onOpenCheckIn={(item) => setCheckInItem(item)}
                      onOpenReview={() => router.push(`/virtues?mode=weekly&date=${selectedDate}&return=routines`)}
                      onOpenRoutineReview={() => router.push(`/routines/review?date=${selectedDate}&entryPoint=sunday_prompt&return=routines`)}
                    />
                  ))}
                </div>

                {habitGroups.every((g) => g.items.length === 0) && (
                  <button
                    onClick={() => {
                      const target = habitGroups[0];
                      if (target) setAddHabitGroup({ id: target._id, name: target.name });
                    }}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-5 rounded-card hover:border-olive/40 hover:text-olive transition-colors min-h-[44px]"
                  >
                    + Add your first habit
                  </button>
                )}
              </div>
            )}

            {groups.length === 0 && (
              <div className="text-center py-20">
                <p className="text-muted text-sm">No routines yet.</p>
              </div>
            )}
          </>
      </div>
    </div>
  );
}
