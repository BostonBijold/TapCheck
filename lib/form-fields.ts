import type { FormFieldDef } from "@/models/Task";

// Validates/sanitizes a client-supplied formFields payload — drops any entry
// that doesn't have the minimum required shape instead of trusting
// Array.isArray alone. Shared by the tasks and task-templates write routes
// so a real UI (TaskFieldsEditor) can't write malformed data.
export function sanitizeFormFields(input: unknown): FormFieldDef[] {
  if (!Array.isArray(input)) return [];

  const valid: FormFieldDef[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const { key, label, type, unit, min, max } = entry as Record<string, unknown>;
    if (typeof key !== "string" || !key) continue;
    if (typeof label !== "string" || !label) continue;
    if (type !== "number" && type !== "text" && type !== "boolean") continue;

    const field: FormFieldDef = { key, label, type };
    if (type === "number") {
      if (typeof unit === "string" && unit) field.unit = unit;
      if (typeof min === "number") field.min = min;
      if (typeof max === "number") field.max = max;
    }
    valid.push(field);
  }
  return valid;
}
