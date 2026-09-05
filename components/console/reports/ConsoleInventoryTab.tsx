"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Package, Search, TriangleAlert } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import InventoryTrendChart from "@/components/console/reports/InventoryTrendChart";

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

interface InventoryTrend {
  itemTypeId: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  logs: Array<{ _id: string; count: number; loggedAt: string }>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ItemCard({ it, trend, trendsLoading, subtitle }: { it: ItemTypeRow; trend: InventoryTrend | undefined; trendsLoading: boolean; subtitle?: string }) {
  return (
    <div className={`rounded-card border overflow-hidden ${it.belowPar ? "bg-burgundy/10 border-burgundy/40" : "bg-card border-border"}`}>
      <Link href={`/inventory/${it._id}`} className="flex items-center gap-3 p-4">
        <div className="w-8 flex items-center justify-center flex-shrink-0">
          <Package size={17} className="text-muted" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm text-text truncate">{it.name}</p>
          <p className="font-mono text-[10px] text-dim mt-0.5 truncate">
            {subtitle ?? (it.lastLoggedAt ? `Logged ${formatRelativeTime(it.lastLoggedAt)} by ${it.lastLoggedByName}` : "Not yet logged")}
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
      <div className="px-4 pb-3">
        <InventoryTrendChart trend={trend} loading={trendsLoading} />
      </div>
    </div>
  );
}

// Desktop-shaped Inventory tab — same GET /api/inventory-item-types + GET
// /api/reports/inventory data as mobile's InventoryTab.tsx, laid out as a
// card grid (2 columns) instead of one stacked column, so a company with
// many item types can see more of its catalog at once. Every console
// viewer is manager-or-above, so unlike ReportsContent.tsx's mobile
// gating there's no role check needed to reach this tab at all — the
// page-level tab switcher already only ever renders it for a
// manager-or-above session. See docs/features/console-reports.md.
export default function ConsoleInventoryTab() {
  const [itemTypes, setItemTypes] = useState<ItemTypeRow[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [trends, setTrends] = useState<Record<string, InventoryTrend> | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [days, setDays] = useState<7 | 30>(30);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/inventory-item-types").then((r) => r.json()).then(setItemTypes).catch(() => setItemTypes([]));
    fetch("/api/inventory-groups").then((r) => (r.ok ? r.json() : [])).then(setGroups).catch(() => setGroups([]));
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
    for (const g of groups) result.push({ id: g._id, name: g.name, items: byGroup.get(g._id) ?? [] });
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

  const belowPar = useMemo(() => (itemTypes ?? []).filter((it) => it.belowPar), [itemTypes]);

  if (!itemTypes || !groups) {
    return <div className="bg-card rounded-card h-40 animate-pulse" />;
  }

  return (
    <div>
      {belowPar.length > 0 && (
        <section className="mb-6">
          <div className="bg-card border border-border rounded-card px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={13} className="text-burgundy-light" strokeWidth={2} />
              <p className="font-mono text-[10px] uppercase tracking-widest text-dim">Below par</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {belowPar.map((it) => (
                <Link key={it._id} href={`/inventory/${it._id}`} className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-text truncate">{it.name}</span>
                  <span className="font-mono text-xs text-burgundy-light flex-shrink-0">
                    {it.currentCount}
                    {it.unit ? ` ${it.unit}` : ""} / par {it.parLevel}
                    {it.lastLoggedAt && <span className="text-dim ml-1.5">· {fmtDate(it.lastLoggedAt)}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" strokeWidth={1.75} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full bg-card border border-border rounded-card pl-9 pr-3 py-2.5 font-body text-sm text-text placeholder:text-dim outline-none focus:border-border-light"
          />
        </div>
        <div className="flex bg-card border border-border rounded-pill p-0.5 flex-shrink-0">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`font-mono text-xs px-4 py-1.5 rounded-pill transition-colors ${days === d ? "bg-olive text-text" : "text-dim hover:text-muted"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {itemTypes.length === 0 && (
        <div className="text-center py-10">
          <Package size={28} className="text-dim mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-dim font-body text-sm">No item types yet.</p>
        </div>
      )}

      {searchResults !== null ? (
        <div className="grid grid-cols-2 gap-3">
          {searchResults.length === 0 ? (
            <p className="text-dim font-mono text-xs col-span-2 text-center py-6">No items match &quot;{search.trim()}&quot;.</p>
          ) : (
            searchResults.map(({ it, groupName }) => (
              <ItemCard key={it._id} it={it} subtitle={groupName} trend={trends?.[it._id]} trendsLoading={trendsLoading} />
            ))
          )}
        </div>
      ) : (
        itemTypes.length > 0 && (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.id ?? "__ungrouped__"}>
                <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-2">
                  {section.name} <span className="text-dim">· {section.items.length}</span>
                </p>
                {section.items.length === 0 ? (
                  <p className="text-dim font-mono text-[11px] py-2">No items in this group yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {section.items.map((it) => (
                      <ItemCard key={it._id} it={it} trend={trends?.[it._id]} trendsLoading={trendsLoading} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
