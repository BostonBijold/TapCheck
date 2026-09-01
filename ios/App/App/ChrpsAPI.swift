import Foundation

// Base URL matches capacitor.config.ts's server.url. There's no way to
// share the JS config into native Swift code, so this is a second place
// (beyond App.entitlements's associated domain and the AASA route) that
// needs updating together if the production domain ever changes — see
// docs/features/nfc.md's "Domain permanence" note and
// docs/features/app-intents.md.
//
// Given dual target membership (App + RoutineActivity) so the Live
// Activity's "Done" button intent (RoutineActivity/CompleteHabitFromActivityIntent.swift)
// can call triggerHabit without duplicating this networking code — see
// docs/features/live-activity.md.
// Deliberately holds only triggerHabit here, not fetchHabits — fetchHabits'
// response decodes into [HabitEntity] (AppIntents/HabitEntity.swift),
// which is App-target-only, so pulling it into this dual-membership file
// would fail to compile in the RoutineActivity target. fetchHabits stays
// as an App-only extension on this enum in HabitEntityQuery.swift instead.
enum ChrpsAPI {
    static let baseURL = URL(string: "https://chrps.vercel.app")!

    struct TriggerResponse: Decodable {
        let ok: Bool
        let completed: TriggerLogSummary?
        let started: TriggerLogSummary?
    }

    struct TriggerLogSummary: Decodable {
        let routineItemId: String
    }

    @discardableResult
    static func triggerHabit(apiKey: String, routineItemId: String, routineGroupId: String?, source: String? = nil) async throws -> TriggerResponse {
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

        var body: [String: String] = [
            "apiKey": apiKey,
            "routineItemId": routineItemId,
            "date": localDate,
        ]
        if let routineGroupId { body["routineGroupId"] = routineGroupId }
        if let source { body["source"] = source }

        var request = URLRequest(url: baseURL.appendingPathComponent("/api/external/trigger-task"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw ChrpsAPIError.requestFailed
        }
        return try JSONDecoder().decode(TriggerResponse.self, from: data)
    }

    // Backs the Live Activity's "Done" button — see
    // CompleteHabitFromActivityIntent.swift and
    // docs/features/live-activity.md. No routineItemId: the server
    // completes whichever log is currently in_progress (server-
    // authoritative, single-active-timer invariant), which sidesteps the
    // widget extension needing to reliably know which habit is current on
    // its own.
    @discardableResult
    static func completeActiveHabit(apiKey: String) async throws -> TriggerResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("/api/external/complete-active-task"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["apiKey": apiKey])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw ChrpsAPIError.requestFailed
        }
        return try JSONDecoder().decode(TriggerResponse.self, from: data)
    }
}

enum ChrpsAPIError: Error, CustomLocalizedStringResourceConvertible {
    case notSignedIn
    case requestFailed

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notSignedIn:
            return "Not signed in to Ch'rps yet — open the app once and visit your Profile page, then try again."
        case .requestFailed:
            return "Couldn't reach Ch'rps. Check your connection and try again."
        }
    }
}
