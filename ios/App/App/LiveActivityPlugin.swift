import Capacitor
import ActivityKit
import Foundation

// Bridges RoutinesView.tsx / RoutineSession.tsx to ActivityKit so a running
// timer shows on the Lock Screen / Dynamic Island — see
// docs/features/live-activity.md. Local-only (no push token registration);
// every start/update call comes from this device's own foreground JS.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    private static let isoFormatter = ISO8601DateFormatter()

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    private func parseContentState(_ call: CAPPluginCall) -> RoutineActivityAttributes.ContentState? {
        guard
            let routineItemId = call.getString("routineItemId"),
            let routineLabel = call.getString("routineLabel"),
            let habitName = call.getString("habitName"),
            let startedAtString = call.getString("startedAt"),
            let startedAt = Self.isoFormatter.date(from: startedAtString)
        else { return nil }

        return RoutineActivityAttributes.ContentState(
            routineLabel: routineLabel,
            habitName: habitName,
            startedAt: startedAt,
            projectedMinutes: call.getInt("projectedMinutes") ?? 0,
            routineItemId: routineItemId,
            routineGroupId: call.getString("routineGroupId")
        )
    }

    // Ends any existing activity first — this app only ever shows one
    // running timer at a time (the single-active-timer invariant enforced
    // server-side in lib/routine-log-actions.ts), so a fresh `start` call
    // always means "the old one, if any, is no longer current."
    @objc func start(_ call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities not enabled")
            return
        }
        guard let state = parseContentState(call) else {
            call.reject("Missing or invalid content state")
            return
        }

        Task {
            for activity in Activity<RoutineActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            do {
                _ = try Activity<RoutineActivityAttributes>.request(
                    attributes: RoutineActivityAttributes(),
                    content: .init(state: state, staleDate: nil),
                    pushType: nil
                )
                call.resolve()
            } catch {
                call.reject("Failed to start Live Activity: \(error.localizedDescription)")
            }
        }
    }

    // Mutates the existing activity's content in place (no re-animation of
    // the whole card) — used when a Routine Session advances to its next
    // item. Falls back to starting fresh if none exists (e.g. the app
    // process was relaunched and JS state doesn't know that).
    @objc func update(_ call: CAPPluginCall) {
        guard let state = parseContentState(call) else {
            call.reject("Missing or invalid content state")
            return
        }

        Task {
            if let activity = Activity<RoutineActivityAttributes>.activities.first {
                await activity.update(.init(state: state, staleDate: nil))
                call.resolve()
            } else {
                start(call)
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        Task {
            for activity in Activity<RoutineActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
