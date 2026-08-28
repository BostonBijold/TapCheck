// Presentational segment bar for the live Routine Session timeline
// (components/RoutineSession.tsx, green/amber pacing) — just renders
// whatever {id, pct, color}[] segments it's handed. See lib/routine-timeline.ts
// for how the segments are built.

export interface TimelineBarSegment {
  id: string;
  pct: number; // 0-100, share of the bar's total width
  color: string;
}

interface Props {
  segments: TimelineBarSegment[];
  startLabel: string;
  endLabel: string;
}

export default function TimelineBar({ segments, startLabel, endLabel }: Props) {
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-border">
        {segments.map((seg, i) => (
          <div
            key={seg.id}
            style={{
              flex: `0 0 ${seg.pct}%`,
              backgroundColor: seg.color,
              borderRight: i < segments.length - 1 ? "2px solid #ffffff" : undefined,
              transition: "flex-basis 0.6s ease, background-color 0.4s ease",
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-[9px] text-dim">{startLabel}</span>
        <span className="font-mono text-[9px] text-dim">{endLabel}</span>
      </div>
    </div>
  );
}
