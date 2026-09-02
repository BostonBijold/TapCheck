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
    // null is also valid here (alongside companyId: null) — the state
    // DELETE /api/team/[userId] leaves a removed teammate in, "not yet
    // attached to any company," same as a brand-new sign-up. Every
    // company-scoped route already gates on companyId being non-null first,
    // so a null role never grants access on its own — see lib/session.ts's
    // resolveSessionUser(), which only reads role once companyId is known.
    role: { type: String, enum: ["manager", "employee", null], default: "manager" },
    // Set alongside companyId/role at invite redemption (see
    // app/invite/[token]/page.tsx and docs/features/team-invites.md) —
    // distinct from the adapter-owned account-creation timestamp, so
    // re-joining a *different* company later reflects current tenure there,
    // not when the underlying account was first created. Null for anyone
    // hand-attached to a company directly in MongoDB rather than through an
    // invite (all pre-existing users, and any future manual assignment).
    companyJoinedAt: { type: Date, default: null },
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
    // bcrypt hash for manual email/password sign-in (see lib/password.ts,
    // the Credentials provider in lib/auth.ts, and app/signup) — added
    // alongside Google OAuth so Apple's App Review team has a sign-in path
    // that doesn't depend on a real Google account. Null for a Google-only
    // account; the Profile page lets a Google user set one later, and
    // lets anyone with one change it, via PATCH /api/user/password. Never
    // include this field in a value returned from an API response —
    // existing User queries elsewhere all project specific fields rather
    // than returning the raw doc, keep that pattern.
    passwordHash: { type: String, default: null },
  },
  {
    strict: false, // allow adapter-owned fields to coexist without declaring them
    timestamps: true,
  }
);

export default models.User || model("User", UserSchema);
