import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { resolveSessionUser } from "@/lib/session";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";

// Lets a signed-in user set (Google-only account, no passwordHash yet) or
// change (already has one) their credentials-sign-in password from the
// Profile page. See models/User.ts's passwordHash field.
export async function PATCH(req: Request) {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }

  await connectDB();
  const user = await User.findById(sessionUser.userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.passwordHash) {
    const valid = typeof currentPassword === "string" && (await verifyPassword(currentPassword, user.passwordHash));
    if (!valid) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  return NextResponse.json({ ok: true });
}
