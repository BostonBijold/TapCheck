"use client";

interface InventoryLogPoint {
  _id: string;
  count: number;
  loggedAt: string;
}

interface InventoryTrend {
  itemTypeId: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  logs: InventoryLogPoint[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Desktop-card variant of mobile's InventoryTab.tsx TrendChart — same
// custom-CSS-bar approach (no charting library), bar height normalized to
// this item's own window max, a below-par bar tinted red. Sized to sit
// inside a grid card rather than under a full-width list row.
export default function InventoryTrendChart({ trend, loading }: { trend: InventoryTrend | undefined; loading: boolean }) {
  if (!trend) {
    return loading ? <div className="h-[64px] bg-bg rounded-card animate-pulse" /> : null;
  }
  if (trend.logs.length === 0) {
    return <p className="font-mono text-dim text-[10px]">No counts logged in this window.</p>;
  }
  const maxCount = Math.max(1, ...trend.logs.map((l) => l.count));
  return (
    <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 64 }}>
      {trend.logs.map((log) => {
        const belowParBar = trend.parLevel !== null && log.count <= trend.parLevel;
        const heightPct = Math.max(6, Math.round((log.count / maxCount) * 100));
        return (
          <div key={log._id} className="flex flex-col items-center gap-0.5 flex-shrink-0" style={{ width: 20 }}>
            <span className="font-mono text-[8px] text-muted">{log.count}</span>
            <div className="w-full flex items-end" style={{ height: 36 }}>
              <div
                className="w-full rounded-sm"
                style={{ height: `${heightPct}%`, backgroundColor: belowParBar ? "#dc2626" : "#1f63b6", minHeight: 3 }}
              />
            </div>
            <span className="font-mono text-[7px] text-dim">{fmtDate(log.loggedAt)}</span>
          </div>
        );
      })}
    </div>
  );
}
