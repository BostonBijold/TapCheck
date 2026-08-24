"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClaimTagPicker({
  tagCode,
  items,
}: {
  tagCode: string;
  items: Array<{ _id: string; name: string; icon: string }>;
}) {
  const router = useRouter();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link tag");
      setClaiming(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-dim font-body text-sm">No habits to link yet — add one first.</p>;
  }

  return (
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
  );
}
