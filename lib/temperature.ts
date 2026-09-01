// Shared F/C conversion for "temperature"-type FormFields — see
// models/TaskDefinition.ts. Every conversion rounds to the nearest whole
// degree: readings are entered as whole degrees (see
// components/TemperatureInput.tsx's wheel), so there's no fractional
// precision to preserve across a unit toggle.
export type TempUnit = "F" | "C";

// `|| 0` normalizes a rounded -0 (e.g. -18°C → 0°F rounds to -0.4 → -0,
// which would render as the confusing "-0°F") to plain 0.
export function fToC(f: number): number {
  return Math.round(((f - 32) * 5) / 9) || 0;
}

export function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32) || 0;
}

export function convertTemp(value: number, from: TempUnit, to: TempUnit): number {
  if (from === to) return value;
  return from === "F" ? fToC(value) : cToF(value);
}

// Wheel/back-entry bounds — generous enough to span a walk-in freezer
// through deep-fry oil, in whichever unit is currently displayed.
export const TEMP_RANGE: Record<TempUnit, { min: number; max: number }> = {
  F: { min: -20, max: 400 },
  C: { min: fToC(-20), max: fToC(400) },
};
