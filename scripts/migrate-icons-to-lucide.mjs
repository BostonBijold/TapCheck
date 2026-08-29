// One-off, manually-run script — NOT wired into app boot. Updates every
// already-seeded TaskDefinition's `icon` field from a raw emoji to the
// matching lucide icon key (see components/AppIcon.tsx) — lib/seed.ts and
// lib/seed-templates.ts were updated to use these keys for any NEW company,
// but a company seeded before that change still has emoji baked into its
// existing TaskDefinition documents. Matches by name, since that's how the
// original seed data was keyed.
//
//   node --env-file=.env.local scripts/migrate-icons-to-lucide.mjs
//
// Idempotent — re-running just re-applies the same mapping.

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/migrate-icons-to-lucide.mjs");
  process.exit(1);
}

const ICON_BY_NAME = {
  "Walk-in Fridge Temp": "refrigerator",
  "Walk-in Freezer Temp": "snowflake",
  "Handwashing Stations Stocked": "droplets",
  "Floors & Surfaces Clean": "spray-can",
  "Opening Cash Count": "banknote",
  "Staff Uniform & Hygiene": "shirt",
  "Opening Walkthrough": "clipboard-check",
  "Line Temp Check": "thermometer",
  "Restock Check": "package",
  "Restroom Check": "toilet",
  "Trash & Recycling": "trash-2",
  "Walk-in Fridge Temp (Close)": "refrigerator",
  "Walk-in Freezer Temp (Close)": "snowflake",
  "Equipment Powered Down": "power-off",
  "Deep Clean Kitchen": "sparkles",
  "Closing Cash Reconciliation": "banknote",
  "Trash Taken Out": "trash-2",
  "Doors Locked / Alarm Set": "lock-keyhole",
  "Prep Cooler Temp Log": "refrigerator",
  "Delivery Temperature Check": "thermometer",
  "Pest Control Check": "bug",
  "Manager Walkthrough": "clipboard-check",
  "Fridge": "refrigerator",
  "Freezer": "snowflake",
  "Men's Room": "toilet",
  "Women's Room": "toilet",
};

const client = new MongoClient(uri);
await client.connect();
const db = client.db();

let definitionsUpdated = 0;
for (const [name, icon] of Object.entries(ICON_BY_NAME)) {
  const res = await db.collection("taskdefinitions").updateMany({ name }, { $set: { icon } });
  definitionsUpdated += res.modifiedCount;
}
console.log(`Updated ${definitionsUpdated} TaskDefinition document(s).`);

let templatesUpdated = 0;
for (const [name, icon] of Object.entries(ICON_BY_NAME)) {
  const res = await db.collection("tasktemplates").updateMany({ name, isSystem: true }, { $set: { icon } });
  templatesUpdated += res.modifiedCount;
}
console.log(`Updated ${templatesUpdated} TaskTemplate document(s).`);

await client.close();
