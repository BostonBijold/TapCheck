// Shared admin check — this app has no `role` field on `User` (see
// docs/features/virtues.md); "admin" is a single hardcoded email, gated the
// same way everywhere it's needed, plus the usual SKIP_AUTH dev bypass.
const ADMIN_EMAIL = "bostonrbijold@gmail.com";

export function isAdmin(email?: string | null): boolean {
  return email === ADMIN_EMAIL || process.env.SKIP_AUTH === "true";
}
