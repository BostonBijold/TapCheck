"use client";

import { useState } from "react";
import ManagerOverview from "@/components/reports/ManagerOverview";
import EmployeeOverview from "@/components/reports/EmployeeOverview";
import LogsTab from "@/components/reports/LogsTab";

interface Props {
  role: "manager" | "employee";
}

// Thin dispatcher: "Reports" heading + Overview|Logs segmented control,
// branching each tab by role. See docs/features/reports.md.
export default function ReportsContent({ role }: Props) {
  const [tab, setTab] = useState<"overview" | "logs">("overview");

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-xl text-text">Reports</h2>
        <div className="flex bg-card border border-border rounded-pill p-0.5">
          <button
            onClick={() => setTab("overview")}
            className={`font-mono text-xs px-3 py-1.5 rounded-pill transition-colors ${
              tab === "overview" ? "bg-olive text-text" : "text-dim hover:text-muted"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab("logs")}
            className={`font-mono text-xs px-3 py-1.5 rounded-pill transition-colors ${
              tab === "logs" ? "bg-olive text-text" : "text-dim hover:text-muted"
            }`}
          >
            Logs
          </button>
        </div>
      </div>

      {tab === "overview"
        ? (role === "manager" ? <ManagerOverview /> : <EmployeeOverview />)
        : <LogsTab role={role} />}
    </>
  );
}
