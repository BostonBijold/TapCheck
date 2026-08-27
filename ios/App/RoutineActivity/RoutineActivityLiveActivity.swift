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
}

// A 24h upper bound is just a cap for Text(timerInterval:)'s range — no
// habit timer runs anywhere near that long; it only needs to be safely
// beyond any realistic elapsed time so the text never stops updating.
private func elapsedRange(from startedAt: Date) -> ClosedRange<Date> {
    startedAt...startedAt.addingTimeInterval(24 * 60 * 60)
}

private func estimatedFinish(_ state: RoutineActivityAttributes.ContentState) -> Date? {
    guard state.projectedMinutes > 0 else { return nil }
    return state.startedAt.addingTimeInterval(TimeInterval(state.projectedMinutes * 60))
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
                HStack {
                    Text(state.routineLabel.uppercased())
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(Palette.gold)
                    Spacer()
                    if let finish = estimatedFinish(state) {
                        Text("Est. \(finish, style: .time)")
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundStyle(Palette.textMuted)
                    }
                }

                HStack(alignment: .firstTextBaseline) {
                    Text(state.habitName)
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(Palette.textPrimary)
                        .lineLimit(1)
                    Spacer()
                    Text(timerInterval: elapsedRange(from: state.startedAt), countsDown: false, showsHours: false)
                        .font(.system(size: 19, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Palette.textPrimary)
                        .monospacedDigit()
                        .frame(minWidth: 64, alignment: .trailing)
                }

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
                    Text(timerInterval: elapsedRange(from: state.startedAt), countsDown: false, showsHours: false)
                        .font(.system(size: 17, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Palette.textPrimary)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        if let finish = estimatedFinish(state) {
                            Text("Estimated finish: \(finish, style: .time)")
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.textMuted)
                        }
                        doneButton()
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(Palette.gold)
            } compactTrailing: {
                Text(timerInterval: elapsedRange(from: state.startedAt), countsDown: false, showsHours: false)
                    .font(.system(size: 13, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(Palette.textPrimary)
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(Palette.gold)
            }
            .keylineTint(Palette.olive)
        }
    }
}
