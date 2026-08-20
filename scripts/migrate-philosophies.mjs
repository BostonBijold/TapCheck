// One-off migration for the Virtue Marketplace feature — NOT wired into app
// boot. Run manually, exactly once per environment, after deploying the
// Philosophy/philosophyId schema changes:
//
//   node --env-file=.env.local scripts/migrate-philosophies.mjs
//
// (swap .env.local for whatever env file / secrets source holds MONGODB_URI
// in the target environment).
//
// Idempotent in the sense that it's safe to re-run if interrupted — every
// step checks "has this already been done" before acting — but it must never
// be invoked from application code. Unlike this app's ensure*() seed
// functions (safe to run on every page load because they only add missing
// per-user defaults), re-running this as an ongoing rule would silently
// default every brand-new user's selectedPhilosophyId to AGM and they'd
// never see the marketplace.
//
// Steps:
//   1. Create the "A Good Man" Philosophy (isSystem: true, slug "agm") for
//      the existing hand-inserted 13 virtues, if it doesn't exist yet.
//   2. Backfill philosophyId on every Virtue doc missing it -> that philosophy.
//   3. Backfill philosophyId on every VirtueCheckIn doc missing it -> same.
//   4. Backfill selectedPhilosophyId on every User doc where it's unset -> same.
//   5. Seed Benjamin Franklin's 13 Virtues as a second isSystem Philosophy
//      (slug "franklin-13"), so the marketplace has a real second option.

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/migrate-philosophies.mjs");
  process.exit(1);
}

const FRANKLIN_VIRTUES = [
  { name: "Temperance", tagline: "Eat not to dullness; drink not to elevation." },
  { name: "Silence", tagline: "Speak not but what may benefit others or yourself; avoid trifling conversation." },
  { name: "Order", tagline: "Let all your things have their places; let each part of your business have its time." },
  { name: "Resolution", tagline: "Resolve to perform what you ought; perform without fail what you resolve." },
  { name: "Frugality", tagline: "Make no expense but to do good to others or yourself; waste nothing." },
  { name: "Industry", tagline: "Lose no time; be always employed in something useful; cut off all unnecessary actions." },
  { name: "Sincerity", tagline: "Use no hurtful deceit; think innocently and justly, and speak accordingly." },
  { name: "Justice", tagline: "Wrong none by doing injuries, or omitting the benefits that are your duty." },
  { name: "Moderation", tagline: "Avoid extremes; forbear resenting injuries so much as you think they deserve." },
  { name: "Cleanliness", tagline: "Tolerate no uncleanliness in body, clothes, or habitation." },
  { name: "Tranquility", tagline: "Be not disturbed at trifles, or at accidents common or unavoidable." },
  { name: "Chastity", tagline: "Rarely use venery but for health or offspring, never to dullness, weakness, or the injury of your own or another's peace or reputation." },
  { name: "Humility", tagline: "Imitate Jesus and Socrates." },
];

function slugify(s) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const philosophies = db.collection("philosophies");
  const virtues = db.collection("virtues");
  const virtueCheckIns = db.collection("virtuecheckins");
  const users = db.collection("users");

  // ── 1. AGM philosophy ──────────────────────────────────────────────────
  let agm = await philosophies.findOne({ slug: "agm" });
  if (!agm) {
    const res = await philosophies.insertOne({
      name: "A Good Man",
      slug: "agm",
      description: "Marcus Aurelius and Ben Franklin, reclaimed for a modern man's daily discipline.",
      isSystem: true,
      isActive: true,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    agm = { _id: res.insertedId };
    console.log("Created AGM philosophy:", agm._id.toString());
  } else {
    console.log("AGM philosophy already exists:", agm._id.toString());
  }

  // ── 2. Backfill Virtue.philosophyId ────────────────────────────────────
  const virtueBackfill = await virtues.updateMany(
    { philosophyId: { $exists: false } },
    { $set: { philosophyId: agm._id } }
  );
  console.log(`Backfilled philosophyId on ${virtueBackfill.modifiedCount} existing virtue(s).`);

  // ── 3. Backfill VirtueCheckIn.philosophyId ─────────────────────────────
  const checkInBackfill = await virtueCheckIns.updateMany(
    { philosophyId: { $exists: false } },
    { $set: { philosophyId: agm._id } }
  );
  console.log(`Backfilled philosophyId on ${checkInBackfill.modifiedCount} existing check-in(s).`);

  // ── 4. Backfill User.selectedPhilosophyId ──────────────────────────────
  const userBackfill = await users.updateMany(
    { selectedPhilosophyId: { $in: [null, undefined] } },
    { $set: { selectedPhilosophyId: agm._id } }
  );
  console.log(`Backfilled selectedPhilosophyId on ${userBackfill.modifiedCount} existing user(s).`);

  // ── 5. Seed Franklin's 13 ───────────────────────────────────────────────
  let franklin = await philosophies.findOne({ slug: "franklin-13" });
  if (!franklin) {
    const res = await philosophies.insertOne({
      name: "Franklin's 13 Virtues",
      slug: "franklin-13",
      description: "Benjamin Franklin's own list, kept exactly as he wrote it in his autobiography.",
      isSystem: true,
      isActive: true,
      order: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    franklin = { _id: res.insertedId };
    console.log("Created Franklin's 13 philosophy:", franklin._id.toString());
  } else {
    console.log("Franklin's 13 philosophy already exists:", franklin._id.toString());
  }

  const existingFranklinVirtues = await virtues.countDocuments({ philosophyId: franklin._id });
  if (existingFranklinVirtues === 0) {
    const now = new Date();
    const docs = FRANKLIN_VIRTUES.map((v, i) => ({
      philosophyId: franklin._id,
      name: v.name,
      slug: slugify(v.name),
      tagline: v.tagline,
      displayName: v.name,
      order: i + 1,
      essay: "",
      etymology: "",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));
    await virtues.insertMany(docs);
    console.log(`Inserted ${docs.length} Franklin virtues.`);
  } else {
    console.log(`Franklin's 13 already has ${existingFranklinVirtues} virtue(s) — skipping seed.`);
  }

  await client.close();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
