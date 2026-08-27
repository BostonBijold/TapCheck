import AppIntents

// Calls the same POST /api/external/trigger-habit every other trigger path
// already uses (app/api/external/trigger-habit/route.ts) — no new
// start/complete/advance logic, just a new caller. See
// docs/features/app-intents.md.
struct TriggerHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Trigger Habit"
    static var description = IntentDescription("Starts, completes, or advances a Be One habit.")

    // Runs without launching the app or showing any UI — parity with the
    // existing silent NFC Automation path (works with the phone locked).
    // The Universal Link path is the one that always foregrounds the app
    // and shows the OS confirmation prompt; this deliberately doesn't.
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Habit")
    var habit: HabitEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Trigger \(\.$habit)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let apiKey = KeychainHelper.load() else {
            throw BeOneAPIError.notSignedIn
        }
        try await BeOneAPI.triggerHabit(apiKey: apiKey, routineItemId: habit.id, routineGroupId: habit.groupId, source: "app_intent")
        return .result(dialog: "Triggered \(habit.name)")
    }
}
