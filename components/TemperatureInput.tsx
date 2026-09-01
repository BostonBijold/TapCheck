"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TEMP_RANGE, convertTemp, type TempUnit } from "@/lib/temperature";

const ROW_H = 44; // matches the app's 44px minimum tap target
const VISIBLE_ROWS = 5;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);
// A programmatic reposition (mount, unit toggle) fires its own 'scroll'
// events same as a finger drag — this window lets handleScroll ignore
// those instead of misreading them as the worker committing a reading.
const PROGRAMMATIC_GUARD_MS = 250;

interface Props {
  unit: TempUnit; // canonical unit this field is configured/stored in (FormFieldDef.unit)
  value: number | undefined; // canonical-unit value — undefined until the worker actually sets one
  onChange: (canonicalValue: number) => void;
  min?: number; // acceptable range, canonical unit
  max?: number;
}

// Worker-facing temperature entry: an iOS-style scroll wheel (so negative
// freezer readings are as easy to reach as positive ones — the plain
// <input inputMode="decimal"> this replaced has no minus key on iOS) plus
// a F/C toggle and +/-1 nudge buttons for fine adjustment. Values are
// always committed to the parent in the field's canonical unit — the
// display-unit toggle only changes what's shown, converting on the way in
// and out. See models/TaskDefinition.ts's FormFieldDef "temperature" type.
export default function TemperatureInput({ unit, value, onChange, min, max }: Props) {
  const [displayUnit, setDisplayUnit] = useState<TempUnit>(unit);
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgrammaticAt = useRef(0);

  const range = TEMP_RANGE[displayUnit];
  const items = useMemo(() => {
    const arr: number[] = [];
    for (let n = range.min; n <= range.max; n++) arr.push(n);
    return arr;
  }, [range.min, range.max]);

  const committedDisplay = value === undefined ? undefined : convertTemp(value, unit, displayUnit);

  // Wheel position before the worker has ever committed a reading — center
  // it on something plausible (the acceptable range) rather than an
  // arbitrary edge, without treating that as a real answer.
  const fallbackDisplay = useMemo(() => {
    if (min !== undefined && max !== undefined) {
      return Math.round((convertTemp(min, unit, displayUnit) + convertTemp(max, unit, displayUnit)) / 2);
    }
    if (min !== undefined) return convertTemp(min, unit, displayUnit);
    if (max !== undefined) return convertTemp(max, unit, displayUnit);
    return displayUnit === "F" ? 32 : 0;
  }, [min, max, unit, displayUnit]);

  const shownValue = committedDisplay ?? fallbackDisplay;

  const scrollToIndex = useCallback(
    (displayVal: number, smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      const idx = Math.min(items.length - 1, Math.max(0, displayVal - range.min));
      lastProgrammaticAt.current = Date.now();
      el.scrollTo({ top: idx * ROW_H, behavior: smooth ? "smooth" : "auto" });
    },
    [items.length, range.min]
  );

  // Reposition on mount and whenever the display unit changes — this is the
  // only effect that drives the wheel from outside a direct user gesture.
  useEffect(() => {
    scrollToIndex(shownValue, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayUnit]);

  const commitFromScroll = () => {
    if (Date.now() - lastProgrammaticAt.current < PROGRAMMATIC_GUARD_MS) return;
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ROW_H);
    const clamped = Math.min(items.length - 1, Math.max(0, idx));
    onChange(convertTemp(items[clamped], displayUnit, unit));
  };

  const handleScroll = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(commitFromScroll, 120);
  };

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const selectDisplayValue = (n: number, smooth: boolean) => {
    onChange(convertTemp(n, displayUnit, unit));
    scrollToIndex(n, smooth);
  };

  const nudge = (delta: number) => {
    const next = Math.min(range.max, Math.max(range.min, shownValue + delta));
    selectDisplayValue(next, true);
  };

  const toggleUnit = (next: TempUnit) => {
    if (next === displayUnit) return;
    setDisplayUnit(next);
  };

  const outOfRange =
    value !== undefined && ((min !== undefined && value < min) || (max !== undefined && value > max));

  const rangeHint = (() => {
    if (min === undefined && max === undefined) return null;
    const dispMin = min !== undefined ? convertTemp(min, unit, displayUnit) : undefined;
    const dispMax = max !== undefined ? convertTemp(max, unit, displayUnit) : undefined;
    if (dispMin !== undefined && dispMax !== undefined) return `Acceptable: ${dispMin}°–${dispMax}°${displayUnit}`;
    if (dispMin !== undefined) return `Acceptable: ${dispMin}°${displayUnit} or above`;
    return `Acceptable: ${dispMax}°${displayUnit} or below`;
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex bg-card border border-border rounded-card p-0.5">
          <button
            type="button"
            onClick={() => toggleUnit("F")}
            className={`px-3 py-1.5 rounded-card font-mono text-xs min-h-[32px] transition-colors ${
              displayUnit === "F" ? "bg-olive text-text" : "text-dim"
            }`}
          >
            °F
          </button>
          <button
            type="button"
            onClick={() => toggleUnit("C")}
            className={`px-3 py-1.5 rounded-card font-mono text-xs min-h-[32px] transition-colors ${
              displayUnit === "C" ? "bg-olive text-text" : "text-dim"
            }`}
          >
            °C
          </button>
        </div>
        {rangeHint && (
          <span className={`font-mono text-[10px] ${outOfRange ? "text-burgundy-light" : "text-dim"}`}>
            {rangeHint}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Decrease by 1 degree"
          className="flex-shrink-0 w-11 h-11 rounded-full border border-border-light flex items-center justify-center text-dim text-lg font-mono active:bg-card"
        >
          −
        </button>

        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="no-scrollbar overflow-y-auto snap-y snap-mandatory"
            style={{ height: ROW_H * VISIBLE_ROWS, width: 128, WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          >
            <div style={{ height: ROW_H * PAD_ROWS }} />
            {items.map((n) => {
              const isSel = committedDisplay !== undefined && n === committedDisplay;
              return (
                <div
                  key={n}
                  onClick={() => selectDisplayValue(n, true)}
                  className={`snap-center flex items-center justify-center font-mono transition-colors cursor-pointer ${
                    isSel ? "text-text text-2xl" : "text-dim text-base"
                  }`}
                  style={{ height: ROW_H }}
                >
                  {n}°
                </div>
              );
            })}
            <div style={{ height: ROW_H * PAD_ROWS }} />
          </div>
          {/* Center selection band — purely visual, sits over the wheel */}
          <div
            className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y ${
              outOfRange ? "border-burgundy-light/50" : "border-olive/40"
            }`}
            style={{ height: ROW_H }}
          />
        </div>

        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Increase by 1 degree"
          className="flex-shrink-0 w-11 h-11 rounded-full border border-border-light flex items-center justify-center text-dim text-lg font-mono active:bg-card"
        >
          +
        </button>
      </div>

      {value === undefined ? (
        <p className="text-center font-mono text-[10px] text-dim mt-2">Scroll or tap to set the reading</p>
      ) : (
        outOfRange && (
          <p className="text-center font-mono text-[10px] text-burgundy-light mt-2">
            Outside the acceptable range — double-check, then save if this is accurate.
          </p>
        )
      )}
    </div>
  );
}
