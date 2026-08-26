import mongoose from "mongoose";
import User from "@/models/User";
import { weekStartDate } from "@/lib/virtue-dates";

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

// Resolves a user's personal virtue-stacking epoch start (Monday,
// YYYY-MM-DD) — lazily initializes it to the current week on first read, so
// a user with no stored value (brand-new, or pre-dating this feature)
// starts exactly like a fresh signup: a single-virtue check-in that grows
// from here. Callers must have already called connectDB().
export async function resolveVirtueStackStartWeek(userId: string): Promise<string> {
  const thisWeek = weekStartDate(new Date());

  if (!mongoose.isValidObjectId(userId)) {
    const doc = await User.collection.findOne(idFilter(userId));
    if (doc?.virtueStackStartWeek) return doc.virtueStackStartWeek as string;
    await User.collection.updateOne(
      idFilter(userId),
      { $set: { virtueStackStartWeek: thisWeek } },
      { upsert: true }
    );
    return thisWeek;
  }

  const user = await User.findById(userId).select("virtueStackStartWeek").lean();
  if (user?.virtueStackStartWeek) return user.virtueStackStartWeek as string;
  await User.findByIdAndUpdate(userId, { $set: { virtueStackStartWeek: thisWeek } }, { upsert: true });
  return thisWeek;
}
