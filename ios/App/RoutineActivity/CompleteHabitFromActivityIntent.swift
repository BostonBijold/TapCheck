import AppIntents
import ActivityKit

// The Live Activity's "Done" button. Runs in the RoutineActivity extension's
// process, without launching the app or showing any UI — same
// openAppWhenRun-false spirit as TriggerHabitIntent (see
// docs/features/app-intents.md), just triggered from the Lock Screen/Dynamic
// Island instead of Shortcuts/Siri.
//
// Deliberately always ENDS the Activity after completing the tapped habit,
// even when routineGroupId is set and the server auto-starts the next item
// in the group (trigger-habit's Case 2 — see docs/api/external-api.md).
// Reflecting that next item live here would need a second native fetch for
// its name/icon/projectedMinutes (GET /api/external/habits doesn't return
// projectedMinutes, so even that wouldn't be enough on its own) — not worth
// the complexity for a Lock Screen button. Instead, the app's own polling
// picks it up: RoutineSession.tsx's foreground-revalidation effect notices
// the external completion within 2s (or immediately on foreground) and
// advances currentIndex, whose effect starts a fresh Live Activity for the
// new current item. Net effect: tapping Done dismisses the Activity; if the
// session isn't actually finished, reopening the app shows it already
// advanced, with a new Live Activity appearing for the next item.
struct CompleteHabitFromActivityIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark Habit Done"

    @Parameter(title: "Habit")
    var routineItemId: String

    @Parameter(title: "Group")
    var routineGroupId: String?

    init() {}

    init(routineItemId: String, routineGroupId: String?) {
        self.routineItemId = routineItemId
        self.routineGroupId = routineGroupId
    }

    func perform() async throws -> some IntentResult {
        // TEMPORARY diagnostic: this process's stdout isn't reachable from a
        // CLI console attach the way the main App target's is, so on any
        // failure, write the error directly into the card's own habitName
        // instead of throwing silently — the Lock Screen becomes the debug
        // output. Remove once the Done button is confirmed working.
        do {
            guard let apiKey = KeychainHelper.load() else {
                throw BeOneAPIError.notSignedIn
            }
            try await BeOneAPI.triggerHabit(
                apiKey: apiKey,
                routineItemId: routineItemId,
                routineGroupId: routineGroupId,
                source: "live_activity"
            )

            // At most one, per the single-active-timer invariant, but loop
            // defensively rather than assuming.
            let activities = Activity<RoutineActivityAttributes>.activities
            if let first = activities.first {
                // TEMPORARY: prove the loop actually reached a real Activity
                // reference (vs. `activities` being empty in this process)
                // before ending it — visible even if the Lock Screen doesn't
                // redraw again after end() while still locked.
                var debugState = first.content.state
                debugState.habitName = "DEBUG: ending \(activities.count) activities"
                await first.update(.init(state: debugState, staleDate: nil))
                try? await Task.sleep(for: .seconds(2))
            }
            for activity in activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        } catch {
            if let activity = Activity<RoutineActivityAttributes>.activities.first {
                var debugState = activity.content.state
                debugState.habitName = "DEBUG: \(error)"
                await activity.update(.init(state: debugState, staleDate: nil))
            }
        }

        return .result()
    }
}
