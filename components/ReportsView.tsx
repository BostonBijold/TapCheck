"use client";

import Header from "@/components/Header";
import ReportsContent from "@/components/ReportsContent";

interface Props {
  userName: string;
  today: string;
  role: "manager" | "employee" | "owner";
  skipAuth?: boolean;
}

export default function ReportsView({ userName, today, role, skipAuth }: Props) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-12">
        <Header userName={userName} today={today} skipAuth={skipAuth} />
        <ReportsContent role={role} />
      </div>
    </div>
  );
}
