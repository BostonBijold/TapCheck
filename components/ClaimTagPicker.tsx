"use client";

import { useState } from "react";
import TagLinkedSetup from "@/components/TagLinkedSetup";

export default function ClaimTagPicker({
  tagCode,
  items,
}: {
  tagCode: string;
  items: Array<{ _id: string; name: string; icon: string }>;
}) {
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<{ name: string; icon: string } | null>(null);

  async function claim(routineItemId: string) {
    setClaiming(routineItemId);
    setError(null);
    try {
      const res = await fetch(`/api/nfc-tags/${tagCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineItemId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to link tag");
      }
      const claimedItem = items.find((i) => i._id === routineItemId) ?? null;
      setLinked(claimedItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link tag");
      setClaiming(null);
    }
  }

  if (linked) {
    return <TagLinkedSetup tagCode={tagCode} itemName={linked.name} itemIcon={linked.icon} />;
  }

  return (
    <>
      <h1 className="font-heading text-2xl text-text mb-2">Link this tag</h1>
      <p className="text-muted font-body text-sm mb-6">
        Which habit should this tag start?
      </p>
      {items.length === 0 ? (
        <p className="text-dim font-body text-sm">No habits to link yet — add one first.</p>
      ) : (
        <div className="bg-bg border border-border rounded-card divide-y divide-border overflow-hidden text-left">
          {items.map((item) => (
            <button
              key={item._id}
              type="button"
              disabled={claiming !== null}
              onClick={() => claim(item._id)}
              className="w-full flex items-center gap-3 px-4 py-3 disabled:opacity-40"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-body text-sm text-text flex-1">{item.name}</span>
              {claiming === item._id && (
                <span className="font-mono text-xs text-dim">Linking…</span>
              )}
            </button>
          ))}
          {error && (
            <p className="px-4 py-3 font-body text-xs text-burgundy-light">{error}</p>
          )}
        </div>
      )}
    </>
  );
}
