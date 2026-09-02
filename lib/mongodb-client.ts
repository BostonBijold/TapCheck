import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

// Wrapped in an async function so a missing/invalid URI becomes a *rejected
// promise* rather than a synchronous throw. This module is imported by
// lib/auth.ts, which every route using resolveSessionUser() pulls in — a
// synchronous throw here crashes at import time, which includes Next.js's
// build-time "Collecting page data" step (it imports every route module to
// inspect it, well before any request ever calls connectDB()/this promise).
// Deferring the throw into a rejection means it only ever surfaces when an
// actual auth operation awaits this promise at runtime, matching how
// lib/mongoose.ts's connectDB() already behaves (lazy, request-time only).
async function createClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  return new MongoClient(uri).connect();
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  const g = global as typeof globalThis & { _mongoClientPromise?: Promise<MongoClient> };
  if (!g._mongoClientPromise) {
    g._mongoClientPromise = createClient();
  }
  clientPromise = g._mongoClientPromise;
} else {
  clientPromise = createClient();
}

export default clientPromise;
