"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface LocationRow {
  locationId: string;
  locationName: string;
  avgCompletionRate: number;
  totalTasksLogged: number;
  missedTaskListCount: number;
  belowParItemCount: number;
  activeEmployeeCount: number;
}

interface RollupResponse {
  dates: string[];
  days: number;
  today: string;
  locations: LocationRow[];
  companyTotals: {
    avgCompletionRate: number;
    totalTasksLogged: number;
    missedTaskListCount: number;
    belowParItemCount: number;
  };
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function StatTile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="border border-border rounded-card bg-card p-4">
      <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-1">{label}</p>
      <p className={`font-heading text-2xl ${warn ? "text-burgundy-light" : "text-text"}`}>{value}</p>
    </div>
  );
}

// Cross-location snapshot table — the genuinely new surface this console
// exists to build (see docs/features/admin-console.md's Phase 2; every
// other section reuses existing mobile-app APIs, this one is net-new). A
// snapshot only: no trend-over-time chart, no CSV export, no per-location
// target overrides — all explicitly deferred in the spec.
export default function RollupTable() {
  const router = useRouter();
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<RollupResponse | null>(null);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  useEffect(() => {
    const localDate = new Date().toISOString().split("T")[0];
    setData(null);
    fetch(`/api/reports/rollup?days=${days}&localDate=${localDate}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [days]);

  // Reuses the exact same endpoint the mobile location switcher calls
  // (see components/LocationSwitcher.tsx), then navigates into the
  // existing single-location Reports view rather than rebuilding that
  // detail view a second time inside the console — see the spec's
  // "Row click" note.
  const handleRowClick = async (locationId: string) => {
    setNavigatingId(locationId);
    await fetch("/api/session/active-location", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId }),
    });
    router.push("/reports");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl text-text mb-1">Rollup Dashboard</h1>
          <p className="font-body text-sm text-muted">At a glance across every store.</p>
        </div>
        <div className="flex gap-1 bg-card-hover rounded-pill p-1">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-1.5 rounded-pill font-mono text-xs transition-colors ${
                days === d ? "bg-olive text-text" : "text-muted"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <p className="text-dim font-mono text-xs text-center py-8">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatTile label="Avg Completion" value={pct(data.companyTotals.avgCompletionRate)} />
            <StatTile label="Tasks Logged" value={String(data.companyTotals.totalTasksLogged)} />
            <StatTile
              label="Missed Lists"
              value={String(data.companyTotals.missedTaskListCount)}
              warn={data.companyTotals.missedTaskListCount > 0}
            />
            <StatTile
              label="Below Par"
              value={String(data.companyTotals.belowParItemCount)}
              warn={data.companyTotals.belowParItemCount > 0}
            />
          </div>

          <div className="border border-border rounded-card overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card-hover text-left">
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Location</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Completion</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Logged</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Missed Lists</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Below Par</th>
                  <th className="font-mono text-[10px] text-dim uppercase tracking-widest px-4 py-3">Employees</th>
                </tr>
              </thead>
              <tbody>
                {data.locations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-dim font-mono text-xs">No locations yet.</td>
                  </tr>
                ) : (
                  data.locations.map((loc) => (
                    <tr
                      key={loc.locationId}
                      onClick={() => handleRowClick(loc.locationId)}
                      className="border-b border-border last:border-b-0 cursor-pointer hover:bg-card-hover transition-colors"
                    >
                      <td className="px-4 py-3 text-text font-body">
                        {navigatingId === loc.locationId ? "Opening…" : loc.locationName}
                      </td>
                      <td className="px-4 py-3 text-muted font-mono text-xs">{pct(loc.avgCompletionRate)}</td>
                      <td className="px-4 py-3 text-muted font-mono text-xs">{loc.totalTasksLogged}</td>
                      <td className={`px-4 py-3 font-mono text-xs ${loc.missedTaskListCount > 0 ? "text-burgundy-light" : "text-muted"}`}>
                        {loc.missedTaskListCount}
                      </td>
                      <td className={`px-4 py-3 font-mono text-xs ${loc.belowParItemCount > 0 ? "text-burgundy-light" : "text-muted"}`}>
                        {loc.belowParItemCount}
                      </td>
                      <td className="px-4 py-3 text-muted font-mono text-xs">{loc.activeEmployeeCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
