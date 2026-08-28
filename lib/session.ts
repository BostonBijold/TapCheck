import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";

export type UserRole = "manager" | "employee";

export interface SessionUser {
  userId: string;
  // Null means "not yet provisioned" — a signed-in user with no Company
  // attached in MongoDB yet. Callers must treat this as no access, never as
  // its own shared tenant.
  companyId: string | null;
  role: UserRole;
}

export const DEV_USER_ID = "dev-local-user";
export const DEV_COMPANY_ID = "dev-local-company";

// Resolves the signed-in user's id, companyId, and role for scoping every
// DB query. companyId/role are read fresh from the User document on every
// call rather than cached on the JWT — since v1 has no invitation flow, a
// company/role assignment is made by hand directly in MongoDB, and it needs
// to take effect on the very next request instead of waiting for a new
// sign-in to refresh the token.
export async function resolveSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (!sessionUserId) {
    if (process.env.SKIP_AUTH === "true") {
      return { userId: DEV_USER_ID, companyId: DEV_COMPANY_ID, role: "manager" };
    }
    return null;
  }

  await connectDB();
  const user = await User.findById(sessionUserId, "companyId role").lean<{
    companyId?: { toString(): string } | null;
    role?: UserRole;
  }>();
  if (!user) return null;

  return {
    userId: sessionUserId,
    companyId: user.companyId ? user.companyId.toString() : null,
    role: user.role ?? "manager",
  };
}
