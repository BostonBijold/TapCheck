"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ListChecks, BarChart3 } from "lucide-react";
import AppIcon from "@/components/AppIcon";
import { TASK_LOG_CHANGED_EVENT } from "@/lib/task-log-events";

const LEFT_TABS = [
  { href: "/tasks",  label: "Tasks",  Icon: ListChecks },
];
const RIGHT_TABS = [
  { href: "/analytics", label: "Analytics", Icon: BarChart3  },
];

interface ActiveTimer {
  taskId: string;
  date: string;
  startedAt: string;
  pausedSeconds?: number;
  taskName: string;
  taskIcon: string;
  taskType: string;
  projectedMinutes: number;
}

const ACTIVE_TIMER_POLL_MS = 30000;

function fmtClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // ── Active-timer awareness ──────────────────────────────────────────────────
  // Checked on load, on every route change, immediately whenever a TaskLog
  // mutation happens anywhere in the app (see lib/task-log-events), and on
  // a background poll as a safety net — so the FAB reflects reality without
  // requiring a manual refresh.
  const fetchActiveTimer = useCallback(async () => {
    try {
      const res = await fetch("/api/task-logs/active");
      if (!res.ok) return;
      const data = await res.json();
      setActiveTimer(data.active ? data : null);
    } catch { /* keep previous state; next poll/event will retry */ }
  }, []);

  useEffect(() => {
    fetchActiveTimer();
  }, [pathname, fetchActiveTimer]);

  useEffect(() => {
    const onChanged = () => fetchActiveTimer();
    // Resync immediately on returning to the foreground instead of waiting up
    // to ACTIVE_TIMER_POLL_MS for the next poll — mirrors the pattern used
    // for the live clock below and for TasksView's date-resync.
    const onVisible = () => { if (document.visibilityState === "visible") fetchActiveTimer(); };
    window.addEventListener(TASK_LOG_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    // Skip the network call while backgrounded — the visibility listener
    // above already covers resyncing the moment it matters again.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") fetchActiveTimer();
    }, ACTIVE_TIMER_POLL_MS);
    return () => {
      window.removeEventListener(TASK_LOG_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(poll);
    };
  }, [fetchActiveTimer]);

  // Live clock for the resume pill — wall-clock based like the timer screens
  // themselves, not tick-counting, so it self-corrects after being backgrounded.
  useEffect(() => {
    if (!activeTimer) return;
    const tick = () => setNowTick(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [activeTimer]);

  const handleResumeTimer = () => {
    if (!activeTimer) return;
    const url = `/tasks?resumeTimer=1&date=${activeTimer.date}`;
    if (pathname === "/tasks") {
      router.replace(url);
    } else {
      router.push(url);
    }
  };

  const elapsedSeconds = activeTimer
    ? (activeTimer.pausedSeconds ?? 0) + Math.floor((nowTick - new Date(activeTimer.startedAt).getTime()) / 1000)
    : 0;
  const isCountdown = !!activeTimer && activeTimer.taskType !== "stopwatch" && activeTimer.projectedMinutes > 0;
  const targetSeconds = isCountdown ? activeTimer!.projectedMinutes * 60 : 0;
  const isOverTarget = isCountdown && elapsedSeconds >= targetSeconds;
  const clockText = activeTimer
    ? isCountdown
      ? isOverTarget
        ? `+${fmtClock(elapsedSeconds - targetSeconds)}`
        : fmtClock(targetSeconds - elapsedSeconds)
      : fmtClock(elapsedSeconds)
    : "";

  return (
    <>
      {/* Nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto max-w-mobile relative">
          {/* Active-timer resume pill — anchored to the FAB's own position
              (not the raw viewport) so it sits right against it regardless
              of safe-area insets, instead of floating at a fixed offset. */}
          {activeTimer && (
            <button
              onClick={handleResumeTimer}
              aria-label={`Resume ${activeTimer.taskName}`}
              className="absolute bottom-[94px] left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card border border-amber/40 text-text font-mono text-[11px] pl-2.5 pr-3 py-1.5 rounded-pill shadow-lg max-w-[240px] active:opacity-90 transition-opacity"
            >
              <AppIcon name={activeTimer.taskIcon} size={13} className="text-amber flex-shrink-0" />
              <span className="truncate">{activeTimer.taskName}</span>
              <span className={`flex-shrink-0 ${isOverTarget ? "text-burgundy-light" : "text-amber"}`}>
                {clockText}
              </span>
            </button>
          )}

          {/* FAB — resumes the active timer when one exists; otherwise inert */}
          <button
            onClick={activeTimer ? handleResumeTimer : undefined}
            aria-label={activeTimer ? `Resume ${activeTimer.taskName}` : undefined}
            className={`absolute left-1/2 -translate-x-1/2 -top-6 z-10 w-14 h-14 rounded-full border-4 border-bg shadow-lg flex items-center justify-center transition-all duration-200 ${
              activeTimer ? "bg-amber" : "bg-olive"
            }`}
          >
            {activeTimer ? (
              <AppIcon name={activeTimer.taskIcon} size={26} className="text-bg relative" />
            ) : (
              <Image
                src="/logo.jpeg"
                alt=""
                width={40}
                height={40}
                priority
                className="rounded-full object-cover"
              />
            )}
          </button>

          {/* Tabs */}
          <div>
            <div className="flex items-stretch h-16">
              {LEFT_TABS.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px] ${
                      active ? "text-olive" : "text-dim hover:text-muted"
                    }`}
                  >
                    <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                    <span className="font-mono text-[9px] uppercase tracking-widest leading-none">
                      {label}
                    </span>
                  </Link>
                );
              })}

              {/* FAB spacer */}
              <div className="w-20 flex-shrink-0" />

              {RIGHT_TABS.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-h-[44px] ${
                      active ? "text-olive" : "text-dim hover:text-muted"
                    }`}
                  >
                    <Icon size={20} strokeWidth={active ? 2 : 1.5} />
                    <span className="font-mono text-[9px] uppercase tracking-widest leading-none">
                      {label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
