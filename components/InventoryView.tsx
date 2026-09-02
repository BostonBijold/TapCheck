"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Package } from "lucide-react";
import Header from "@/components/Header";
import AddInventoryItemTypeSheet from "@/components/AddInventoryItemTypeSheet";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface ItemType {
  _id: string;
  name: string;
  unit: string | null;
  parLevel: number | null;
  nfcTagUid: string | null;
  currentCount: number | null;
  lastLoggedAt: string | null;
  lastLoggedByName: string | null;
}

interface Props {
  userName: string;
  today: string;
  skipAuth: boolean;
  isManager: boolean;
}

// Inventory tab list view — every active InventoryItemType, current count +
// how recently it was logged. A top-up count tracker, not a decrement
// ledger — see docs/features/inventory.md. Tapping a row opens the item's
// detail/log screen (app/(app)/inventory/[itemTypeId]/page.tsx).
export default function InventoryView({ userName, today, skipAuth, isManager }: Props) {
  const router = useRouter();
  const [itemTypes, setItemTypes] = useState<ItemType[] | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);

  useEffect(() => {
    fetch("/api/inventory-item-types")
      .then((r) => r.json())
      .then(setItemTypes)
      .catch(() => setItemTypes([]));
  }, []);

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        <div className="mt-4 mb-5">
          <h1 className="font-heading text-xl text-text">Inventory</h1>
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

        <div className="space-y-2">
          {itemTypes?.map((it) => (
            <button
              key={it._id}
              type="button"
              onClick={() => router.push(`/inventory/${it._id}`)}
              className="w-full flex items-center gap-3 bg-card rounded-card border border-border p-4 text-left hover:bg-card-hover transition-colors min-h-[44px]"
            >
              <div className="w-8 flex items-center justify-center flex-shrink-0">
                <Package size={18} className="text-muted" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm text-text truncate">{it.name}</p>
                <p className="font-mono text-[10px] text-dim mt-0.5">
                  {it.lastLoggedAt
                    ? `Logged ${formatRelativeTime(it.lastLoggedAt)} by ${it.lastLoggedByName}`
                    : "Not yet logged"}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono text-sm text-text">
                  {it.currentCount !== null ? it.currentCount : "—"}
                </p>
                {it.unit && <p className="font-mono text-[10px] text-dim mt-0.5">{it.unit}</p>}
              </div>
              <ChevronRight size={16} className="text-dim flex-shrink-0" />
            </button>
          ))}
        </div>

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
          onCreated={(itemType) => {
            setShowAddSheet(false);
            setItemTypes((prev) => (prev ? [...prev, itemType].sort((a, b) => a.name.localeCompare(b.name)) : [itemType]));
          }}
          onClose={() => setShowAddSheet(false)}
        />
      )}
    </div>
  );
}
