"use client";

import { ArrowRight } from "lucide-react";

interface Props {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  // Fades in on a delay, matching app/welcome's splash timing — omit for
  // contexts (like QuoteScreen) where the button should just be visible.
  animate?: boolean;
  animationDelayMs?: number;
}

// Extracted from app/welcome's "Be one." button so QuoteScreen can reuse the
// exact same visual treatment verbatim.
export default function ArrowButton({ label, onClick, disabled, animate, animationDelayMs }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-2 min-h-[44px] pl-7 pr-6 py-3 rounded-full border border-gold/40 bg-gold/10 text-gold font-heading italic text-2xl transition-colors disabled:cursor-default enabled:cursor-pointer enabled:hover:bg-gold/20 enabled:hover:border-gold/60 enabled:active:bg-gold/25 ${
        animate ? "splash-beone" : ""
      }`}
      style={{
        boxShadow: "0 0 24px 0 rgba(196, 168, 74, 0.15)",
        ...(animate ? { animationDelay: `${animationDelayMs ?? 0}ms` } : {}),
      }}
    >
      {label}
      <ArrowRight size={18} strokeWidth={2} className="mt-0.5" />
    </button>
  );
}
