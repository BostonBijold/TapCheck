// One-off, manually-run script — NOT wired into app boot. Bulk-generates
// unclaimed NfcTag rows ahead of manufacturing physical tags, so each tag
// can be pre-programmed (with an NFC writer app) with a working URL before
// any company claims it. See docs/features/nfc.md.
//
//   node --env-file=.env.local scripts/generate-nfc-tags.mjs [count]
//
// (swap .env.local for whatever env file / secrets source holds MONGODB_URI
// in the target environment). count defaults to 10.
//
// Prints each tagCode's full URL — write that exact URL to a physical tag
// with an NFC writer app. Domain is hardcoded to match capacitor.config.ts's
// server.url; update both together if the production domain ever changes.

import { MongoClient } from "mongodb";
import crypto from "crypto";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/generate-nfc-tags.mjs");
  process.exit(1);
}

const DOMAIN = "tap-check.vercel.app";
const COUNT = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 10;

// Excludes 0/O and 1/l/I — avoids ambiguity if a tagCode ever needs to be
// read off packaging and typed by hand.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function generateTagCode() {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db();
  const nfcTags = db.collection("nfctags");

  const codes = [];
  while (codes.length < COUNT) {
    const code = generateTagCode();
    const exists = await nfcTags.findOne({ tagCode: code });
    if (!exists) codes.push(code);
  }

  const now = new Date();
  await nfcTags.insertMany(
    codes.map((tagCode) => ({
      tagCode,
      companyId: null,
      taskId: null,
      taskListId: null,
      claimedByUserId: null,
      claimedAt: null,
      createdAt: now,
      updatedAt: now,
    }))
  );

  console.log(`Generated ${codes.length} unclaimed NFC tags:\n`);
  for (const code of codes) {
    console.log(`  ${code}  ->  https://${DOMAIN}/nfc/${code}`);
  }
} finally {
  await client.close();
}
