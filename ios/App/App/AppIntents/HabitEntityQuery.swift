import AppIntents
import Foundation

// Base URL matches capacitor.config.ts's server.url. There's no way to
// share the JS config into native Swift code, so this is a second place
// (beyond App.entitlements's associated domain and the AASA route) that
// needs updating together if the production domain ever changes — see
// docs/features/nfc.md's "Domain permanence" note and
// docs/features/app-intents.md.
enum BeOneAPI {
    static let baseURL = URL(string: "https://be-one-nu.vercel.app")!

    struct HabitsResponse: Decodable {
        let ok: Bool
        let habits: [HabitEntity]
    }

    static func fetchHabits(apiKey: String) async throws -> [HabitEntity] {
        var components = URLComponents(url: baseURL.appendingPathComponent("/api/external/habits"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "apiKey", value: apiKey)]

        let (data, response) = try await URLSession.shared.data(from: components.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw BeOneAPIError.requestFailed
        }
        return try JSONDecoder().decode(HabitsResponse.self, from: data).habits
    }

    struct TriggerResponse: Decodable {
        let ok: Bool
    }

    static func triggerHabit(apiKey: String, routineItemId: String, routineGroupId: String) async throws {
        // The server defaults `date` to its own UTC "today" when omitted —
        // fine most of the day, but wrong every evening for anyone west of
        // UTC (confirmed: a trigger sent at 7pm Mountain time landed on
        // tomorrow's log, invisible on today's view, since the web client
        // separately self-corrects server UTC -> local date on every load
        // but the App Intent path bypassed that entirely). Send the
        // device's own local calendar date instead, matching what
        // RoutinesView.tsx's own timezone-correction redirect computes.
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current
        let localDate = formatter.string(from: Date())

        var request = URLRequest(url: baseURL.appendingPathComponent("/api/external/trigger-habit"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "apiKey": apiKey,
            "routineItemId": routineItemId,
            "routineGroupId": routineGroupId,
            "source": "app_intent",
            "date": localDate,
        ])

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw BeOneAPIError.requestFailed
        }
    }
}

enum BeOneAPIError: Error, CustomLocalizedStringResourceConvertible {
    case notSignedIn
    case requestFailed

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notSignedIn:
            return "Not signed in to Be One yet — open the app once and visit your Profile page, then try again."
        case .requestFailed:
            return "Couldn't reach Be One. Check your connection and try again."
        }
    }
}

// Caches the full habit list briefly so the Shortcuts editor's search field
// doesn't re-hit the network on every keystroke — entities(matching:) below
// filters this in memory instead. A personal habit list changes rarely
// enough that a short staleness window is invisible in practice.
actor HabitCache {
    static let shared = HabitCache()

    private var cached: (fetchedAt: Date, habits: [HabitEntity])?
    private let ttl: TimeInterval = 45

    func habits() async throws -> [HabitEntity] {
        if let cached, Date().timeIntervalSince(cached.fetchedAt) < ttl {
            return cached.habits
        }
        guard let apiKey = KeychainHelper.load() else {
            throw BeOneAPIError.notSignedIn
        }
        let habits = try await BeOneAPI.fetchHabits(apiKey: apiKey)
        cached = (Date(), habits)
        return habits
    }
}

struct HabitEntityQuery: EntityQuery, EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [HabitEntity] {
        let all = try await HabitCache.shared.habits()
        return all.filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [HabitEntity] {
        let all = try await HabitCache.shared.habits()
        guard !string.isEmpty else { return all }
        return all.filter { $0.name.localizedCaseInsensitiveContains(string) }
    }

    func suggestedEntities() async throws -> [HabitEntity] {
        try await HabitCache.shared.habits()
    }
}
