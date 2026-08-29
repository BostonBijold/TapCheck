"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Nfc } from "lucide-react";
import Header from "@/components/Header";
import AppIcon from "@/components/AppIcon";

interface DefinitionPlacement {
  taskId: string;
  taskListId: string;
  taskListName: string;
}

interface Definition {
  _id: string;
  name: string;
  icon: string;
  taskType: string;
  formFields: unknown[];
  projectedMinutes: number;
  nfcTagUid: string | null;
  placements: DefinitionPlacement[];
}

interface Props {
  userName: string;
  today: string;
  skipAuth: boolean;
}

// Manager-only "Available Tasks" catalog — every saved task (TaskDefinition)
// the company has, regardless of which lists currently use it. See
// docs/features/task-lists.md's "Company Task Catalog" section. A saved
// task can only be deleted once it's been removed from every list — this
// view surfaces which lists still reference it so that's a clear next step
// rather than an opaque error.
export default function ManageTasksView({ userName, today, skipAuth }: Props) {
  const [definitions, setDefinitions] = useState<Definition[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/task-definitions")
      .then((r) => r.json())
      .then(setDefinitions)
      .catch(() => setDefinitions([]));
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setBlockedMessage(null);
    const res = await fetch(`/api/task-definitions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDefinitions((prev) => (prev ? prev.filter((d) => d._id !== id) : prev));
    } else {
      const body = await res.json().catch(() => ({}));
      setBlockedMessage({ id, message: body.error || "Couldn't delete this task." });
    }
    setDeletingId(null);
  };

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        <div className="mt-4 mb-5 flex items-center gap-2">
          <Link href="/profile" className="flex items-center gap-1 text-muted font-body text-sm min-h-[44px]" aria-label="Back">
            <ChevronLeft size={16} />
          </Link>
          <h1 className="font-heading text-xl text-text">Available Tasks</h1>
        </div>

        <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-3">
          Your company&rsquo;s full saved-task catalog
        </p>

        {definitions === null && (
          <p className="text-dim font-mono text-xs text-center py-8">Loading…</p>
        )}

        {definitions !== null && definitions.length === 0 && (
          <p className="text-dim font-mono text-xs text-center py-8">
            No saved tasks yet — add one from any task list&rsquo;s edit page.
          </p>
        )}

        <div className="space-y-2">
          {definitions?.map((d) => (
            <div key={d._id} className="bg-card rounded-card border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 flex items-center justify-center flex-shrink-0">
                  <AppIcon name={d.icon} size={18} className="text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-text truncate">{d.name}</p>
                  <p className="font-mono text-[10px] text-dim mt-0.5">
                    {d.formFields.length} field{d.formFields.length === 1 ? "" : "s"}
                    {d.placements.length > 0 && (
                      <> · used in {d.placements.map((p) => p.taskListName).join(", ")}</>
                    )}
                    {d.placements.length === 0 && <> · not placed in any list</>}
                  </p>
                </div>
                {d.nfcTagUid && (
                  <span className="flex items-center gap-1 font-mono text-[10px] text-olive bg-olive/10 px-2 py-1 rounded-pill flex-shrink-0">
                    <Nfc size={11} strokeWidth={1.75} />
                    Bound
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                {d.placements.length > 0 ? (
                  <Link
                    href={`/tasks/${d.placements[0].taskListId}/edit`}
                    className="font-mono text-[10px] text-olive uppercase tracking-widest"
                  >
                    Edit in {d.placements[0].taskListName}
                  </Link>
                ) : (
                  <span />
                )}
                <button
                  onClick={() => handleDelete(d._id)}
                  disabled={deletingId === d._id}
                  className="font-mono text-[10px] text-burgundy-light uppercase tracking-widest disabled:opacity-50"
                >
                  {deletingId === d._id ? "Deleting…" : "Delete"}
                </button>
              </div>

              {blockedMessage?.id === d._id && (
                <p className="mt-2 font-mono text-[10px] text-burgundy-light">{blockedMessage.message}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
