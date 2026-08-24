import Link from "next/link";
import { Check } from "lucide-react";

// The NFC-triggered equivalent of TimerScreen.tsx's completion state — same
// full-screen layout (icon, name, big centered circle, bottom action), but
// static: no timer, no drag, just confirmation that a mark-and-done habit
// (checkbox/virtue_checkin/weekly_review) was just logged. See
// docs/features/nfc.md.
export default function DoneScreen({
  name,
  icon,
  inRoutine,
}: {
  name: string;
  icon: string;
  inRoutine: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-bg z-50 flex flex-col max-w-mobile mx-auto">
      <div className="flex-1 flex flex-col items-center justify-center select-none">
        <span className="text-5xl block mb-3 leading-none">{icon}</span>
        <h2 className="font-heading text-2xl text-text mb-8">{name}</h2>

        <div className="relative w-56 h-56 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-olive" />
          <Check size={80} strokeWidth={2.5} className="relative text-bg" />
        </div>

        <p className="font-mono text-xs text-dim mt-8 uppercase tracking-widest">Done</p>
      </div>

      <div className="px-4 pb-12 w-full">
        <Link
          href="/routines"
          className={
            inRoutine
              ? "flex items-center justify-center w-full py-4 rounded-card bg-olive text-text font-body font-medium text-base"
              : "flex items-center justify-center w-full py-3.5 rounded-card border border-border-light text-muted font-body text-sm min-h-[44px]"
          }
        >
          {inRoutine ? "Continue Routine" : "Back to Routines"}
        </Link>
      </div>
    </div>
  );
}
