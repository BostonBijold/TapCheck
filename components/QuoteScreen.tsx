"use client";

import { useEffect, useRef, useState } from "react";
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

const MIN_READ_MS: Record<LengthTier, number> = {
  short: 4000,
  medium: 6000,
  long: 8000,
};

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
  const [minTimerDone, setMinTimerDone] = useState(mode === "on-demand");
  // For "loading" mode: what tier to size the minimum-read timer on, once
  // known — falls back to "medium" if the fetch comes back empty or fails,
  // so a missing quote can never permanently block dismissal.
  const [resolvedTier, setResolvedTier] = useState<LengthTier | null>(mode === "on-demand" ? "medium" : null);
  // The /routines page this screen sits on top of is server-rendered with
  // its data already in the same response this component hydrates from, so
  // there's no separate client fetch to wait on today — this flips true on
  // the next frame after mount. Kept as its own flag (rather than assumed
  // true) so a future client-fetched data source can wire in real readiness
  // here without touching anything else in this component.
  const [dataReady, setDataReady] = useState(mode === "on-demand");
  const [waitingForData, setWaitingForData] = useState(false);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuote = () => {
    setFetching(true);
    const url = mode === "loading" ? `/api/quotes/today?date=${todayLocalDate()}` : "/api/quotes/random";
    fetch(url)
      .then((r) => r.json())
      .then((data: { quote: QuoteDTO | null }) => {
        setQuote(data.quote);
        setFetching(false);
        if (mode === "loading") setResolvedTier(data.quote?.lengthTier ?? "medium");
      })
      .catch(() => {
        setFetching(false);
        if (mode === "loading") setResolvedTier("medium");
      });
  };

  useEffect(() => {
    fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "loading" || !resolvedTier) return;
    timerRef.current = setTimeout(() => setMinTimerDone(true), MIN_READ_MS[resolvedTier]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [mode, resolvedTier]);

  useEffect(() => {
    if (mode !== "loading") return;
    const raf = requestAnimationFrame(() => setDataReady(true));
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  // Once the underlying page becomes ready while we were sitting in the
  // "tapped dismiss but had to wait" state, finish the dismissal.
  useEffect(() => {
    if (waitingForData && dataReady) {
      setClosing(true);
      const t = setTimeout(onDismiss, 300);
      return () => clearTimeout(t);
    }
  }, [waitingForData, dataReady, onDismiss]);

  const canDismiss = mode === "on-demand" || minTimerDone;

  const handleDismiss = () => {
    if (!canDismiss || waitingForData) return;
    if (mode === "loading" && !dataReady) {
      setWaitingForData(true);
      return;
    }
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
        paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))",
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

      <div className="flex flex-col items-center gap-2">
        <ArrowButton
          label="Be one."
          disabled={!canDismiss || waitingForData}
          onClick={handleDismiss}
        />
        {waitingForData && (
          <p className="font-mono text-[10px] text-dim animate-pulse">Just a moment…</p>
        )}
      </div>
    </div>
  );
}
