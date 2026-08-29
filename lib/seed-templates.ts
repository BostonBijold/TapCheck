import TaskTemplate from "@/models/TaskTemplate";
import type { FormFieldDef } from "@/models/TaskDefinition";

interface SystemTemplate {
  name: string;
  icon: string;
  defaultProjectedMinutes: number;
  category: string;
  timeOfDay: "morning" | "evening" | "any";
  formFields: FormFieldDef[];
}

const bool = (key: string, label: string): FormFieldDef => ({ key, label, type: "boolean" });
const num = (key: string, label: string, extra: Partial<FormFieldDef> = {}): FormFieldDef => ({
  key,
  label,
  type: "number",
  ...extra,
});

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  // ── Opening ──────────────────────────────────────────────────────────────
  {
    name: "Walk-in Fridge Temp", icon: "refrigerator", defaultProjectedMinutes: 2,
    category: "food_safety", timeOfDay: "morning",
    formFields: [num("temperature", "Fridge temperature", { unit: "°F", min: 33, max: 40 })],
  },
  {
    name: "Walk-in Freezer Temp", icon: "snowflake", defaultProjectedMinutes: 2,
    category: "food_safety", timeOfDay: "morning",
    formFields: [num("temperature", "Freezer temperature", { unit: "°F", max: 0 })],
  },
  {
    name: "Handwashing Stations Stocked", icon: "droplets", defaultProjectedMinutes: 3,
    category: "cleaning", timeOfDay: "morning",
    formFields: [
      bool("soap", "Soap stocked"),
      bool("paper_towels", "Paper towels stocked"),
      bool("sanitizer", "Hand sanitizer available"),
    ],
  },
  {
    name: "Floors & Surfaces Clean", icon: "spray-can", defaultProjectedMinutes: 5,
    category: "cleaning", timeOfDay: "morning",
    formFields: [bool("clean", "Floors and surfaces clean")],
  },
  {
    name: "Opening Cash Count", icon: "banknote", defaultProjectedMinutes: 5,
    category: "cash_handling", timeOfDay: "morning",
    formFields: [num("starting_cash", "Starting cash amount", { unit: "$" })],
  },
  {
    name: "Staff Uniform & Hygiene", icon: "shirt", defaultProjectedMinutes: 3,
    category: "cleaning", timeOfDay: "morning",
    formFields: [
      bool("uniform_ok", "Uniforms clean and worn correctly"),
      bool("hygiene_ok", "Hair restraints / hand hygiene followed"),
    ],
  },
  {
    name: "Opening Walkthrough", icon: "clipboard-check", defaultProjectedMinutes: 5,
    category: "opening_closing", timeOfDay: "morning",
    formFields: [
      bool("lights", "Lights on"),
      bool("signage", "Signage / A-frame out"),
      bool("music", "Music / ambiance on"),
    ],
  },

  // ── Mid-shift ────────────────────────────────────────────────────────────
  {
    name: "Line Temp Check", icon: "thermometer", defaultProjectedMinutes: 3,
    category: "food_safety", timeOfDay: "any",
    formFields: [num("temperature", "Hot-holding line temperature", { unit: "°F", min: 135 })],
  },
  {
    name: "Restock Check", icon: "package", defaultProjectedMinutes: 5,
    category: "opening_closing", timeOfDay: "any",
    formFields: [bool("restocked", "Line and supplies restocked")],
  },
  {
    name: "Restroom Check", icon: "toilet", defaultProjectedMinutes: 3,
    category: "cleaning", timeOfDay: "any",
    formFields: [bool("clean", "Clean"), bool("stocked", "Stocked (soap, paper towels, TP)")],
  },
  {
    name: "Trash & Recycling", icon: "trash-2", defaultProjectedMinutes: 5,
    category: "cleaning", timeOfDay: "any",
    formFields: [bool("emptied", "Bins emptied")],
  },

  // ── Closing ──────────────────────────────────────────────────────────────
  {
    name: "Walk-in Fridge Temp (Close)", icon: "refrigerator", defaultProjectedMinutes: 2,
    category: "food_safety", timeOfDay: "evening",
    formFields: [num("temperature", "Fridge temperature", { unit: "°F", min: 33, max: 40 })],
  },
  {
    name: "Walk-in Freezer Temp (Close)", icon: "snowflake", defaultProjectedMinutes: 2,
    category: "food_safety", timeOfDay: "evening",
    formFields: [num("temperature", "Freezer temperature", { unit: "°F", max: 0 })],
  },
  {
    name: "Equipment Powered Down", icon: "power-off", defaultProjectedMinutes: 5,
    category: "equipment", timeOfDay: "evening",
    formFields: [
      bool("fryers", "Fryers off"),
      bool("grill", "Grill / oven off"),
      bool("small_appliances", "Small appliances unplugged"),
    ],
  },
  {
    name: "Deep Clean Kitchen", icon: "sparkles", defaultProjectedMinutes: 15,
    category: "cleaning", timeOfDay: "evening",
    formFields: [bool("clean", "Kitchen deep-cleaned")],
  },
  {
    name: "Closing Cash Reconciliation", icon: "banknote", defaultProjectedMinutes: 10,
    category: "cash_handling", timeOfDay: "evening",
    formFields: [
      num("ending_cash", "Ending cash amount", { unit: "$" }),
      num("variance", "Variance from expected", { unit: "$" }),
    ],
  },
  {
    name: "Trash Taken Out", icon: "trash-2", defaultProjectedMinutes: 5,
    category: "cleaning", timeOfDay: "evening",
    formFields: [bool("taken_out", "Trash taken to dumpster")],
  },
  {
    name: "Doors Locked / Alarm Set", icon: "lock-keyhole", defaultProjectedMinutes: 3,
    category: "opening_closing", timeOfDay: "evening",
    formFields: [bool("doors_locked", "All doors locked"), bool("alarm_set", "Alarm set")],
  },

  // ── Any time (browsable catalog only, not auto-seeded) ──────────────────
  {
    name: "Prep Cooler Temp Log", icon: "refrigerator", defaultProjectedMinutes: 2,
    category: "food_safety", timeOfDay: "any",
    formFields: [num("temperature", "Prep cooler temperature", { unit: "°F", min: 33, max: 40 })],
  },
  {
    name: "Delivery Temperature Check", icon: "thermometer", defaultProjectedMinutes: 3,
    category: "food_safety", timeOfDay: "any",
    formFields: [num("temperature", "Delivery temperature", { unit: "°F" })],
  },
  {
    name: "Pest Control Check", icon: "bug", defaultProjectedMinutes: 5,
    category: "cleaning", timeOfDay: "any",
    formFields: [bool("clear", "No signs of pest activity")],
  },
  {
    name: "Manager Walkthrough", icon: "clipboard-check", defaultProjectedMinutes: 10,
    category: "opening_closing", timeOfDay: "any",
    formFields: [bool("floor_ok", "Floor looks presentable"), bool("staff_ok", "Staff on task")],
  },
];

