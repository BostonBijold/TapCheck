import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Company from "@/models/Company";
import { resolveSessionUser } from "@/lib/session";
import CompanySettingsView from "@/components/CompanySettingsView";
import type { NotificationSound } from "@/lib/notification-sound";

export const dynamic = "force-dynamic";

// Manager-only — reached from a manager-only link on the Profile page.
export default async function CompanySettingsPage() {
  const skipAuth = process.env.SKIP_AUTH === "true";
  const session = await auth();
  if (!skipAuth && !session?.user?.id) redirect("/login");

  const sessionUser = await resolveSessionUser();
  if (!sessionUser) redirect("/login");
  const { companyId } = sessionUser;
  if (!companyId) redirect("/tasks");
  if (sessionUser.role !== "manager") redirect("/tasks");

  await connectDB();
  const company = await Company.findById(companyId, "notificationSound").lean<{ notificationSound?: string }>();

  const userName = session?.user?.name ?? "Developer";
  const today = new Date().toISOString().split("T")[0];

  return (
    <CompanySettingsView
      userName={userName}
      today={today}
      skipAuth={skipAuth}
      initialNotificationSound={(company?.notificationSound as NotificationSound) ?? "standard"}
    />
  );
}
