import AppIcon from "@/components/AppIcon";

// Static confirmation shown when a tap just completed the tapped task
// itself — app/nfc/[tagCode]/page.tsx's tappedJustCompleted branch. Reuses
// TaskCard's "done" badge visual language (olive left border, olive pill
// badge) rather than inventing new styling, just full-screen instead of a
// card in a list.
export default function NfcDoneScreen({
  name,
  icon,
  inTaskList,
}: {
  name: string;
  icon: string;
  inTaskList: boolean;
}) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-full bg-olive/10 border border-olive/30 flex items-center justify-center mx-auto mb-6">
        <AppIcon name={icon} size={32} className="text-olive" />
      </div>
      <h1 className="font-heading text-2xl text-text mb-2">{name}</h1>
      <span className="inline-block font-mono text-xs text-olive bg-olive/10 px-3 py-1 rounded-pill mb-6">
        ✓ Done
      </span>
      <p className="text-muted font-body text-sm mb-8">
        {inTaskList
          ? "Logged. The rest of the task list is still going."
          : "Logged."}
      </p>
      <a
        href="/tasks"
        className="block text-center bg-olive text-text font-body font-medium py-3 px-6 rounded-card"
      >
        Back to Tasks
      </a>
    </div>
  );
}
