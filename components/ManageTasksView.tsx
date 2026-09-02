"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { ChevronLeft, ChevronRight, Copy, Nfc } from "lucide-react";
import Header from "@/components/Header";
import AppIcon from "@/components/AppIcon";
import AddTaskListSheet from "@/components/AddTaskListSheet";
import AddTaskSheet from "@/components/AddTaskSheet";
import { scanNfcTag } from "@/lib/native/nfc-scan";
import type { FormFieldDef } from "@/models/TaskDefinition";

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

interface ManageTaskList {
  _id: string;
  name: string;
  startTime: string | null;
}

interface StandaloneTask {
  _id: string;
  name: string;
  icon: string;
  projectedMinutes: number;
  taskListId: string;
  taskListName: string;
}

interface Props {
  userName: string;
  today: string;
  skipAuth: boolean;
  taskLists: ManageTaskList[];
  standaloneTasks: StandaloneTask[];
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

// ── Company task catalog row — scan-to-complete binding lives here, at the
// definition level, so it works for a saved task regardless of which list
// (if any) currently places it. See docs/features/nfc.md's "In-app
// scan-to-complete binding" and docs/features/task-lists.md's "Company Task
// Catalog" section. Mirrors TaskListEditView.tsx's SortableRow bind logic,
// minus drag-and-drop and the tap-to-trigger "NFC Tag" panel (that one
// stays placement-scoped, unaffected by this screen). ──
function CatalogRow({
  definition,
  onDelete,
  deleting,
  blockedMessage,
}: {
  definition: Definition;
  onDelete: (id: string) => void;
  deleting: boolean;
  blockedMessage: string | null;
}) {
  const [nfcTagUid, setNfcTagUid] = useState<string | null>(definition.nfcTagUid);
  const [bindBusy, setBindBusy] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  // Other active targets already bound to the same UID — a tag can now back
  // more than one target (see docs/features/nfc.md's "Multi-target
  // binding"), so binding here never fails or clears another's binding, it
  // just informs the manager the tag is about to do double duty.
  const [alsoBoundTo, setAlsoBoundTo] = useState<string[]>([]);

  async function handleScanToLink() {
    setBindError(null);
    if (!Capacitor.isNativePlatform()) {
      setBindError("Open the app on your phone to scan a tag.");
      return;
    }
    setBindBusy(true);
    const result = await scanNfcTag();
    if (result.status !== "ok") {
      setBindBusy(false);
      setBindError(result.status === "unsupported" ? "NFC isn't available on this device." : result.message);
      return;
    }
    try {
      const res = await fetch(`/api/task-definitions/${definition._id}/nfc-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: result.uid }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to bind tag");
      const body = await res.json();
      setNfcTagUid(result.uid);
      setAlsoBoundTo(body.alsoBoundTo ?? []);
    } catch (err) {
      setBindError(err instanceof Error ? err.message : "Failed to bind tag");
    } finally {
      setBindBusy(false);
    }
  }

  async function handleUnbindTag() {
    setBindBusy(true);
    setBindError(null);
    try {
      const res = await fetch(`/api/task-definitions/${definition._id}/nfc-tag`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to unbind tag");
      setNfcTagUid(null);
      setAlsoBoundTo([]);
    } catch (err) {
      setBindError(err instanceof Error ? err.message : "Failed to unbind tag");
    } finally {
      setBindBusy(false);
    }
  }

  return (
    <div className="bg-card rounded-card border border-border p-4">
      <div className="flex items-center gap-3">
        <div className="w-8 flex items-center justify-center flex-shrink-0">
          <AppIcon name={definition.icon} size={18} className="text-muted" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm text-text truncate">{definition.name}</p>
          <p className="font-mono text-[10px] text-dim mt-0.5">
            {definition.formFields.length} field{definition.formFields.length === 1 ? "" : "s"}
            {definition.placements.length > 0 && (
              <> · used in {definition.placements.map((p) => p.taskListName).join(", ")}</>
            )}
            {definition.placements.length === 0 && <> · not placed in any list</>}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <p className="font-mono text-[10px] uppercase tracking-widest text-dim mb-1.5 flex items-center gap-1.5">
          <Nfc size={11} strokeWidth={1.75} />
          Scan-to-Complete Tag
        </p>
        {nfcTagUid ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-olive flex-1 truncate">
              Bound · {nfcTagUid}
            </span>
            <button
              type="button"
              onClick={handleUnbindTag}
              disabled={bindBusy}
              className="font-mono text-[11px] text-burgundy-light px-2 py-1 disabled:opacity-40"
            >
              Unbind
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleScanToLink}
            disabled={bindBusy}
            className="font-mono text-[11px] text-olive border border-olive/30 bg-olive/10 px-3 py-1.5 rounded-pill disabled:opacity-40"
          >
            {bindBusy ? "Hold near tag…" : "Scan to Link"}
          </button>
        )}
        {bindError && (
          <p className="font-mono text-[11px] text-burgundy-light mt-1.5">{bindError}</p>
        )}
        {alsoBoundTo.length > 0 && (
          <p className="font-mono text-[11px] text-dim mt-1.5">
            Also bound to: {alsoBoundTo.join(", ")}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {definition.placements.length > 0 ? (
          <Link
            href={`/tasks/${definition.placements[0].taskListId}/edit`}
            className="font-mono text-[10px] text-olive uppercase tracking-widest"
          >
            Edit in {definition.placements[0].taskListName}
          </Link>
        ) : (
          <span />
        )}
        <button
          onClick={() => onDelete(definition._id)}
          disabled={deleting}
          className="font-mono text-[10px] text-burgundy-light uppercase tracking-widest disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>

      {blockedMessage && (
        <p className="mt-2 font-mono text-[10px] text-burgundy-light">{blockedMessage}</p>
      )}
    </div>
  );
}

export default function ManageTasksView({ userName, today, skipAuth, taskLists, standaloneTasks }: Props) {
  const router = useRouter();
  const [definitions, setDefinitions] = useState<Definition[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<{ id: string; message: string } | null>(null);

  const [showAddTaskListSheet, setShowAddTaskListSheet] = useState(false);
  const [addTaskSheetFor, setAddTaskSheetFor] = useState<{ id: string; name: string } | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [removingStandaloneId, setRemovingStandaloneId] = useState<string | null>(null);

  const handleDuplicateTaskList = async (id: string) => {
    setDuplicatingId(id);
    await fetch(`/api/task-lists/${id}/duplicate`, { method: "POST" });
    setDuplicatingId(null);
    router.refresh();
  };

  // Removes a single standalone (anytime-list) task placement — same
  // DELETE /api/tasks/[id] a scheduled list's SortableRow "Remove" button
  // uses (see TaskListEditView.tsx), just reachable from this screen too
  // now instead of only from the task's own anytime list's edit page.
  const handleRemoveStandaloneTask = async (id: string) => {
    setRemovingStandaloneId(id);
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setRemovingStandaloneId(null);
    router.refresh();
  };

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

  // Same "create list, then add its first tasks" chain as TasksView.tsx's
  // own (now-removed) "+ Add Task List" flow — router.refresh() re-fetches
  // this page's server data, which picks up the new list on the next render.
  const handleAddTask = async (
    templateId: string | null,
    name: string,
    icon: string,
    projectedMinutes: number,
    taskType: "standard" | "stopwatch" | "checkbox" | "form" = "form",
    scheduledDays: number[] = [0, 1, 2, 3, 4, 5, 6],
    successThreshold: number = 7,
    formFields: FormFieldDef[] = []
  ) => {
    if (!addTaskSheetFor) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskListId: addTaskSheetFor.id,
        templateId,
        name,
        icon,
        projectedMinutes,
        taskType,
        scheduledDays,
        successThreshold,
        formFields,
      }),
    });
    setAddTaskSheetFor(null);
    router.refresh();
  };

  // Places an existing company saved task (TaskDefinition) into the list
  // just created — mirrors TaskListEditView.tsx's own handleAddExisting.
  const handleAddExisting = async (definitionId: string) => {
    if (!addTaskSheetFor) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskListId: addTaskSheetFor.id, definitionId }),
    });
    setAddTaskSheetFor(null);
    router.refresh();
  };

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-mobile px-4 pb-28">
        <Header userName={userName} today={today} skipAuth={skipAuth} />

        <div className="mt-4 mb-5 flex items-center gap-2">
          <Link href="/tasks" className="flex items-center gap-1 text-muted font-body text-sm min-h-[44px]" aria-label="Back">
            <ChevronLeft size={16} />
          </Link>
          <h1 className="font-heading text-xl text-text">Manage Tasks</h1>
        </div>

        {/* ── Task Lists ─────────────────────────────────────────────────── */}
        <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-3">
          Task Lists
        </p>
        <div className="space-y-2">
          {taskLists.map((tl) => (
            <div key={tl._id} className="flex items-center gap-1 bg-card rounded-card border border-border">
              <Link
                href={`/tasks/${tl._id}/edit`}
                className="flex-1 min-w-0 flex items-center justify-between p-4 hover:bg-card-hover transition-colors rounded-l-card"
              >
                <div className="min-w-0">
                  <p className="font-body text-sm text-text truncate">{tl.name}</p>
                  {tl.startTime && (
                    <p className="font-mono text-[10px] text-dim mt-0.5">Starts {fmtTime(tl.startTime)}</p>
                  )}
                </div>
                <ChevronRight size={16} className="text-dim flex-shrink-0 ml-2" />
              </Link>
              <button
                type="button"
                onClick={() => handleDuplicateTaskList(tl._id)}
                disabled={duplicatingId === tl._id}
                aria-label={`Duplicate ${tl.name}`}
                title="Duplicate task list"
                className="flex-shrink-0 w-11 h-11 mr-1 flex items-center justify-center text-dim hover:text-olive transition-colors disabled:opacity-40"
              >
                <Copy size={15} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowAddTaskListSheet(true)}
          className="mt-2 w-full flex items-center justify-center gap-2 border border-dashed border-border-light text-dim font-body text-sm py-3.5 rounded-card hover:border-olive/40 hover:text-olive transition-colors min-h-[44px]"
        >
          + Add Task List
        </button>

        {/* ── Standalone Tasks — the anytime lists' tasks, flattened. Each
            row still edits/deletes the same Task placement a scheduled
            list's SortableRow does (app/api/tasks/[id]/route.ts has no
            anytime-specific gating) — "Edit" opens the task's own anytime
            list, and "Remove" deletes the placement directly from here so
            an accidental add doesn't require a detour through the Company
            Task Catalog below. NFC binding still happens in that catalog
            regardless of which list a task sits in. ──────────────────── */}
        <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-3 mt-8">
          Standalone Tasks
        </p>
        {standaloneTasks.length === 0 ? (
          <p className="text-dim font-mono text-xs text-center py-6">No standalone tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {standaloneTasks.map((t) => (
              <div key={t._id} className="bg-card rounded-card border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 flex items-center justify-center flex-shrink-0">
                    <AppIcon name={t.icon} size={18} className="text-muted" />
                  </div>
                  <p className="font-body text-sm text-text truncate flex-1">{t.name}</p>
                  <span className="font-mono text-[10px] text-dim flex-shrink-0">{t.projectedMinutes}m</span>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <Link
                    href={`/tasks/${t.taskListId}/edit`}
                    className="font-mono text-[10px] text-olive uppercase tracking-widest"
                  >
                    Edit in {t.taskListName}
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleRemoveStandaloneTask(t._id)}
                    disabled={removingStandaloneId === t._id}
                    className="font-mono text-[10px] text-burgundy-light uppercase tracking-widest disabled:opacity-50"
                  >
                    {removingStandaloneId === t._id ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Company task catalog — every saved task (TaskDefinition) the
            company has, regardless of which lists currently use it. This is
            where a physical NFC tag gets tied to a task, whether that task
            lives in a standalone list or a scheduled one. ────────────────── */}
        <p className="font-mono text-[10px] text-dim uppercase tracking-widest mb-3 mt-8">
          Company Task Catalog
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
            <CatalogRow
              key={d._id}
              definition={d}
              onDelete={handleDelete}
              deleting={deletingId === d._id}
              blockedMessage={blockedMessage?.id === d._id ? blockedMessage.message : null}
            />
          ))}
        </div>
      </div>

      {addTaskSheetFor && (
        <AddTaskSheet
          taskListId={addTaskSheetFor.id}
          taskListName={addTaskSheetFor.name}
          onAdd={handleAddTask}
          onAddExisting={handleAddExisting}
          onClose={() => setAddTaskSheetFor(null)}
        />
      )}

      {showAddTaskListSheet && (
        <AddTaskListSheet
          onCreated={(taskList) => {
            setShowAddTaskListSheet(false);
            setAddTaskSheetFor({ id: taskList._id, name: taskList.name });
          }}
          onClose={() => setShowAddTaskListSheet(false)}
        />
      )}
    </div>
  );
}
