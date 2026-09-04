"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Package, Search, TriangleAlert } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface ItemTypeRow {
  _id: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  groupId: string | null;
  currentCount: number | null;
  lastLoggedAt: string | null;
  lastLoggedByName: string | null;
  belowPar: boolean;
}

interface Group {
  _id: string;
  name: string;
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

// Always-visible trend chart for one item — every item's chart renders at
// once (see the parent's `days` toggle and batched fetch) rather than
// requiring a tap per item. Same custom-CSS-bar approach as
// components/reports/TaskListChart.tsx (no charting library in this
// codebase); bar height normalized to this item's own window max, a
// below-par bar tinted red.
function TrendChart({ trend, loading }: { trend: InventoryTrend | undefined; loading: boolean }) {
  if (!trend) {
    return loading ? (
      <div className="mx-4 mb-3 h-[78px] bg-bg rounded-card animate-pulse" />
    ) : null;
  }
  if (trend.logs.length === 0) {
    return (
      <p className="font-mono text-dim text-[11px] px-4 pb-3 pt-1">
        No counts logged in this window.
      </p>
    );
  }
  const maxCount = Math.max(1, ...trend.logs.map((l) => l.count));
  return (
    <div className="px-4 pb-3 pt-1">
      <div className="flex items-end gap-1.5 overflow-x-auto" style={{ height: 78 }}>
        {trend.logs.map((log) => {
          const belowParBar = trend.parLevel !== null && log.count <= trend.parLevel;
          const heightPct = Math.max(6, Math.round((log.count / maxCount) * 100));
          return (
            <div key={log._id} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: 26 }}>
              <span className="font-mono text-[9px] text-muted">{log.count}</span>
              <div className="w-full flex items-end" style={{ height: 44 }}>
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
    </div>
  );
}

// One item row + its trend chart, always rendered together — same visual
// language as components/InventoryView.tsx's own ItemRow (below-par red
// tint, current/par fraction, "logged Xh ago") so this reads as the same
// list, not a different one. The row itself still links to
// /inventory/[itemTypeId] (the log-a-count flow) since there's nothing
// left to expand/collapse here.
function ItemRow({
  it,
  trend,
  trendsLoading,
  subtitle,
}: {
  it: ItemTypeRow;
  trend: InventoryTrend | undefined;
  trendsLoading: boolean;
  subtitle?: string;
}) {
  return (
    <div className={`rounded-card border overflow-hidden ${it.belowPar ? "bg-burgundy/10 border-burgundy/40" : "bg-card border-border"}`}>
      <Link href={`/inventory/${it._id}`} className="flex items-center gap-3 p-4 min-h-[44px]">
        <div className="w-8 flex items-center justify-center flex-shrink-0">
          <Package size={18} className="text-muted" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm text-text truncate">{it.name}</p>
          <p className="font-mono text-[10px] text-dim mt-0.5">
            {subtitle ??
              (it.lastLoggedAt
                ? `Logged ${formatRelativeTime(it.lastLoggedAt)} by ${it.lastLoggedByName}`
                : "Not yet logged")}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`font-mono text-sm flex items-center gap-1 justify-end ${it.belowPar ? "text-burgundy-light font-medium" : "text-text"}`}>
            {it.belowPar && <TriangleAlert size={12} strokeWidth={2} />}
            {it.currentCount !== null ? it.currentCount : "—"}
            {it.parLevel !== null && <span className="text-dim">/{it.parLevel}</span>}
          </p>
          {it.unit && <p className="font-mono text-[10px] text-dim mt-0.5">{it.unit}</p>}
        </div>
      </Link>
      <TrendChart trend={trend} loading={trendsLoading} />
    </div>
  );
}

// Manager-only Reports sub-tab — Stories 5 & 6 of "Reports v2" (see
// docs/features/reports.md's addendum). Browsing structure mirrors
// components/InventoryView.tsx (search box, manager-defined groups as
// collapsible sections, Ungrouped last, same GET /api/inventory-item-types
// + GET /api/inventory-groups). Every item's trend chart renders inline at
// once — GET /api/reports/inventory's no-itemTypeId shape returns every
// active item's window in one batched call, so this isn't item.length
// separate round trips. The below-par callout (Story 6) still reuses the
// item-types response's belowPar/lastLoggedAt fields directly — no new
// query for that part.
export default function InventoryTab() {
  const [itemTypes, setItemTypes] = useState<ItemTypeRow[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [trends, setTrends] = useState<Record<string, InventoryTrend> | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [days, setDays] = useState<7 | 30>(30);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/inventory-item-types")
      .then((r) => r.json())
      .then(setItemTypes)
      .catch(() => setItemTypes([]));
    fetch("/api/inventory-groups")
      .then((r) => (r.ok ? r.json() : []))
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    setTrends(null);
    setTrendsLoading(true);
    fetch(`/api/reports/inventory?days=${days}`)
      .then((r) => r.json())
      .then((d: { items: InventoryTrend[] }) => {
        setTrends(Object.fromEntries(d.items.map((t) => [t.itemTypeId, t])));
        setTrendsLoading(false);
      });
  }, [days]);

  const groupNameById = useMemo(() => new Map((groups ?? []).map((g) => [g._id, g.name])), [groups]);

  const sections = useMemo(() => {
    if (!itemTypes || !groups) return [];
    const byGroup = new Map<string | null, ItemTypeRow[]>();
    for (const it of itemTypes) {
      const key = it.groupId;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(it);
    }
    const result: { id: string | null; name: string; items: ItemTypeRow[] }[] = [];
    for (const g of groups) {
      result.push({ id: g._id, name: g.name, items: byGroup.get(g._id) ?? [] });
    }
    const ungrouped = byGroup.get(null) ?? [];
    if (ungrouped.length > 0) result.push({ id: null, name: "Ungrouped", items: ungrouped });
    return result;
  }, [itemTypes, groups]);

  const trimmedSearch = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!itemTypes || !trimmedSearch) return null;
    return itemTypes
      .filter((it) => it.name.toLowerCase().includes(trimmedSearch))
      .map((it) => ({ it, groupName: it.groupId ? groupNameById.get(it.groupId) ?? "Ungrouped" : "Ungrouped" }));
  }, [itemTypes, trimmedSearch, groupNameById]);

  const toggleSection = (id: string | null) => {
    const key = id ?? "__ungrouped__";
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const belowPar = useMemo(() => (itemTypes ?? []).filter((it) => it.belowPar), [itemTypes]);

  if (!itemTypes || !groups) {
    return <div className="bg-card rounded-card h-40 animate-pulse" />;
  }

  return (
    <>
      {/* Story 6 — recently-below-par callout */}
      {belowPar.length > 0 && (
        <section className="mb-6">
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

      {/* Story 5 — full catalog, same search/grouping as the Inventory tab,
          every item's trend chart shown at once. */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" strokeWidth={1.75} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full bg-card border border-border rounded-card pl-9 pr-3 py-2.5 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light min-h-[44px]"
            />
          </div>
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

        {itemTypes.length === 0 && (
          <div className="text-center py-10">
            <Package size={28} className="text-dim mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-dim font-body text-sm">No item types yet.</p>
          </div>
        )}

        {/* Search mode — flat filtered list, group shown as a subtitle. */}
        {searchResults !== null && (
          <div className="space-y-2">
            {searchResults.length === 0 && (
              <p className="text-dim font-mono text-xs text-center py-6">No items match &quot;{search.trim()}&quot;.</p>
            )}
            {searchResults.map(({ it, groupName }) => (
              <ItemRow key={it._id} it={it} subtitle={groupName} trend={trends?.[it._id]} trendsLoading={trendsLoading} />
            ))}
          </div>
        )}

        {/* Normal mode — collapsible sections per group, Ungrouped last. */}
        {searchResults === null && itemTypes.length > 0 && (
          <div className="space-y-3">
            {sections.map((section) => {
              const key = section.id ?? "__ungrouped__";
              const isCollapsed = !!collapsed[key];
              const hasBelowPar = section.items.some((it) => it.belowPar);
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center gap-2 py-2 min-h-[44px]"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={14} className="text-dim flex-shrink-0" />
                    ) : (
                      <ChevronDown size={14} className="text-dim flex-shrink-0" />
                    )}
                    <span className="font-mono text-[11px] text-dim uppercase tracking-widest flex-1 text-left">
                      {section.name}
                    </span>
                    {hasBelowPar && <span className="w-1.5 h-1.5 rounded-full bg-burgundy-light flex-shrink-0" />}
                    <span className="font-mono text-[10px] text-dim flex-shrink-0">{section.items.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2 pb-1">
                      {section.items.length === 0 && (
                        <p className="text-dim font-mono text-[11px] py-2 px-1">No items in this group yet.</p>
                      )}
                      {section.items.map((it) => (
                        <ItemRow key={it._id} it={it} trend={trends?.[it._id]} trendsLoading={trendsLoading} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
