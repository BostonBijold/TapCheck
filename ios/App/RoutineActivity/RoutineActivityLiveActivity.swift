import ActivityKit
import WidgetKit
import SwiftUI
import AppIntents

// A Good Man's dark/olive/gold palette, hardcoded here since a widget
// extension can't reach the app's Tailwind config — see CLAUDE.md's Design
// System section for the source values.
private enum Palette {
    static let bgPrimary = Color(red: 0x18 / 255, green: 0x16 / 255, blue: 0x0f / 255)
    static let textPrimary = Color(red: 0xe8 / 255, green: 0xe0 / 255, blue: 0xcc / 255)
    static let textMuted = Color(red: 0x9a / 255, green: 0x92 / 255, blue: 0x80 / 255)
    static let olive = Color(red: 0x5a / 255, green: 0x6b / 255, blue: 0x35 / 255)
    static let gold = Color(red: 0xc4 / 255, green: 0xa8 / 255, blue: 0x4a / 255)
    static let amber = Color(red: 0xc4 / 255, green: 0x7a / 255, blue: 0x2a / 255)
    static let burgundy = Color(red: 0x7a / 255, green: 0x2e / 255, blue: 0x2e / 255)
}

// A 24h upper bound is just a cap for Text(timerInterval:)'s range — no
// habit timer runs anywhere near that long; it only needs to be safely
// beyond any realistic elapsed time so the text never stops updating.
private func elapsedRange(from startedAt: Date) -> ClosedRange<Date> {
    startedAt...startedAt.addingTimeInterval(24 * 60 * 60)
}

private func targetInstant(_ state: RoutineActivityAttributes.ContentState) -> Date? {
    guard state.projectedMinutes > 0 else { return nil }
    return state.startedAt.addingTimeInterval(TimeInterval(state.projectedMinutes * 60))
}

private func estimatedFinish(_ state: RoutineActivityAttributes.ContentState) -> Date? {
    targetInstant(state)
}

// Same olive→amber→burgundy convention as the in-app countdown ring
// (components/RoutineSession.tsx) — amber past 75% of target, burgundy once
// over. Evaluated at render time, so — like the timer text itself — this
// only updates when the widget actually redraws (a local/push update, or an
// OS-triggered periodic reload), not continuously; see
// docs/features/live-activity.md's platform note on this.
private func timerColor(_ state: RoutineActivityAttributes.ContentState) -> Color {
    guard let target = targetInstant(state) else { return Palette.olive }
    let totalSeconds = TimeInterval(state.projectedMinutes * 60)
    guard totalSeconds > 0 else { return Palette.olive }
    let ratio = Date().timeIntervalSince(state.startedAt) / totalSeconds
    if Date() >= target { return Palette.burgundy }
    if ratio >= 0.75 { return Palette.amber }
    return Palette.olive
}

// Countdown-to-target for items with a projected time (matches the in-app
// ring's "counts down, then holds" — see the AskUserQuestion decision in
// docs/features/live-activity.md: a true countdown-then-count-up flip would
// need a scheduled push at the exact crossing moment, not worth the added
// infrastructure). Falls back to a plain count-up elapsed display for
// stopwatch items (projectedMinutes == 0, no target to count down to).
@ViewBuilder
private func timerText(_ state: RoutineActivityAttributes.ContentState, size: CGFloat) -> some View {
    if let target = targetInstant(state) {
        Text(timerInterval: state.startedAt...target, countsDown: true, showsHours: false)
            .font(.system(size: size, weight: .semibold, design: .monospaced))
            .foregroundStyle(timerColor(state))
            .monospacedDigit()
    } else {
        Text(timerInterval: elapsedRange(from: state.startedAt), countsDown: false, showsHours: false)
            .font(.system(size: size, weight: .semibold, design: .monospaced))
            .foregroundStyle(Palette.textPrimary)
            .monospacedDigit()
    }
}

