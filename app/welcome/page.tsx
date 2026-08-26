"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ArrowButton from "@/components/ArrowButton";

// Keep in sync with the animation durations in app/globals.css
// (splash-word-in, splash-fade-in).
const QUOTE_LINE_1 = ["Waste", "no", "more", "time", "arguing"];
const QUOTE_LINE_2 = ["what", "a", "good", "man", "should", "be."];
const WORD_COUNT = QUOTE_LINE_1.length + QUOTE_LINE_2.length;

const QUOTE_TOTAL_MS = 5000; // last word finishes fading in at this mark
const WORD_FADE_MS = 400; // each word's own fade-in duration
const WORD_STEP_MS = (QUOTE_TOTAL_MS - WORD_FADE_MS) / (WORD_COUNT - 1);

const PAUSE_MS = 500; // beat of silence after the quote before "Be one." appears
const BEONE_DELAY_MS = QUOTE_TOTAL_MS + PAUSE_MS;
const BEONE_DURATION_MS = 650;
const READY_MS = BEONE_DELAY_MS + BEONE_DURATION_MS;

function Word({ word, index }: { word: string; index: number }) {
  return (
    <span className="splash-word" style={{ animationDelay: `${index * WORD_STEP_MS}ms` }}>
      {word}
    </span>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    router.prefetch("/routines");
    const timer = setTimeout(() => setReady(true), READY_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="fixed inset-0 bg-bg flex items-center justify-center px-8 overflow-hidden">
      <div className="w-full max-w-mobile flex flex-col items-center text-center gap-8">
        <div className="space-y-1.5">
          <p className="font-heading italic text-text text-xl leading-snug">
            {QUOTE_LINE_1.map((word, i) => (
              <span key={word}>
                <Word word={word} index={i} />
                {i < QUOTE_LINE_1.length - 1 && " "}
              </span>
            ))}
          </p>
          <p className="font-heading italic text-text text-xl leading-snug">
            {QUOTE_LINE_2.map((word, i) => (
              <span key={word}>
                <Word word={word} index={QUOTE_LINE_1.length + i} />
                {i < QUOTE_LINE_2.length - 1 && " "}
              </span>
            ))}
          </p>
        </div>

        <Image
          src="/logo.png"
          alt="Be One"
          width={96}
          height={96}
          priority
          className="splash-logo"
          style={{ filter: "invert(1)", opacity: 0.95 }}
        />

        <ArrowButton
          label="Be one."
          disabled={!ready}
          onClick={() => router.replace("/routines")}
          animate
          animationDelayMs={BEONE_DELAY_MS}
        />
      </div>
    </main>
  );
}
