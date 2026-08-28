import { Schema, model, models } from "mongoose";

// Extends the NextAuth MongoDBAdapter `users` collection with app-specific fields.
// Do not redeclare fields the adapter owns (email, name, image, emailVerified).
const UserSchema = new Schema(
  {
    // Tenant this user belongs to. Null until a developer manually attaches
    // a pre-created Company doc by hand in MongoDB — v1 has no self-serve
    // company creation or invitation flow. A null companyId means "not yet
    // provisioned," never "shared across every unassigned user" — every
    // company-scoped query must treat it as no access, not as its own tenant.
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    // Freely editable by hand in MongoDB for manual testing until a real
    // invitation/role-assignment flow exists. Defaults to "manager" on
    // signup (stamped explicitly in lib/auth.ts's createUser event, since
    // the MongoDB adapter inserts the user doc directly and never applies
    // Mongoose schema defaults).
    role: { type: String, enum: ["manager", "employee"], default: "manager" },
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
