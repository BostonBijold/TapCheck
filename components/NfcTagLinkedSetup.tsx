"use client";

interface Props {
  taskName: string;
  taskIcon: string;
  onDone?: () => void;
  doneLabel?: string;
}

// Shown right after a tag is linked (both the auto-claim branch in
// app/nfc/[tagCode]/page.tsx and the picker path in NfcClaimTagPicker.tsx).
// Used to also walk through building a per-tag Shortcut for silent
// triggering (see docs/features/nfc.md's history note on why that was
// removed) — now just a plain confirmation. Tapping the tag itself is the
// only setup step left: Universal Links open /nfc/<tagCode> in-app directly,
// no Shortcut/API key/Automation involved.
export default function NfcTagLinkedSetup({ taskName, taskIcon, onDone, doneLabel }: Props) {
  return (
    <div className="text-left">
      <h1 className="font-heading text-2xl text-text mb-2 text-center">Tag linked</h1>
      <p className="text-muted font-body text-sm mb-6 text-center">
        This tag now starts <span className="text-text">{taskIcon} {taskName}</span>. Tap it again anytime to trigger this task.
      </p>

      {onDone ? (
        <button
          type="button"
          onClick={onDone}
          className="block w-full text-center bg-olive text-text font-body font-medium py-3 px-6 rounded-card"
        >
          {doneLabel ?? "Done"}
        </button>
      ) : (
        <a
          href="/tasks"
          className="block text-center bg-olive text-text font-body font-medium py-3 px-6 rounded-card"
        >
          Back to Tasks
        </a>
      )}
    </div>
  );
}
