"use client";

import { useNetworkStatus } from "@/components/NetworkStatusProvider";

// Persistent status indicator — see docs/features/offline.md. Renders
// nothing when online with an empty outbox; shows either the offline state
// or a "still syncing" state otherwise (isOnline but pendingCount > 0
// covers the brief window between reconnecting and the queue flush
// finishing).
export default function OfflineBanner() {
  const { isOnline, pendingCount } = useNetworkStatus();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className="mx-4 mt-2 rounded-lg border border-amber bg-amber/10 px-3 py-2 text-sm text-amber">
      {isOnline
        ? `Syncing ${pendingCount} change${pendingCount === 1 ? "" : "s"}…`
        : pendingCount > 0
          ? `Offline — ${pendingCount} change${pendingCount === 1 ? "" : "s"} pending sync`
          : "Offline — changes will sync when reconnected"}
    </div>
  );
}
