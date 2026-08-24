// Pure visibility rule — safe to import from client components.
// Weekly Review and Routine Review only appear in the routine list on
// Sundays — same weekly cadence, same evening slot.
export function isItemVisibleOn(
  item: { itemType?: "standard" | "stopwatch" | "checkbox" | "virtue_checkin" | "weekly_review" | "routine_review" },
  dateStr: string
): boolean {
  if (item.itemType === "weekly_review" || item.itemType === "routine_review") {
    return new Date(dateStr + "T12:00:00").getDay() === 0;
  }
  return true;
}
