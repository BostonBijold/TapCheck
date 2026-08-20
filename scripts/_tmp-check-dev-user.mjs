import { MongoClient } from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();
const doc = await db.collection("users").findOne({ _id: "dev-local-user" });
console.log("dev-local-user doc:", JSON.stringify(doc));
await client.close();
