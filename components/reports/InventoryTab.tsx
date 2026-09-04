"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface ItemTypeRow {
  _id: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  currentCount: number | null;
  lastLoggedAt: string | null;
  belowPar: boolean;
}

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

// Manager-only Reports sub-tab — Stories 5 & 6 of "Reports v2" (see
// docs/features/reports.md's addendum). The below-par callout (Story 6)
// reuses GET /api/inventory-item-types's existing belowPar/lastLoggedAt
// fields as-is; only the trend chart (Story 5) needed a new route,
// GET /api/reports/inventory.
export default function InventoryTab() {
  const [items, setItems] = useState<ItemTypeRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [days, setDays] = useState<7 | 30>(30);
  const [trend, setTrend] = useState<InventoryTrend | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    fetch("/api/inventory-item-types")
      .then((r) => r.json())
      .then((rows: ItemTypeRow[]) => {
        setItems(rows);
        // Default to the most recently logged item — reads better than
        // "All items" once a catalog grows, per the spec's own note.
        const mostRecent = [...rows]
          .filter((r) => r.lastLoggedAt)
          .sort((a, b) => (b.lastLoggedAt! > a.lastLoggedAt! ? 1 : -1))[0];
        setSelectedId((mostRecent ?? rows[0])?._id ?? "");
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setTrendLoading(true);
    setTrend(null);
    fetch(`/api/reports/inventory?itemTypeId=${selectedId}&days=${days}`)
      .then((r) => r.json())
      .then((d: InventoryTrend) => {
        setTrend(d);
        setTrendLoading(false);
      });
  }, [selectedId, days]);

  const belowPar = useMemo(() => (items ?? []).filter((it) => it.belowPar), [items]);
  const maxCount = trend ? Math.max(1, ...trend.logs.map((l) => l.count)) : 1;

  if (!items) {
    return <div className="bg-card rounded-card h-40 animate-pulse" />;
  }

  return (
    <>
      {/* Story 6 — recently-below-par callout */}
      {belowPar.length > 0 && (
        <section className="mb-8">
          <div className="bg-card rounded-card px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={13} className="text-burgundy-light" strokeWidth={2} />
              <p className="font-mono text-[10px] uppercase tracking-widest text-dim">
                Below par
              </p>
            </div>
            <div className="space-y-2">
              {belowPar.map((it) => (
                <Link
                  key={it._id}
                  href={`/inventory/${it._id}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="font-body text-sm text-text truncate">{it.name}</span>
                  <span className="font-mono text-xs text-burgundy-light flex-shrink-0">
                    {it.currentCount}
                    {it.unit ? ` ${it.unit}` : ""} / par {it.parLevel}
                    {it.lastLoggedAt && (
                      <span className="text-dim ml-1.5">· {fmtDate(it.lastLoggedAt)}</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Story 5 — item trend chart */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 min-w-0 bg-card border border-border rounded-card px-3 py-2 font-body text-sm text-text outline-none"
          >
            {items.length === 0 && <option value="">No items yet</option>}
            {items.map((it) => (
              <option key={it._id} value={it._id}>
                {it.name}
              </option>
            ))}
          </select>
          <div className="flex bg-card border border-border rounded-pill p-0.5 flex-shrink-0">
            <button
              onClick={() => setDays(7)}
              className={`font-mono text-xs px-3 py-1.5 rounded-pill transition-colors ${
                days === 7 ? "bg-olive text-text" : "text-dim hover:text-muted"
              }`}
            >
              7d
            </button>
            <button
              onClick={() => setDays(30)}
              className={`font-mono text-xs px-3 py-1.5 rounded-pill transition-colors ${
                days === 30 ? "bg-olive text-text" : "text-dim hover:text-muted"
              }`}
            >
              30d
            </button>
          </div>
        </div>

        {trendLoading && <div className="bg-card rounded-card h-32 animate-pulse" />}

        {!trendLoading && trend && (
          <div className="bg-card rounded-card px-4 pt-4 pb-3">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-heading text-base text-text">{trend.name}</h3>
              {trend.parLevel !== null && (
                <span className="font-mono text-[10px] text-dim">par {trend.parLevel}{trend.unit ? ` ${trend.unit}` : ""}</span>
              )}
            </div>

            {trend.logs.length === 0 ? (
              <p className="font-mono text-dim text-sm py-6 text-center">
                No counts logged in this window.
              </p>
            ) : (
              <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ height: 90 }}>
                {trend.logs.map((log) => {
                  const belowParBar = trend.parLevel !== null && log.count <= trend.parLevel;
                  const heightPct = Math.max(6, Math.round((log.count / maxCount) * 100));
                  return (
                    <div key={log._id} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 28 }}>
                      <span className="font-mono text-[9px] text-muted">{log.count}</span>
                      <div className="w-full flex items-end" style={{ height: 52 }}>
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: belowParBar ? "#dc2626" : "#1f63b6",
                            minHeight: 3,
                          }}
                        />
                      </div>
                      <span className="font-mono text-[8px] text-dim">{fmtDate(log.loggedAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
