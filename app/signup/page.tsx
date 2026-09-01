import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Please fill in every field.",
  weak: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: "Passwords don't match.",
  exists: "An account with that email already exists — try signing in instead.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (session) redirect("/tasks");

  async function signup(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").toLowerCase().trim();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!name || !email || !password || !confirmPassword) redirect("/signup?error=missing");
    if (password.length < MIN_PASSWORD_LENGTH) redirect("/signup?error=weak");
    if (password !== confirmPassword) redirect("/signup?error=mismatch");

    await connectDB();
    const existing = await User.findOne({ email });
    if (existing) redirect("/signup?error=exists");

    const passwordHash = await hashPassword(password);
    // companyId stays null — v1 has no self-serve company creation, a
    // developer manually attaches a pre-created Company doc afterward, same
    // as an OAuth signup (see CLAUDE.md's "Multi-Tenancy").
    await User.create({
      email,
      name,
      passwordHash,
      role: "manager",
      companyId: null,
      emailVerified: null,
    });

    try {
      await signIn("credentials", { email, password, redirectTo: "/welcome" });
    } catch (error) {
      if (error instanceof AuthError) redirect("/login?error=invalid");
      throw error;
    }
  }

  return (
    <main className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-mobile">
        <div className="flex justify-center">
          <Image src="/logo.jpeg" alt="Ch'rps logo" width={120} height={120} priority />
        </div>
        <div className="mb-10 text-center">
          <h1 className="font-brand font-extrabold text-5xl text-olive leading-tight mb-3">
            Ch&apos;rps
          </h1>
          <p className="text-muted font-brand font-bold text-base">
            Create your account
          </p>
        </div>

        {searchParams.error && (
          <p className="text-burgundy-light text-xs text-center mb-4">
            {ERROR_MESSAGES[searchParams.error] ?? "Something went wrong. Please try again."}
          </p>
        )}

        <form action={signup} className="space-y-3">
          <input
            type="text"
            name="name"
            placeholder="Full name"
            required
            autoComplete="name"
            className="w-full bg-card border border-border rounded-xl px-4 py-3.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-olive"
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            required
            autoComplete="email"
            className="w-full bg-card border border-border rounded-xl px-4 py-3.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-olive"
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            autoComplete="new-password"
            className="w-full bg-card border border-border rounded-xl px-4 py-3.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-olive"
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm password"
            required
            autoComplete="new-password"
            className="w-full bg-card border border-border rounded-xl px-4 py-3.5 font-body text-sm text-text placeholder:text-dim focus:outline-none focus:border-olive"
          />
          <button
            type="submit"
            className="w-full bg-olive text-white py-4 rounded-xl font-body font-medium hover:bg-olive-light transition-colors"
          >
            Create account
          </button>
        </form>

        <p className="text-muted text-sm text-center mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-olive font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
