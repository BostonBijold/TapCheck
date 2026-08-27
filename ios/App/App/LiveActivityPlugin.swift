import Capacitor
import ActivityKit
import Foundation

// Bridges RoutinesView.tsx / RoutineSession.tsx to ActivityKit so a running
// timer shows on the Lock Screen / Dynamic Island — see
// docs/features/live-activity.md. start/update/end calls come from this
// device's own foreground JS; separately, the requested Activity carries a
// push token (see observePushToken below) so the server can also push
// updates directly — the mechanism that lets the card react to NFC/
// Shortcuts triggers and the Lock Screen "Done" button while the app isn't
// open, which local-only calls fundamentally can't do.
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

    // Cancelled/replaced whenever a new Activity is requested — only one is
    // ever relevant at a time (single-active-timer invariant), so only one
    // token stream needs observing.
    private var pushTokenTask: Task<Void, Never>?

    // Forwards each new push token to JS as a "pushTokenReceived" event —
    // relayed on to POST /api/live-activity/push-token by
    // lib/native/routine-activity.ts. Activity.pushTokenUpdates is an
    // AsyncSequence that yields a new token whenever iOS (re)issues one and
    // finishes on its own once the activity ends, so this needs no manual
    // cleanup beyond cancelling the previous task when a new activity starts.
    private func observePushToken(for activity: Activity<RoutineActivityAttributes>) {
        NSLog("[LiveActivityPlugin] observePushToken starting for activity \(activity.id)")
        pushTokenTask?.cancel()
        pushTokenTask = Task {
            for await tokenData in activity.pushTokenUpdates {
                let token = tokenData.map { String(format: "%02x", $0) }.joined()
                NSLog("[LiveActivityPlugin] pushTokenUpdates yielded: \(token)")
                // Development-signed builds (this project's only build
                // config today — see docs/features/app-intents.md's
                // deployment target note) must push through APNs' sandbox
                // host; a Distribution-signed build must use production.
                // #if DEBUG is the correct proxy for that distinction here.
                #if DEBUG
                let environment = "sandbox"
                #else
                let environment = "production"
                #endif
                // retainUntilConsumed: the token can arrive before JS has
                // finished registering its listener (registerPushTokenForwarding
                // in NativeBootstrap.tsx runs concurrently with, not strictly
                // after, the mount-time effect that calls start()) — without
                // this, that race silently drops the event with no listener
                // ever receiving it.
                notifyListeners("pushTokenReceived", data: ["token": token, "environment": environment], retainUntilConsumed: true)
                NSLog("[LiveActivityPlugin] notifyListeners(pushTokenReceived) called")
            }
            NSLog("[LiveActivityPlugin] pushTokenUpdates sequence finished")
        }
    }

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

    // timelineSegments/routineStartedAt/routineFinishAt are all optional —
    // absent (or unparseable) simply means no timeline is shown, same as a
    // standalone (non-session) timer with no routine to show one for. See
    // docs/features/live-activity.md.
    private func parseTimelineSegments(_ call: CAPPluginCall) -> [RoutineActivityAttributes.TimelineSegment] {
        guard let raw = call.getArray("timelineSegments") as? [[String: Any]] else { return [] }
        return raw.compactMap { entry in
            guard let pct = entry["pct"] as? Double, let colorState = entry["colorState"] as? String else { return nil }
            return RoutineActivityAttributes.TimelineSegment(pct: pct, colorState: colorState)
        }
    }

    private func parseContentState(_ call: CAPPluginCall) -> RoutineActivityAttributes.ContentState? {
        guard
            let routineItemId = call.getString("routineItemId"),
            let routineLabel = call.getString("routineLabel"),
            let habitName = call.getString("habitName"),
            let startedAtString = call.getString("startedAt"),
            let startedAt = Self.isoFormatter.date(from: startedAtString)
        else { return nil }

        let routineStartedAt = call.getString("routineStartedAt").flatMap { Self.isoFormatter.date(from: $0) }
        let routineFinishAt = call.getString("routineFinishAt").flatMap { Self.isoFormatter.date(from: $0) }

        return RoutineActivityAttributes.ContentState(
            routineLabel: routineLabel,
            habitName: habitName,
            startedAt: startedAt,
            projectedMinutes: call.getInt("projectedMinutes") ?? 0,
            routineItemId: routineItemId,
            routineGroupId: call.getString("routineGroupId"),
            timelineSegments: parseTimelineSegments(call),
            routineStartedAt: routineStartedAt,
            routineFinishAt: routineFinishAt
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
                let activity = try Activity<RoutineActivityAttributes>.request(
                    attributes: RoutineActivityAttributes(),
                    content: .init(state: state, staleDate: nil),
                    pushType: .token
                )
                observePushToken(for: activity)
                call.resolve()

                // A freshly-request()ed Activity's Text(timerInterval:) has
                // been observed (confirmed on-device: phone locked when the
                // routine started) rendering as a static, non-ticking
                // snapshot — frozen at the full countdown value — until the
                // Activity receives an update() call, even with identical
                // content. This immediate follow-up forces that live-
                // ticking attachment right away rather than waiting for
                // whatever the next real content change happens to be.
                try? await Task.sleep(for: .milliseconds(500))
                await activity.update(.init(state: state, staleDate: nil))
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
