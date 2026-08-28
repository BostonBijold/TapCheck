// Pure visibility rule — safe to import from client components.
// Retired the routine_review Sunday-only gate when that feature was removed;
// every remaining item type is always visible. Kept as a named seam in case
// a future item type needs date-based visibility again.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isItemVisibleOn(item: { itemType?: "standard" | "stopwatch" | "checkbox" | "form_check" }, dateStr: string): boolean {
  return true;
}
