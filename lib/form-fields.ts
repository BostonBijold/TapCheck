import type { FormFieldDef } from "@/models/TaskDefinition";

// Validates/sanitizes a client-supplied formFields payload — drops any entry
// that doesn't have the minimum required shape instead of trusting
// Array.isArray alone. Shared by the tasks and task-templates write routes
// so a real UI (TaskFieldsEditor) can't write malformed data.
export function sanitizeFormFields(input: unknown): FormFieldDef[] {
  if (!Array.isArray(input)) return [];

  const valid: FormFieldDef[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const { key, label, type, unit, min, max, items } = entry as Record<string, unknown>;
    if (typeof key !== "string" || !key) continue;
    if (typeof label !== "string" || !label) continue;
    if (type !== "number" && type !== "text" && type !== "boolean" && type !== "checklist" && type !== "temperature") continue;

    const field: FormFieldDef = { key, label, type };
    if (type === "number") {
      if (typeof unit === "string" && unit) field.unit = unit;
      if (typeof min === "number") field.min = min;
      if (typeof max === "number") field.max = max;
    }
    if (type === "temperature") {
      // Only ever "F" or "C" — this unit doubles as the scale min/max/value
      // are compared in, unlike "number"'s free-text display-only unit.
      field.unit = unit === "C" ? "C" : "F";
      if (typeof min === "number") field.min = min;
      if (typeof max === "number") field.max = max;
    }
    if (type === "checklist") {
      const rawItems = Array.isArray(items) ? items : [];
      const cleaned = rawItems.filter((it): it is string => typeof it === "string" && it.trim().length > 0).map((it) => it.trim());
      // No items supplied — fall back to a single item matching the field's
      // own label, i.e. the "single check" case (e.g. "Take out garbage").
      field.items = cleaned.length > 0 ? cleaned : [label];
    }
    valid.push(field);
  }
  return valid;
}
