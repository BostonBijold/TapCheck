import mongoose from "mongoose";
import User from "@/models/User";

// SKIP_AUTH's dev user isn't a real Mongo User document (no adapter-driven
// sign-in ever created one), and its id ("dev-local-user") isn't a valid
// ObjectId, so a Mongoose findById/findByIdAndUpdate throws a CastError
// before ever reaching the database. Every other model's userId field is
// plain String (dev-local-user already writes routines/goals/etc. that
// way) — only the User model's implicit _id is ObjectId-typed. Bypass that
// by going through the raw driver collection (no schema casting) instead of
// the Mongoose model, so a real, persisted dev-local-user document works
// the same way any other user's does.
function idFilter(userId: string) {
  return { _id: userId } as unknown as { _id: mongoose.Types.ObjectId };
}

// Resolves a user's currently-selected Philosophy id, or null if they
// haven't picked one yet (a brand-new user, or dev-local-user). Callers must
// have already called connectDB().
export async function resolveSelectedPhilosophyId(userId: string): Promise<string | null> {
  if (!mongoose.isValidObjectId(userId)) {
    const doc = await User.collection.findOne(idFilter(userId));
    return doc?.selectedPhilosophyId ? doc.selectedPhilosophyId.toString() : null;
  }
  const user = await User.findById(userId).select("selectedPhilosophyId").lean();
  return user?.selectedPhilosophyId ? user.selectedPhilosophyId.toString() : null;
}