export const DEFAULT_OPENING_NAMES = [
  "Walk-in Fridge Temp",
  "Walk-in Freezer Temp",
  "Handwashing Stations Stocked",
  "Floors & Surfaces Clean",
  "Opening Cash Count",
  "Staff Uniform & Hygiene",
  "Opening Walkthrough",
];

export const DEFAULT_MIDSHIFT_NAMES = [
  "Line Temp Check",
  "Restock Check",
  "Restroom Check",
  "Trash & Recycling",
];

export const DEFAULT_CLOSING_NAMES = [
  "Walk-in Fridge Temp (Close)",
  "Walk-in Freezer Temp (Close)",
  "Equipment Powered Down",
  "Deep Clean Kitchen",
  "Closing Cash Reconciliation",
  "Trash Taken Out",
  "Doors Locked / Alarm Set",
];

// Idempotent — always updates icon/fields so changes propagate to existing data
export async function ensureSystemTemplates() {
  await TaskTemplate.bulkWrite(
    SYSTEM_TEMPLATES.map((t) => ({
      updateOne: {
        filter: { name: t.name, isSystem: true },
        update: {
          $setOnInsert: { companyId: null, isActive: true },
          $set: {
            icon: t.icon,
            defaultProjectedMinutes: t.defaultProjectedMinutes,
            category: t.category,
            timeOfDay: t.timeOfDay,
            formFields: t.formFields,
          },
        },
        upsert: true,
      },
    }))
  );
}
