import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveSessionUser } from "@/lib/session";
import ProfileView from "@/components/ProfileView";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  const today = new Date().toISOString().split("T")[0];

  return (
    <ProfileView
      name={session?.user?.name ?? "Developer"}
      email={session?.user?.email ?? "dev@local"}
      today={today}
      skipAuth={skipAuth ?? false}
      isManager={sessionUser?.role === "manager"}
    />
  );
}
