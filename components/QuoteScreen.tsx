"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import ArrowButton from "@/components/ArrowButton";

type LengthTier = "short" | "medium" | "long";

interface QuoteDTO {
  _id: string;
  text: string;
  author: string;
  genre: string;
  virtue: string | null;
  virtueDayIndex: number | null;
  source: string | null;
  lengthTier: LengthTier;
}

interface Props {
  mode: "loading" | "on-demand";
  onDismiss: () => void;
}

const TEXT_SIZE: Record<LengthTier, string> = {
  short: "text-3xl",
  medium: "text-2xl",
  long: "text-lg leading-relaxed",
};

function todayLocalDate() {
  return new Date().toLocaleDateString("sv"); // YYYY-MM-DD in local time
}

export default function QuoteScreen({ mode, onDismiss }: Props) {
  const [quote, setQuote] = useState<QuoteDTO | null>(null);
  const [fetching, setFetching] = useState(true);
  // The /routines page this screen sits on top of is server-rendered with
  // its data already in the same response this component hydrates from, so
  // there's no separate client fetch to wait on today — this flips true on
  // the next frame after mount. Kept as its own flag (rather than assumed
  // true) so a future client-fetched data source can wire in real readiness
  // here without touching anything else in this component. No minimum read
  // time — the button appears the moment routines is ready, and it's the
  // user's call whether to read the quote or dismiss it immediately.
  const [dataReady, setDataReady] = useState(mode === "on-demand");
  const [closing, setClosing] = useState(false);

  const fetchQuote = () => {
    setFetching(true);
    const url = mode === "loading" ? `/api/quotes/today?date=${todayLocalDate()}` : "/api/quotes/random";
    fetch(url)
      .then((r) => r.json())
      .then((data: { quote: QuoteDTO | null }) => setQuote(data.quote))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "loading") return;
    const raf = requestAnimationFrame(() => setDataReady(true));
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const canDismiss = mode === "on-demand" || dataReady;

  const handleDismiss = () => {
    if (!canDismiss) return;
    setClosing(true);
    setTimeout(onDismiss, 300);
  };

  const handleReroll = () => {
    if (mode !== "on-demand") return;
    fetchQuote();
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-bg flex flex-col items-center justify-between px-8 transition-opacity duration-300 ${
        closing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        paddingTop: "calc(2.5rem + env(safe-area-inset-top))",
        paddingBottom: "calc(6rem + env(safe-area-inset-bottom))",
      }}
    >
      <button
        type="button"
        onClick={handleReroll}
        disabled={mode !== "on-demand"}
        aria-label={mode === "on-demand" ? "Show another quote" : undefined}
        className={mode === "on-demand" ? "cursor-pointer" : "cursor-default"}
      >
        <Image
          src="/logo.png"
          alt=""
          width={56}
          height={56}
          priority={mode === "loading"}
          style={{ filter: "invert(1)", opacity: 0.95 }}
        />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-mobile gap-4 mx-auto">
        {quote ? (
          <>
            <p className={`font-heading italic text-text ${TEXT_SIZE[quote.lengthTier]}`}>
              &ldquo;{quote.text}&rdquo;
            </p>
            <p className="font-mono text-xs uppercase tracking-widest text-muted">
              — {quote.author}
            </p>
          </>
        ) : fetching ? (
          <p className="font-mono text-xs text-dim">Loading…</p>
        ) : (
          <p className="font-mono text-xs text-dim">No quote found.</p>
        )}
      </div>

      <ArrowButton
        label="Be one."
        disabled={!canDismiss}
        onClick={handleDismiss}
      />
    </div>
  );
}
