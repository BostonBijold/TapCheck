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

    // JS's Date#toISOString() always includes fractional seconds
    // ("...16:19:21.772Z") — the default ISO8601DateFormatter() does NOT
    // parse that format and silently returns nil, which was rejecting
    // every start()/update() call. Confirmed on-device via the print
    // logging below: parseContentState was failing despite every field
    // being present in the plugin call's options.
    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    // TEMPORARY diagnostics — remove once Live Activities are confirmed
    // working end to end on device.
    private func log(_ message: String) {
        print("[LiveActivityPlugin] \(message)")
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
        log("start() called with options: \(call.options ?? [:])")
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            log("start() rejected — areActivitiesEnabled is false")
            call.reject("Live Activities not enabled")
            return
        }
        guard let state = parseContentState(call) else {
            log("start() rejected — parseContentState returned nil")
            call.reject("Missing or invalid content state")
            return
        }

        Task {
            for activity in Activity<RoutineActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            do {
                let activity = try Activity<RoutineActivityAttributes>.request(
                    attributes: RoutineActivityAttributes(),
                    content: .init(state: state, staleDate: nil),
                    pushType: nil
                )
                log("start() succeeded — activity id \(activity.id), activityState \(activity.activityState)")
                call.resolve()
            } catch {
                log("start() threw: \(error)")
                call.reject("Failed to start Live Activity: \(error.localizedDescription)")
            }
        }
    }

    // Mutates the existing activity's content in place (no re-animation of
    // the whole card) — used when a Routine Session advances to its next
    // item. Falls back to starting fresh if none exists (e.g. the app
    // process was relaunched and JS state doesn't know that).
    @objc func update(_ call: CAPPluginCall) {
        log("update() called with options: \(call.options ?? [:])")
        guard let state = parseContentState(call) else {
            log("update() rejected — parseContentState returned nil")
            call.reject("Missing or invalid content state")
            return
        }

        Task {
            if let activity = Activity<RoutineActivityAttributes>.activities.first {
                await activity.update(.init(state: state, staleDate: nil))
                log("update() applied to existing activity id \(activity.id)")
                call.resolve()
            } else {
                log("update() found no existing activity — falling back to start()")
                start(call)
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        log("end() called — \(Activity<RoutineActivityAttributes>.activities.count) active")
        Task {
            for activity in Activity<RoutineActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
