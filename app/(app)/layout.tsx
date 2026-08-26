"use client";

import { useState } from "react";
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

  return (
    <>
      <div className="app-scroll h-full overflow-y-auto overscroll-none">
        {children}
      </div>
      <BottomNav />
      {showLoadingQuote && (
        <QuoteScreen mode="loading" onDismiss={() => setShowLoadingQuote(false)} />
      )}
    </>
  );
}
