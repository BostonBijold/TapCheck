// One-off, manually-run script — NOT wired into app boot. Introduces
// Locations against a live, near-launch app that today has no location
// concept at all — see docs/features/locations.md's "Migration / backfill".
//
//   node --env-file=.env.local scripts/backfill-locations.mjs
//
// (swap .env.local for whatever env file / secrets source holds MONGODB_URI
// in the target environment).
//
// Runs in the exact order the design doc calls out as required:
//   1. Create one default Location per existing Company.
//   2. Set every existing User.locationId to that company's default.
//   3. Backfill locationId onto every existing TaskLog/InventoryLog/
//      TaskListSession/MissedListAlert row from the same default.
// Step 3 MUST happen before TaskLog's new unique index
// ({companyId, locationId, taskId, date}) is built against existing data —
// a mix of null and set locationId values racing the index would fail or
// behave unexpectedly. Mongoose builds indexes lazily on first model use,
// so simply running this script before the app serves production traffic
// with the new model code is enough; it does not create the index itself.
//
// Idempotent — every step only touches documents that don't already have a
// locationId (or, for companies, only creates a default Location if none
// exists yet), so it's safe to re-run.

import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/backfill-locations.mjs");
  process.exit(1);
}

const DEFAULT_LOCATION_NAME = "Main Location";

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const companies = db.collection("companies");
const locations = db.collection("locations");
const users = db.collection("users");
const taskLogs = db.collection("tasklogs");
const inventoryLogs = db.collection("inventorylogs");
const taskListSessions = db.collection("tasklistsessions");
const missedListAlerts = db.collection("missedlistalerts");

const allCompanies = await companies.find({}).toArray();
console.log(`Found ${allCompanies.length} compan${allCompanies.length === 1 ? "y" : "ies"}.`);

let createdCount = 0;
const defaultLocationIdByCompany = new Map();

for (const company of allCompanies) {
  const companyId = company._id.toString();

  // Idempotent: reuse an existing default if this company already has one
  // (e.g. a re-run after a partial failure), rather than creating a second.
  let location = await locations.findOne({ companyId, name: DEFAULT_LOCATION_NAME });
  if (!location) {
    const now = new Date();
    const result = await locations.insertOne({
      companyId,
      name: DEFAULT_LOCATION_NAME,
      address: null,
      timezone: company.timezone ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    location = { _id: result.insertedId };
    createdCount++;
    console.log(`  ${companyId} (${company.companyName ?? "unnamed"}) -> created default Location ${location._id}`);
  }
  defaultLocationIdByCompany.set(companyId, location._id.toString());
}
console.log(`Created ${createdCount} default location${createdCount === 1 ? "" : "s"} (${allCompanies.length - createdCount} already had one).`);

// ── Step 2: Users ────────────────────────────────────────────────────────
let userCount = 0;
for (const [companyId, locationId] of defaultLocationIdByCompany) {
  if (!ObjectId.isValid(companyId)) continue; // SKIP_AUTH's dev sentinel isn't a real company
  const result = await users.updateMany(
    { companyId: new ObjectId(companyId), locationId: null },
    { $set: { locationId: new ObjectId(locationId) } }
  );
  userCount += result.modifiedCount;
}
console.log(`Backfilled locationId onto ${userCount} user${userCount === 1 ? "" : "s"}.`);

// ── Step 3: activity-level collections ──────────────────────────────────
// String locationId here, same convention as companyId on these three
// collections (see CLAUDE.md's Multi-Tenancy section) — not an ObjectId.
async function backfillCollection(collection, label) {
  let total = 0;
  for (const [companyId, locationId] of defaultLocationIdByCompany) {
    const result = await collection.updateMany(
      { companyId, locationId: null },
      { $set: { locationId } }
    );
    total += result.modifiedCount;
  }
  console.log(`Backfilled locationId onto ${total} ${label} row${total === 1 ? "" : "s"}.`);
}

await backfillCollection(taskLogs, "TaskLog");
await backfillCollection(inventoryLogs, "InventoryLog");
await backfillCollection(taskListSessions, "TaskListSession");
await backfillCollection(missedListAlerts, "MissedListAlert");

console.log("Done. Safe to deploy app code that relies on TaskLog's new {companyId, locationId, taskId, date} unique index.");
await client.close();
