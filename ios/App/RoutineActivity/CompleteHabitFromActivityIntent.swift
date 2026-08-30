import AppIntents
import ActivityKit

// The Live Activity's "Done" button. Runs in the RoutineActivity extension's
// process, without launching the app or showing any UI — same
// openAppWhenRun-false spirit as TriggerHabitIntent (see
// docs/features/app-intents.md), just triggered from the Lock Screen/Dynamic
// Island instead of Shortcuts/Siri.
//
// Matches the NFC/Shortcuts "Trigger Habit" tap exactly: completes whatever
// habit is currently active, and if it wasn't the last one in its group,
// auto-starts the next. Calls POST /api/external/complete-active-task
// (lib/task-trigger.ts's completeActiveTask) rather than trigger-task —
// that endpoint needs no routineItemId at all, completing whichever log the
// server finds in_progress. See docs/features/live-activity.md for the full
// history: two earlier versions tried to determine "which habit" from this
// button's own side (bound @Parameters, then a fresh Activity.activities
// lookup) and both proved unreliable on-device. The server always knows
// unambiguously (single-active-timer invariant), so correctness no longer
// depends on either.
//
// Deliberately does NOT touch Activity.activities to update/end the card in
// place. Confirmed via simulator log capture (see live-activity.md):
// ActivityKit's own internal "Fetched descriptors for content states: []"
// log repeats empty for ~2 seconds straight after this intent starts — the
// extension process's ActivityKit client connection doesn't sync with the
// system's activity store fast enough for that to be a viable path, and 2
// seconds is already too long to hold an interactive widget button waiting.
// The card just won't visually update until the app is next opened, at
// which point RoutineSession.tsx's foreground-revalidation effect and
// per-item effect re-sync it for real (correct icon/projectedMinutes
// included) — same mechanism that already made the *data* self-heal
// correctly in every test so far.
struct CompleteHabitFromActivityIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Mark Habit Done"

    func perform() async throws -> some IntentResult {
        guard let apiKey = KeychainHelper.load() else {
            throw ChrpsAPIError.notSignedIn
        }
        try await ChrpsAPI.completeActiveHabit(apiKey: apiKey)
        return .result()
    }
}
