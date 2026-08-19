"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  ListChecks, Target, BarChart3, ScrollText,
  Play, CheckSquare, Sparkles, X,
} from "lucide-react";
import FABHabitSheet from "@/components/FABHabitSheet";
import FABTaskSheet from "@/components/FABTaskSheet";
import HabitIcon from "@/components/HabitIcon";
import { ROUTINE_LOG_CHANGED_EVENT } from "@/lib/routine-log-events";

const LEFT_TABS = [
  { href: "/routines",  label: "Routines",  Icon: ListChecks },
  { href: "/analytics", label: "Analytics", Icon: BarChart3  },
];
const RIGHT_TABS = [
  { href: "/goals",   label: "Goals",   Icon: Target     },
  { href: "/virtues", label: "Virtues", Icon: ScrollText },
];

// Radial layout: 3 bubbles at 130° / 90° / 50° from the horizontal axis.
// FAB center sits ~60px above the viewport bottom edge.
// Radius: 100px.  Bubble size: 56px (w-14 h-14).
const DIAL = [
  {
    key: "task",
    icon: CheckSquare,
    bg: "bg-blue-muted",
    fg: "text-text",
    left: "calc(50% - 92px)",
    bottom: 109,
    origin: "origin-bottom-right",
    delay: 0,
  },
  {
    key: "startNext",
    icon: Play,
    bg: "bg-olive",
    fg: "text-text",
    left: "calc(50% - 28px)",
    bottom: 132,
    origin: "origin-bottom",
    delay: 50,
  },
  {
    key: "habit",
    icon: Sparkles,
    bg: "bg-gold",
    fg: "text-bg",
    left: "calc(50% + 36px)",
    bottom: 109,
    origin: "origin-bottom-left",
    delay: 100,
  },
];

const DIAL_LABELS: Record<string, string> = {
  task: "Task",
  habit: "Habit",
};

interface ActiveTimer {
  routineItemId: string;
  date: string;
  startedAt: string;
  pausedSeconds?: number;
  itemName: string;
  itemIcon: string;
  itemType: string;
  projectedMinutes: number;
}

const ACTIVE_TIMER_POLL_MS = 30000;

function todayStr() {
  return new Date().toLocaleDateString("sv"); // YYYY-MM-DD in local time
}

function fmtClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [habitOpen, setHabitOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [startLabel, setStartLabel] = useState<"Start Routine" | "Continue Routine">("Start Routine");
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Determine label: "Start Routine" when no logs exist today, "Continue Routine" otherwise
  useEffect(() => {
    const date = todayStr();
    fetch(`/api/routines/start-next?date=${date}`)
      .then((r) => r.json())
      .then((data: { hasNext: boolean; hasLogs: boolean }) => {
        setStartLabel(data.hasLogs ? "Continue Routine" : "Start Routine");
      })
      .catch(() => {});
  }, []);

  // ── Active-timer awareness ──────────────────────────────────────────────────
  // Checked on load, on every route change, immediately whenever a
  // RoutineLog mutation happens anywhere in the app (see lib/routine-log-events),
  // and on a background poll as a safety net — so the FAB reflects reality
  // without requiring a manual refresh.
  const fetchActiveTimer = useCallback(async () => {
    try {
      const res = await fetch("/api/routine-logs/active");
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
    // for the live clock below and for RoutinesView's date-resync.
    const onVisible = () => { if (document.visibilityState === "visible") fetchActiveTimer(); };
    window.addEventListener(ROUTINE_LOG_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    // Skip the network call while backgrounded — the visibility listener
    // above already covers resyncing the moment it matters again.
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") fetchActiveTimer();
    }, ACTIVE_TIMER_POLL_MS);
    return () => {
      window.removeEventListener(ROUTINE_LOG_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(poll);
    };
  }, [fetchActiveTimer]);

  // The dial is meaningless while a timer owns the FAB — close it if one
  // becomes active while open (e.g. started from another tab/device).
  useEffect(() => {
    if (activeTimer) setOpen(false);
  }, [activeTimer]);

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

  const handleStartNext = async () => {
    const date = todayStr();
    const res = await fetch(`/api/routines/start-next?date=${date}`);
    const data = await res.json() as { hasNext: boolean; hasLogs: boolean };
    setStartLabel(data.hasLogs ? "Continue Routine" : "Start Routine");
    if (!data.hasNext) {
      showToast("All routines complete for today.");
      return;
    }
    const base = "/routines";
    const url = `/routines?startNext=1&date=${date}`;
    if (pathname === base) {
      router.replace(url);
    } else {
      router.push(url);
    }
  };

  const handleResumeTimer = () => {
    if (!activeTimer) return;
    const url = `/routines?resumeTimer=1&date=${activeTimer.date}`;
    if (pathname === "/routines") {
      router.replace(url);
    } else {
      router.push(url);
    }
  };

  const handleAction = (key: string) => {
    setOpen(false);
    if (key === "startNext") { handleStartNext(); return; }
    if (key === "task")      { setTaskOpen(true);  return; }
    if (key === "habit")     { setHabitOpen(true); return; }
  };

  const handleFabClick = () => {
    if (activeTimer) { handleResumeTimer(); return; }
    setOpen((v) => !v);
  };

  const elapsedSeconds = activeTimer
    ? (activeTimer.pausedSeconds ?? 0) + Math.floor((nowTick - new Date(activeTimer.startedAt).getTime()) / 1000)
    : 0;
  const isCountdown = !!activeTimer && activeTimer.itemType !== "stopwatch" && activeTimer.projectedMinutes > 0;
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
      {/* Toast */}
      {toast && (
        <div
          className="fixed z-50 left-1/2 -translate-x-1/2 font-mono text-xs text-text bg-card border border-border px-4 py-2.5 rounded-card shadow-lg pointer-events-none"
          style={{ bottom: "calc(80px + env(safe-area-inset-bottom))" }}
        >
          {toast}
        </div>
      )}

      {/* Habit sheet */}
      {habitOpen && (
        <FABHabitSheet date={todayStr()} onClose={() => setHabitOpen(false)} />
      )}

      {/* Task sheet */}
      {taskOpen && (
        <FABTaskSheet date={todayStr()} onClose={() => setTaskOpen(false)} />
      )}

      {/* Backdrop */}
      {open && !activeTimer && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Arc bubbles */}
      {!activeTimer && DIAL.map(({ key, icon: Icon, bg, fg, left, bottom, origin, delay }) => {
        const label = key === "startNext" ? startLabel : DIAL_LABELS[key] ?? key;
        return (
          <button
            key={key}
            onClick={() => handleAction(key)}
            aria-label={label}
            className={`fixed z-40 w-14 h-14 rounded-full ${bg} ${fg} flex flex-col items-center justify-center gap-0.5 shadow-lg transition-all duration-200 ${origin} ${
              open
                ? "opacity-100 scale-100 pointer-events-auto"
                : "opacity-0 scale-0 pointer-events-none"
            }`}
            style={{
              left,
              bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`,
              transitionDelay: open ? `${delay}ms` : "0ms",
            }}
          >
            <Icon size={17} strokeWidth={2} />
            <span className="font-mono text-[8px] uppercase tracking-wider leading-none text-center px-0.5">
              {label}
            </span>
          </button>
        );
      })}

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
              aria-label={`Resume ${activeTimer.itemName}`}
              className="absolute bottom-[94px] left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card border border-amber/40 text-text font-mono text-[11px] pl-2.5 pr-3 py-1.5 rounded-pill shadow-lg max-w-[240px] active:opacity-90 transition-opacity"
            >
              <HabitIcon name={activeTimer.itemIcon} size={13} className="text-amber flex-shrink-0" />
              <span className="truncate">{activeTimer.itemName}</span>
              <span className={`flex-shrink-0 ${isOverTarget ? "text-burgundy-light" : "text-amber"}`}>
                {clockText}
              </span>
            </button>
          )}

          {/* FAB */}
          <button
            onClick={handleFabClick}
            aria-label={activeTimer ? `Resume ${activeTimer.itemName}` : open ? "Close" : "Quick add"}
            className={`absolute left-1/2 -translate-x-1/2 -top-6 z-10 w-14 h-14 rounded-full border-4 border-bg shadow-lg flex items-center justify-center transition-all duration-200 ${
              activeTimer ? "bg-amber" : open ? "bg-card-hover" : "bg-olive"
            }`}
          >
            {activeTimer ? (
              <HabitIcon name={activeTimer.itemIcon} size={26} className="text-bg relative" />
            ) : open ? (
              <X size={20} className="text-muted" />
            ) : (
              <Image
                src="/jackalope_transparent.png"
                alt=""
                width={40}
                height={40}
                priority
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
