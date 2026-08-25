import AppIntents

// Declaring this is what makes TriggerHabitIntent appear automatically in
// the Shortcuts app gallery, Siri, and Spotlight — no Info.plist config,
// no user-built Shortcut required. See docs/features/app-intents.md.
struct BeOneShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TriggerHabitIntent(),
            phrases: [
                "Trigger a habit in \(.applicationName)",
                "Log a habit in \(.applicationName)",
            ],
            shortTitle: "Trigger Habit",
            systemImageName: "checkmark.circle"
        )
    }
}
