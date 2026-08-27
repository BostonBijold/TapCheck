import ActivityKit
import Foundation

// Dual target membership (App + RoutineActivity): the App target needs this
// type to call Activity<RoutineActivityAttributes>.request/update/end from
// LiveActivityPlugin.swift; the RoutineActivity extension needs it to render
// the lock screen/Dynamic Island UI and to read state in the "Done" button's
// intent. See docs/features/live-activity.md.
//
// Everything lives in ContentState, not the fixed attributes struct below —
// a single Activity persists for an entire Routine Session and is *updated*
// (not re-created) as the session advances from habit to habit, so habit
// name/icon/timing all need to be able to change across the Activity's
// lifetime.
struct RoutineActivityAttributes: ActivityAttributes {
    // One proportional slice of the routine timeline bar — mirrors
    // lib/routine-timeline.ts's TimelineSegment (pct + colorState only;
    // minutes/id aren't needed for rendering). See docs/features/live-activity.md.
    struct TimelineSegment: Codable, Hashable {
        var pct: Double
        var colorState: String // "done" | "active" | "activeOver" | "pending"
    }

    struct ContentState: Codable, Hashable {
        var routineLabel: String       // group name ("Morning Routine"), or "Timer" for a standalone (non-session) habit
        var habitName: String
        var startedAt: Date            // server-authoritative — matches RoutineLog.startedAt
        var projectedMinutes: Int      // 0 = no target (stopwatch item) — hides the estimated-completion line
        var routineItemId: String
        var routineGroupId: String?    // nil for a standalone timer; set for a Routine Session item

        // Whole-routine timeline — empty/nil for a standalone (non-session)
        // timer, which has no "routine" to show a timeline of. When
        // present, the UI shows this instead of the single-habit finish
        // line, which read ambiguously ("finish the habit" vs "finish the
        // routine") once a routine had more than one item left.
        var timelineSegments: [TimelineSegment]
        var routineStartedAt: Date?
        var routineFinishAt: Date?
    }
}
