import { Schema, model, models } from "mongoose";

// Extends the NextAuth MongoDBAdapter `users` collection with app-specific fields.
// Do not redeclare fields the adapter owns (email, name, image, emailVerified).
const UserSchema = new Schema(
  {
    virtueWalkthroughSeen: { type: Boolean, default: false },
    // Which Philosophy (virtue set) this user has picked as their active
    // focus — null until they choose one via the Virtues-page marketplace.
    selectedPhilosophyId: { type: Schema.Types.ObjectId, ref: "Philosophy", default: null },
    // Monday (YYYY-MM-DD, see lib/virtue-dates.ts weekStartDate) of the week
    // this user's personal virtue-stacking epoch began — reset to "this
    // week" on first use, on an explicit Virtue Reset, or whenever
    // selectedPhilosophyId changes. Drives how many virtues appear in this
    // user's daily check-in (see lib/virtue-dates.ts personalStackSize) —
    // entirely separate from the shared, calendar-driven "this week's
    // virtue" highlight, which every user sees identically regardless of
    // this field.
    virtueStackStartWeek: { type: String, default: null },
    // Long-lived token for external triggers (e.g. an iPhone Shortcut fired by
    // an NFC tag) — see app/api/external/start-timer. Generated once, lazily,
    // the first time it's requested; never rotated automatically.
    apiKey: { type: String, default: null, index: true, unique: true, sparse: true },
    // Live Activity push-update token — see docs/features/live-activity.md's
    // "Push-driven updates" section and lib/apns.ts. Re-issued by iOS
    // periodically; POST /api/live-activity/push-token always overwrites
    // rather than versioning, since only the latest token is ever usable and
    // there's at most one relevant Live Activity per user at a time (the
    // single-active-timer invariant).
    liveActivityPushToken: { type: String, default: null },
    // "sandbox" for a Development-signed build (Xcode Debug config — what
    // this personal app runs today), "production" for a Distribution-signed
    // build (App Store/TestFlight). APNs rejects a token sent to the wrong
    // host outright, so this has to travel with the token, not be a single
    // server-wide setting.
    liveActivityPushEnvironment: { type: String, enum: ["sandbox", "production"], default: null },
  },
  {
    strict: false, // allow adapter-owned fields to coexist without declaring them
    timestamps: true,
  }
);

export default models.User || model("User", UserSchema);
