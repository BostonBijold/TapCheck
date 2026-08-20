import { Schema, model, models } from "mongoose";

// Extends the NextAuth MongoDBAdapter `users` collection with app-specific fields.
// Do not redeclare fields the adapter owns (email, name, image, emailVerified).
const UserSchema = new Schema(
  {
    virtueWalkthroughSeen: { type: Boolean, default: false },
    // Which Philosophy (virtue set) this user has picked as their active
    // focus — null until they choose one via the Virtues-page marketplace.
    selectedPhilosophyId: { type: Schema.Types.ObjectId, ref: "Philosophy", default: null },
    // Long-lived token for external triggers (e.g. an iPhone Shortcut fired by
    // an NFC tag) — see app/api/external/start-timer. Generated once, lazily,
    // the first time it's requested; never rotated automatically.
    apiKey: { type: String, default: null, index: true, unique: true, sparse: true },
  },
  {
    strict: false, // allow adapter-owned fields to coexist without declaring them
    timestamps: true,
  }
);

export default models.User || model("User", UserSchema);
