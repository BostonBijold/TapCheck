import AppIntents

// Mirrors one item from GET /api/external/tasks (app/api/external/tasks/route.ts).
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

    // `icon` is one of this app's internal lucide icon-name strings (e.g.
    // "droplets"), not an emoji or glyph AppIntents can render — it used to
    // get prefixed onto the title, which just showed that raw string
    // ("droplets Shower") instead of a picture. Title is the habit name
    // alone; the routine group goes in the subtitle so two same-named
    // habits in different routines (e.g. two "Stretch"es) are still
    // distinguishable, and the picker list is already sorted/grouped by
    // routine order (see GET /api/external/tasks).
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(name)",
            subtitle: groupName.isEmpty ? nil : "\(groupName)"
        )
    }
}
