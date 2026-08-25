import AppIntents

// Mirrors one item from GET /api/external/habits (app/api/external/habits/route.ts).
// See docs/features/app-intents.md.
struct HabitEntity: AppEntity, Decodable {
    let id: String
    let name: String
    let icon: String
    let itemType: String
    let groupId: String
    let groupName: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Habit"
    static var defaultQuery = HabitEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(icon) \(name)",
            subtitle: groupName.isEmpty ? nil : "\(groupName)"
        )
    }
}
