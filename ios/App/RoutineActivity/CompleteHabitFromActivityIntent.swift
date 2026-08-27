import AppIntents
import ActivityKit
import Foundation

// The Live Activity's "Done" button. Runs in the RoutineActivity extension's
// process, without launching the app or showing any UI — same
// openAppWhenRun-false spirit as TriggerHabitIntent (see
// docs/features/app-intents.md), just triggered from the Lock Screen/Dynamic
// Island instead of Shortcuts/Siri.
//
// Matches the NFC/Shortcuts "Trigger Habit" tap exactly: completes whatever
// habit is currently active, and if it wasn't the last one in its group,
// auto-starts the next. Unlike TriggerHabitIntent, this calls
// POST /api/external/complete-active-habit (lib/habit-trigger.ts's
// completeActiveHabit) rather than trigger-habit — that endpoint needs no
// routineItemId at all, completing whichever log the server finds
// in_progress. See docs/features/live-activity.md for why: two earlier
// versions tried to determine "which habit" from this button's own side
// (bound @Parameters captured at the button's last render, then a fresh
// Activity.activities lookup instead) and both proved unreliable on-device
// — bound parameters go stale across taps with no redraw in between, and
// Activity.activities was observed empty when read from inside this
// intent's perform(). The server always knows unambiguously (single-
// active-timer invariant), so correctness no longer depends on either.
//
// Reflecting the newly-started next habit live in the widget is still
// best-effort: Activity.activities is used here too, only for this cosmetic
// update, and if it's unavailable this just falls through to ending the
// card — the app resyncs the Activity for real (correct icon/projectedMinutes
// included) the next time it's opened, via RoutineSession.tsx's per-item
// effect.
struct CompleteHabitFromActivityIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark Habit Done"

    // A lighter, local decode of GET /api/external/habits than
    // AppIntents/HabitEntity.swift's AppEntity — that type isn't compiled
    // into this target (see docs/features/live-activity.md), and pulling it
    // (plus HabitEntityQuery.swift) in just for this one JSON shape isn't
    // worth it when only name/groupName are actually needed here.
    private struct HabitSummary: Decodable {
        let id: String
        let name: String
        let groupName: String
    }
    private struct HabitsResponse: Decodable {
        let habits: [HabitSummary]
    }

    func perform() async throws -> some IntentResult {
        guard let apiKey = KeychainHelper.load() else {
            throw BeOneAPIError.notSignedIn
        }

        let response = try await BeOneAPI.completeActiveHabit(apiKey: apiKey)

        guard let activity = Activity<RoutineActivityAttributes>.activities.first else {
            return .result()
        }

        if let startedId = response.started?.routineItemId {
            var components = URLComponents(url: BeOneAPI.baseURL.appendingPathComponent("/api/external/habits"), resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "apiKey", value: apiKey)]
            if let url = components.url,
               let (data, _) = try? await URLSession.shared.data(from: url),
               let decoded = try? JSONDecoder().decode(HabitsResponse.self, from: data),
               let next = decoded.habits.first(where: { $0.id == startedId }) {
                var nextState = activity.content.state
                nextState.routineItemId = startedId
                nextState.habitName = next.name
                nextState.routineLabel = next.groupName
                nextState.startedAt = Date()
                nextState.projectedMinutes = 0
                await activity.update(.init(state: nextState, staleDate: nil))
                return .result()
            }
            // Habit lookup failed (network hiccup, etc.) — fall through to
            // ending rather than leaving the card frozen on the just-
            // completed habit; the app will start a fresh Activity for the
            // real next item once reopened.
        }

        await activity.end(nil, dismissalPolicy: .immediate)
        return .result()
    }
}
