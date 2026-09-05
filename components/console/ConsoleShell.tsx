"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import ConsoleSidebar from "@/components/console/ConsoleSidebar";

interface Props {
  userName: string;
  isOwner: boolean;
  children: React.ReactNode;
}

// Resolves Open Question #1 from docs/features/admin-console.md: the
// Capacitor shell is server-URL mode (capacitor.config.ts), so /console is
// technically reachable inside the native iOS WebView on a phone today.
// This section is desktop-table-heavy by design, so block it explicitly
// here rather than let an owner land on it on a phone — checked client-side
// since Capacitor.isNativePlatform() has no server-side equivalent, and
// this is the same layout file the spec flagged for resolving this either
// way.
export default function ConsoleShell({ userName, isOwner, children }: Props) {
  const [isNative, setIsNative] = useState<boolean | null>(null);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  // Avoids a flash of the full desktop shell before the native check
  // resolves (synchronous in practice, but still a client-only read).
  if (isNative === null) return null;

  if (isNative) {
    return (
      <main className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-center">
        <h1 className="font-heading text-2xl text-text mb-3">Open this on a computer</h1>
        <p className="text-muted font-body text-sm max-w-sm">
          The Admin Console is built for a bigger screen — sign in from a
          desktop browser to manage locations, team access, and the
          cross-location rollup.
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-bg flex">
      <ConsoleSidebar userName={userName} isOwner={isOwner} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
