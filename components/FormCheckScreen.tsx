"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import HabitIcon from "@/components/HabitIcon";
import type { TimerItem } from "@/components/TimerScreen";

type FieldValue = string | number | boolean;

interface Props {
  item: TimerItem;
  initialElapsed?: number; // seconds already elapsed (from server startedAt on resume)
  onComplete: (formData: Record<string, FieldValue>, actualMinutes: number) => void;
  onMissed: () => void;
  onClose: () => void;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

// Sibling to TimerScreen.tsx, sharing its same lifecycle (server-stamped
// startedAt already applied before this opens, wall-clock elapsed tracking,
// Done/Missed via the same RoutinesView callbacks) — just no ring/clock as
// the focal element, since the point of a form_check item is the data, not
// the duration. See docs/features/timer.md for the elapsed-time convention
// this mirrors.
export default function FormCheckScreen({ item, initialElapsed = 0, onComplete, onMissed, onClose }: Props) {
  const fields = item.formFields ?? [];

  const [elapsed, setElapsed] = useState(initialElapsed);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseElapsedRef = useRef(initialElapsed);
  const runStartRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    if (runStartRef.current != null) {
      const delta = Math.floor((Date.now() - runStartRef.current) / 1000);
      setElapsed(baseElapsedRef.current + delta);
    }
  }, []);

  useEffect(() => {
    runStartRef.current = Date.now();
    recompute();
    intervalRef.current = setInterval(recompute, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [recompute]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") recompute();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [recompute]);

  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [error, setError] = useState("");

  const setField = (key: string, value: FieldValue) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (error) setError("");
  };

  const handleSave = () => {
    // All fields required for the MVP — no optional-field logic yet.
    for (const f of fields) {
      const v = values[f.key];
      if (f.type === "boolean" ? v === undefined : v === undefined || v === "") {
        setError(`${f.label} is required`);
        return;
      }
    }
    const actualMinutes = Math.max(1, Math.round(elapsed / 60));
    onComplete(values, actualMinutes);
  };

  const timeDisplay = `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`;

  return (
    <div className="fixed inset-0 bg-bg z-50 flex flex-col max-w-mobile mx-auto">
      <div className="flex items-center justify-between px-4 pt-10 pb-2 flex-shrink-0">
        <button onClick={onClose} className="font-mono text-dim text-sm min-h-[44px] pr-4 flex items-center">
          ← back
        </button>
        {/* Unobtrusive elapsed readout — kept for consistency/debugging, not the focal element */}
        <p className="font-mono text-dim text-xs">{timeDisplay}</p>
      </div>

      <div className="text-center px-4 mt-4 mb-6 flex-shrink-0">
        <div className="flex justify-center mb-3">
          <HabitIcon name={item.icon} size={40} strokeWidth={1.25} className="text-text" />
        </div>
        <h2 className="font-heading text-2xl text-text">{item.name}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-5">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <label className="font-mono text-[10px] text-dim uppercase tracking-widest">
              {f.label}
              {f.unit ? ` (${f.unit})` : ""}
            </label>
            {f.type === "boolean" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setField(f.key, true)}
                  className={`flex-1 py-3 rounded-card border font-body text-sm min-h-[44px] transition-colors ${
                    values[f.key] === true ? "bg-olive/10 border-olive text-text" : "border-border-light text-muted"
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setField(f.key, false)}
                  className={`flex-1 py-3 rounded-card border font-body text-sm min-h-[44px] transition-colors ${
                    values[f.key] === false ? "bg-olive/10 border-olive text-text" : "border-border-light text-muted"
                  }`}
                >
                  No
                </button>
              </div>
            ) : f.type === "number" ? (
              <input
                type="number"
                inputMode="decimal"
                value={(values[f.key] as number | string) ?? ""}
                onChange={(e) => setField(f.key, e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-card border border-border rounded-card px-3 py-3 font-mono text-sm text-text outline-none focus:border-border-light min-h-[44px]"
              />
            ) : (
              <input
                type="text"
                value={(values[f.key] as string) ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full bg-card border border-border rounded-card px-3 py-3 font-body text-sm text-text outline-none focus:border-border-light min-h-[44px]"
              />
            )}
          </div>
        ))}

        {error && <p className="font-mono text-xs text-burgundy-light">{error}</p>}
      </div>

      <div className="px-4 pb-12 pt-4 space-y-3 w-full flex-shrink-0">
        <button
          onClick={handleSave}
          className="w-full py-4 rounded-card bg-olive text-text font-body font-medium text-base"
        >
          Save
        </button>
        <button
          onClick={onMissed}
          className="w-full py-3.5 rounded-card border border-burgundy/30 text-burgundy-light font-body text-sm min-h-[44px]"
        >
          Missed it
        </button>
      </div>
    </div>
  );
}
