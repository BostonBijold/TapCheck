"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Package, Search, TriangleAlert } from "lucide-react";
import Header from "@/components/Header";
import AddInventoryItemTypeSheet from "@/components/AddInventoryItemTypeSheet";
import ManageInventoryGroupsSheet from "@/components/ManageInventoryGroupsSheet";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface ItemType {
  _id: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  nfcTagUid: string | null;
  nfcRequiredToLog: boolean;
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

interface Props {
  userName: string;
  today: string;
  skipAuth: boolean;
  isManager: boolean;
}

function ItemRow({ it, onClick, subtitle }: { it: ItemType; onClick: () => void; subtitle?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-card rounded-card border border-border p-4 text-left hover:bg-card-hover transition-colors min-h-[44px]"
    >
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
        <p className={`font-mono text-sm flex items-center gap-1 justify-end ${it.belowPar ? "text-burgundy-light" : "text-text"}`}>
          {it.belowPar && <TriangleAlert size={12} strokeWidth={2} />}
          {it.currentCount !== null ? it.currentCount : "—"}
        </p>
        {it.unit && <p className="font-mono text-[10px] text-dim mt-0.5">{it.unit}</p>}
      </div>
      <ChevronRight size={16} className="text-dim flex-shrink-0" />
    </button>
  );
}

// Inventory tab list view — every active InventoryItemType, grouped into
// manager-defined sections (Freezer, Cold Storage, Bar…) with an implicit
// "Ungrouped" section last, plus a name search and a par-level red-dot
// cascade from item → group. A top-up count tracker, not a decrement
// ledger — see docs/features/inventory.md. Tapping a row opens the item's
// detail/log screen (app/(app)/inventory/[itemTypeId]/page.tsx).
export default function InventoryView({ userName, today, skipAuth, isManager }: Props) {
  const router = useRouter();
  const [itemTypes, setItemTypes] = useState<ItemType[] | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showManageGroups, setShowManageGroups] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const fetchAll = () => {
    fetch("/api/inventory-item-types")
      .then((r) => r.json())
      .then(setItemTypes)
      .catch(() => setItemTypes([]));
    fetch("/api/inventory-groups")
      .then((r) => (r.ok ? r.json() : []))
      .then(setGroups)
      .catch(() => setGroups([]));
  };

  useEffect(fetchAll, []);

  const groupNameById = useMemo(() => new Map((groups ?? []).map((g) => [g._id, g.name])), [groups]);

  const sections = useMemo(() => {
    if (!itemTypes || !groups) return [];
    const byGroup = new Map<string | null, ItemType[]>();
    for (const it of itemTypes) {
      const key = it.groupId;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(it);
    }
    const result: { id: string | null; name: string; items: ItemType[] }[] = [];
    for (const g of groups) {
      const items = byGroup.get(g._id) ?? [];
      result.push({ id: g._id, name: g.name, items });
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

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        <div className="mt-4 mb-5 flex items-center justify-between gap-2">
          <h1 className="font-heading text-xl text-text">Inventory</h1>
          {isManager && (
            <button
              onClick={() => setShowManageGroups(true)}
              className="font-mono text-[10px] text-olive uppercase tracking-widest px-1 min-h-[44px] flex items-center"
            >
              Manage Groups
            </button>
          )}
        </div>

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

        {itemTypes === null && (
          <p className="text-dim font-mono text-xs text-center py-8">Loading…</p>
        )}

        {itemTypes !== null && itemTypes.length === 0 && (
          <div className="text-center py-10">
            <Package size={28} className="text-dim mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-dim font-body text-sm">
              {isManager ? "No item types yet — add one to start tracking counts." : "No item types yet — ask a manager to add one."}
            </p>
          </div>
        )}

        {/* Search mode — flat filtered list, group shown as a subtitle. */}
        {searchResults !== null && (
          <div className="space-y-2">
            {searchResults.length === 0 && (
              <p className="text-dim font-mono text-xs text-center py-6">No items match &quot;{search.trim()}&quot;.</p>
            )}
            {searchResults.map(({ it, groupName }) => (
              <ItemRow key={it._id} it={it} subtitle={groupName} onClick={() => router.push(`/inventory/${it._id}`)} />
            ))}
          </div>
        )}

        {/* Normal mode — collapsible sections per group, Ungrouped last. */}
        {searchResults === null && itemTypes !== null && itemTypes.length > 0 && (
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
                        <ItemRow key={it._id} it={it} onClick={() => router.push(`/inventory/${it._id}`)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isManager && (
          <button
            onClick={() => setShowAddSheet(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-3.5 rounded-card hover:border-olive/40 hover:text-olive transition-colors min-h-[44px]"
          >
            + Add Item Type
          </button>
        )}
      </div>

      {showAddSheet && (
        <AddInventoryItemTypeSheet
          onCreated={() => {
            setShowAddSheet(false);
            fetchAll();
          }}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {showManageGroups && (
        <ManageInventoryGroupsSheet onClose={() => setShowManageGroups(false)} onChanged={fetchAll} />
      )}
    </div>
  );
}
