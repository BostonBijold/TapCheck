"use client";

import Header from "@/components/Header";
import AnalyticsContent from "@/components/AnalyticsContent";

interface Props {
  userName: string;
  today: string;
  skipAuth?: boolean;
}

export default function AnalyticsView({ userName, today, skipAuth }: Props) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-12">
        <Header userName={userName} today={today} skipAuth={skipAuth} />
        <AnalyticsContent />
      </div>
    </div>
  );
}