// Mirrors lib/routine-timeline.ts's TIMELINE_COLOR map exactly (done/active
// both read olive — "in hand" regardless of variance — pending is a dim
// neutral fill, only an over-target active segment shifts to amber).
private func timelineSegmentColor(_ colorState: String) -> Color {
    switch colorState {
    case "done", "active": return Palette.olive
    case "activeOver": return Palette.amber
    default: return Palette.textMuted.opacity(0.35) // "pending"
    }
}

// One segment per remaining/completed item in the routine, proportional to
// its current share of the group's running total — see
// lib/routine-timeline.ts (the same math, computed JS-side and shipped over
// as plain pct/colorState pairs, since neither the app process nor the push
// sender can hand the widget extension a live-recomputing view). Only shown
// when the current habit belongs to a routine (see ContentState's
// timelineSegments/routineStartedAt/routineFinishAt doc comment) — a
// standalone timer falls back to the simpler per-habit finishLine below.
private func timelineBar(_ segments: [RoutineActivityAttributes.TimelineSegment]) -> some View {
    GeometryReader { geo in
        HStack(spacing: 2) {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                RoundedRectangle(cornerRadius: 2)
                    .fill(timelineSegmentColor(segment.colorState))
                    .frame(width: max(3, geo.size.width * CGFloat(segment.pct / 100)))
            }
        }
    }
    .frame(height: 6)
}

@ViewBuilder
private func routineTimelineBlock(_ state: RoutineActivityAttributes.ContentState) -> some View {
    if !state.timelineSegments.isEmpty, let routineStart = state.routineStartedAt, let routineFinish = state.routineFinishAt {
        VStack(alignment: .leading, spacing: 5) {
            timelineBar(state.timelineSegments)
            HStack {
                Text(routineStart, style: .time)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Palette.textMuted)
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "flag.checkered")
                        .font(.system(size: 10, weight: .semibold))
                    Text(routineFinish, style: .time)
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(Palette.textPrimary)
            }
        }
    } else {
        finishLine(state)
    }
}

@ViewBuilder
private func finishLine(_ state: RoutineActivityAttributes.ContentState) -> some View {
    if let finish = estimatedFinish(state) {
        HStack(spacing: 6) {
            Image(systemName: "flag.checkered")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Palette.gold)
            Text("Finish by \(finish, style: .time)")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.textPrimary)
        }
    }
}

// Deliberately takes no per-item identity from `state` — see
// CompleteHabitFromActivityIntent, which looks up the current habit fresh
// from Activity.activities at tap-time instead of trusting whatever was
// baked into this view the last time it actually redrew.
private func doneButton() -> some View {
    Button(intent: CompleteHabitFromActivityIntent()) {
        Text("Done")
            .font(.system(size: 13, weight: .semibold))
            .frame(maxWidth: .infinity)
    }
    .tint(Palette.olive)
    .buttonStyle(.borderedProminent)
}

struct RoutineActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RoutineActivityAttributes.self) { context in
            // ── Lock Screen / banner ──
            let state = context.state
            VStack(alignment: .leading, spacing: 10) {
                Text(state.routineLabel.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(Palette.gold)

                HStack(alignment: .firstTextBaseline) {
                    Text(state.habitName)
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Palette.textPrimary)
                        .lineLimit(1)
                    Spacer()
                    timerText(state, size: 19)
                        .frame(minWidth: 64, alignment: .trailing)
                }

                routineTimelineBlock(state)

                doneButton()
            }
            .padding(16)
            .activityBackgroundTint(Palette.bgPrimary)
            .activitySystemActionForegroundColor(Palette.textPrimary)

        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(state.routineLabel.uppercased())
                            .font(.system(size: 9, weight: .semibold))
                            .tracking(1)
                            .foregroundStyle(Palette.gold)
                        Text(state.habitName)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Palette.textPrimary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    timerText(state, size: 17)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        routineTimelineBlock(state)
                        doneButton()
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(Palette.gold)
            } compactTrailing: {
                timerText(state, size: 13)
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(Palette.gold)
            }
            .keylineTint(Palette.olive)
        }
    }
}
