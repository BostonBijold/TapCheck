// Virtues are global reference data, owned entirely by MongoDB — no code-side
// seeding or syncing. Admin edits documents directly in the database.
export {
  isoWeekNumber,
  weekStartDate,
  currentVirtueOrder,
  personalWeeksActive,
  personalStackSize,
  personalStackOrders,
} from "@/lib/virtue-dates";
