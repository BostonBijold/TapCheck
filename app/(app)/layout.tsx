"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import QuoteScreen from "@/components/QuoteScreen";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // This layout mounts fresh exactly once per cold entry into the
  // authenticated app shell (e.g. from /welcome) and then persists,
  // unremounted, across every client-side nav between its nested routes —
  // so this state naturally shows the loading screen on cold launch only,
  // the same "mounts once, gated by lifecycle rather than storage" pattern
  // NativeBootstrap uses.
  const [showLoadingQuote, setShowLoadingQuote] = useState(true);

  // The scroll container below is shared across every nested route (this
  // layout never remounts on client-side nav), so without this its
  // scrollTop carries over from whatever page you left — e.g. landing on
  // Goals still scrolled halfway down from Routines. Reset it to the top
  // whenever the route changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <div ref={scrollRef} className="app-scroll h-full overflow-y-auto overscroll-none">
        {children}
      </div>
      <BottomNav />
      {showLoadingQuote && (
        <QuoteScreen mode="loading" onDismiss={() => setShowLoadingQuote(false)} />
      )}
    </>
  );
}
