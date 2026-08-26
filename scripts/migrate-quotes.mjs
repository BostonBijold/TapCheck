// One-off migration for the Quote Collection feature — NOT wired into app
// boot. Run manually, exactly once per environment, after deploying the
// Quote model:
//
//   node --env-file=.env.local scripts/migrate-quotes.mjs
//
// (swap .env.local for whatever env file / secrets source holds MONGODB_URI
// in the target environment).
//
// The personal quote collection already lives in this database as the
// "quotes" collection — the same collection Mongoose's Quote model reads
// from (pluralized default for `model("Quote", ...)`) — in its original
// shape: { quote, author, genre }. This migrates those documents in place
// to the app's shape: { text, author, genre, virtue: unset,
// virtueDayIndex: unset, isActive: true, createdAt }.
//
// Straight field rename, no fuzzy matching — `virtue`/`virtueDayIndex` are
// left unset for every migrated doc; they get filled in over time via the
// admin authoring tool. Idempotent: only touches documents that still have
// the legacy `quote` field and no `text` field yet, so it's safe to re-run.

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/migrate-quotes.mjs");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const quotes = db.collection("quotes");

  const legacyDocs = await quotes.find({ quote: { $exists: true }, text: { $exists: false } }).toArray();
  console.log(`Found ${legacyDocs.length} legacy quote document(s) to migrate.`);

  let migrated = 0;
  for (const doc of legacyDocs) {
    await quotes.updateOne(
      { _id: doc._id },
      {
        $set: {
          text: doc.quote,
          genre: doc.genre ?? "",
          isActive: true,
          createdAt: doc.createdAt ?? new Date(),
        },
        $unset: { quote: "" },
      }
    );
    migrated++;
  }

  console.log(`Migrated ${migrated} quote(s).`);

  await client.close();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
