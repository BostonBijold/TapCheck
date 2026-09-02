"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // The scroll container below is shared across every nested route (this
  // layout never remounts on client-side nav), so without this its
  // scrollTop carries over from whatever page you left — e.g. landing on
  // Reports still scrolled halfway down from Tasks. Reset it to the top
  // whenever the route changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <div ref={scrollRef} className="app-scroll h-full overflow-y-auto overscroll-none">
        {children}
      </div>
      <BottomNav />
    </>
  );
}
