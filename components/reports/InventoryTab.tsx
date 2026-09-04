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

// Inline trend chart for one item — fetched lazily on expand rather than
// eagerly for the whole catalog. Same custom-CSS-bar approach as
// components/reports/TaskListChart.tsx (no charting library in this
// codebase); bar height normalized to the window's max count, a
// below-par bar tinted red.
function TrendPanel({ itemTypeId }: { itemTypeId: string }) {
  const [days, setDays] = useState<7 | 30>(30);
  const [trend, setTrend] = useState<InventoryTrend | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setTrend(null);
    fetch(`/api/reports/inventory?itemTypeId=${itemTypeId}&days=${days}`)
      .then((r) => r.json())
      .then((d: InventoryTrend) => {
        setTrend(d);
        setLoading(false);
      });
  }, [itemTypeId, days]);

  const maxCount = trend ? Math.max(1, ...trend.logs.map((l) => l.count)) : 1;

  return (
    <div className="px-4 pb-4 pt-1">
      <div className="flex justify-end mb-2">
        <div className="flex bg-bg border border-border rounded-pill p-0.5">
          <button
            onClick={() => setDays(7)}
            className={`font-mono text-[10px] px-2.5 py-1 rounded-pill transition-colors ${
              days === 7 ? "bg-olive text-text" : "text-dim hover:text-muted"
            }`}
          >
            7d
          </button>
          <button
            onClick={() => setDays(30)}
            className={`font-mono text-[10px] px-2.5 py-1 rounded-pill transition-colors ${
              days === 30 ? "bg-olive text-text" : "text-dim hover:text-muted"
            }`}
          >
            30d
          </button>
        </div>
      </div>

      {loading && <div className="h-24 bg-bg rounded-card animate-pulse" />}

      {!loading && trend && trend.logs.length === 0 && (
        <p className="font-mono text-dim text-xs py-4 text-center">
          No counts logged in this window.
        </p>
      )}

      {!loading && trend && trend.logs.length > 0 && (
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
  );
}

// One item row — same visual language as components/InventoryView.tsx's
// own ItemRow (below-par red tint, current/par fraction, "logged Xh ago")
// so this reads as the same list, not a different one — except tapping
// expands this item's trend chart inline instead of navigating to
// /inventory/[itemTypeId] (this is Reports, not the log-a-count flow).
function ItemRow({
  it,
  subtitle,
  expanded,
  onToggle,
}: {
  it: ItemTypeRow;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-card border overflow-hidden ${it.belowPar ? "bg-burgundy/10 border-burgundy/40" : "bg-card border-border"}`}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left min-h-[44px]">
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
        {expanded ? (
          <ChevronDown size={16} className="text-dim flex-shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-dim flex-shrink-0" />
        )}
      </button>
      {expanded && <TrendPanel itemTypeId={it._id} />}
    </div>
  );
}

// Manager-only Reports sub-tab — Stories 5 & 6 of "Reports v2" (see
// docs/features/reports.md's addendum). Browsing structure mirrors
// components/InventoryView.tsx exactly (search box, manager-defined
// groups as collapsible sections, Ungrouped last, same GET
// /api/inventory-item-types + GET /api/inventory-groups) rather than a
// single-item picker, so this reads as the same catalog, just with a
// trend chart available per row. The below-par callout (Story 6) still
// reuses that same item-types response's belowPar/lastLoggedAt fields —
// no new query. Only the trend chart (Story 5) needed a new route,
// GET /api/reports/inventory, fetched lazily per expanded row.
export default function InventoryTab() {
  const [itemTypes, setItemTypes] = useState<ItemTypeRow[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const toggleExpanded = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

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
          tap a row to see its trend chart inline. */}
      <section>
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" strokeWidth={1.75} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full bg-card border border-border rounded-card pl-9 pr-3 py-2.5 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light min-h-[44px]"
          />
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
              <ItemRow
                key={it._id}
                it={it}
                subtitle={groupName}
                expanded={expandedId === it._id}
                onToggle={() => toggleExpanded(it._id)}
              />
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
                        <ItemRow
                          key={it._id}
                          it={it}
                          expanded={expandedId === it._id}
                          onToggle={() => toggleExpanded(it._id)}
                        />
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
