// One-off, manually-run script — NOT wired into app boot. Backfills
// Company.timezone for every pre-existing company (created before the
// missed-shift-list alert sweep added this field — see
// docs/features/notifications.md). Defaults to a reasonable US zone rather
// than guessing wrong silently; every backfilled company is logged so a
// developer can manually correct any that actually operate outside it.
//
//   node --env-file=.env.local scripts/backfill-company-timezone.mjs
//
// (swap .env.local for whatever env file / secrets source holds MONGODB_URI
// in the target environment).
//
// Idempotent — only touches a Company whose timezone is currently null, so
// it's safe to re-run (e.g. after manually correcting a few by hand).

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/backfill-company-timezone.mjs");
  process.exit(1);
}

// Not a real inference of each company's actual location — just a
// reasonable placeholder so the missed-list sweep can start evaluating
// these companies immediately instead of silently skipping them forever.
// Flag every backfilled company below and correct it by hand (or point the
// manager at Company Settings) once its real timezone is known.
const DEFAULT_TIMEZONE = "America/Chicago";

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const companies = db.collection("companies");

const pending = await companies.find({ timezone: null }).toArray();
console.log(`Found ${pending.length} compan${pending.length === 1 ? "y" : "ies"} with no timezone set...`);

for (const company of pending) {
  await companies.updateOne({ _id: company._id }, { $set: { timezone: DEFAULT_TIMEZONE } });
  console.log(`  ${company._id} (${company.companyName ?? "unnamed"}) -> ${DEFAULT_TIMEZONE} — verify/correct manually`);
}

console.log(`Backfilled ${pending.length} compan${pending.length === 1 ? "y" : "ies"} to ${DEFAULT_TIMEZONE}.`);
await client.close();
