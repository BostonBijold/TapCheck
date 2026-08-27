import AppIntents
import Foundation

// baseURL, triggerHabit, and BeOneAPIError now live in ../BeOneAPI.swift
// (dual App + RoutineActivity target membership, for the Live Activity's
// "Done" button intent — see docs/features/live-activity.md). fetchHabits
// stays here as an App-only extension since its response decodes into
// [HabitEntity] (HabitEntity.swift), which the RoutineActivity target
// doesn't compile.
extension BeOneAPI {
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
