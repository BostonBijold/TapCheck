// One-off, manually-run script — NOT wired into app boot. Splits every
// existing Task document (which today embeds name/icon/taskType/formFields/
// nfcTagUid/templateId directly) into a TaskDefinition (the reusable,
// physical-location-bound "saved task") plus a slimmed-down Task
// (list-placement only) referencing it via definitionId. See the "Company
// Task Catalog" design in docs/features/task-lists.md.
//
//   node --env-file=.env.local scripts/migrate-task-definitions.mjs
//
// (swap .env.local for whatever env file / secrets source holds MONGODB_URI
// in the target environment).
//
// Idempotent — only touches a Task that doesn't already have definitionId
// set, so it's safe to re-run (e.g. after a partial failure).

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/migrate-task-definitions.mjs");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const tasks = db.collection("tasks");
const taskDefinitions = db.collection("taskdefinitions");

const pending = await tasks.find({ definitionId: { $exists: false } }).toArray();
console.log(`Found ${pending.length} task(s) to migrate...`);

let migrated = 0;
for (const task of pending) {
  const now = new Date();
  const definition = {
    companyId: task.companyId,
    templateId: task.templateId ?? null,
    name: task.name,
    icon: task.icon,
    taskType: task.taskType ?? "form",
    formFields: task.formFields ?? [],
    projectedMinutes: task.projectedMinutes ?? 0,
    nfcTagUid: task.nfcTagUid ?? null,
    isActive: true,
    createdAt: task.createdAt ?? now,
    updatedAt: now,
  };
  const { insertedId } = await taskDefinitions.insertOne(definition);

  // projectedMinutes set to null (not preserved) on the placement — the
  // definition just inherited that exact value as its own default, so
  // "inherit the default" resolves identically today, and leaves this
  // placement free of a redundant override going forward.
  await tasks.updateOne(
    { _id: task._id },
    {
      $set: { definitionId: insertedId, projectedMinutes: null },
      $unset: { name: "", icon: "", taskType: "", formFields: "", nfcTagUid: "", templateId: "" },
    }
  );
  migrated++;
}

console.log(`Migrated ${migrated} task(s) into their own TaskDefinition.`);
await client.close();
