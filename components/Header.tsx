"use client";

import Link from "next/link";
import Image from "next/image";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  userName: string;
  today: string;
  skipAuth?: boolean;
}

export default function Header({ userName, today, skipAuth }: Props) {
  const date = new Date(today + "T12:00:00");
  const dayName = DAYS[date.getDay()];
  const monthName = MONTHS[date.getMonth()];
  const dayNum = date.getDate();

  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-bg border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto max-w-mobile px-4 h-16 grid grid-cols-[44px_1fr_auto] items-center">

        {/* Logo */}
        <div className="flex items-center justify-start">
          <Image
            src="/logo.jpeg"
            alt="TapCheck"
            width={38}
            height={38}
            priority
            className="rounded-full object-cover"
          />
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="font-heading text-xl tracking-wide text-text leading-tight">
            TapCheck
          </h1>
          <p className="font-mono text-dim text-[10px] mt-0.5 tracking-widest uppercase">
            {dayName}, {monthName} {dayNum}
          </p>
        </div>

        {/* User avatar */}
        <div className="flex items-center justify-end gap-1">
          {skipAuth ? (
            <div
              className="w-8 h-8 rounded-full border border-dashed border-border-light flex items-center justify-center bg-card"
              title="Dev mode"
            >
              <span className="text-dim text-xs font-mono">D</span>
            </div>
          ) : (
            <Link
              href="/profile"
              className="relative w-8 h-8 rounded-full overflow-hidden border border-border-light flex items-center justify-center bg-card hover:border-muted transition-colors"
              title="Profile"
            >
              <span className="text-muted text-xs font-mono">{userName[0]?.toUpperCase()}</span>
            </Link>
          )}
        </div>

      </div>
    </header>
  );
}
