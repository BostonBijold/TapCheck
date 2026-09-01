> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Live Activity — Lock Screen / Dynamic Island Timer

While a routine timer is running, a branded card shows on the Lock Screen and Dynamic Island: the routine label, current habit, a live elapsed timer, an estimated-completion clock time, and a "Done" button that completes the habit without opening the app. This is the second piece of custom native code this project needed beyond Capacitor's stock plugins (the first was [`app-intents.md`](app-intents.md)'s Shortcuts/Siri integration) — Live Activities have no JS/Capacitor-JS equivalent, only reachable from ActivityKit/WidgetKit in a real Widget Extension target.

## Why a second Xcode target was required

App Intents (the first piece of native code here) compiled directly into the `App` target — no extension needed, since Shortcuts/Siri/Spotlight integration doesn't render any UI of its own. A Live Activity's Lock Screen/Dynamic Island UI, by contrast, is rendered by the OS from a **Widget Extension** process, not the app's own process — ActivityKit requires that UI to live in a `.appex` target. `RoutineActivityExtension` (product name `RoutineActivity`, bundle id `com.bostonbijold.chrps.RoutineActivity`) was added via Xcode's own "Widget Extension" wizard (File → New → Target → Widget Extension, "Include Live Activity" checked) rather than hand-crafted in `project.pbxproj` — safer than scripting a whole new target from scratch, since Apple's template is what correctly wires the `NSExtension` Info.plist keys and the "Embed Foundation Extensions" build phase. Deployment target was lowered from Xcode's default (26.5) to 17.0 to match `App` (interactive Live Activity buttons need iOS 17+ anyway).

**The `RoutineActivity` folder is a filesystem-synchronized group** (`PBXFileSystemSynchronizedRootGroup`, Xcode 16+'s newer target-creation default) — any file physically present in `ios/App/RoutineActivity/` is automatically part of the `RoutineActivityExtension` target's Sources, with no `PBXBuildFile`/`PBXFileReference` bookkeeping needed. This is why `RoutineActivityAttributes.swift` and `CompleteHabitFromActivityIntent.swift` (below) needed no explicit project-file surgery to join that target — only files that needed to cross *into* the traditionally-managed `App` group (or vice versa) needed the `xcodeproj` Ruby gem.

## Swift file layout

```
ios/App/App/
  ChrpsAPI.swift                      — baseURL, triggerHabit, completeActiveHabit, ChrpsAPIError.
                                         Dual target membership (App + RoutineActivityExtension) —
                                         triggerHabit/ChrpsAPIError moved out of
                                         AppIntents/HabitEntityQuery.swift (where they used to live
                                         inline) specifically so the Live Activity's "Done" button
                                         could reuse this networking code; completeActiveHabit was
                                         added directly here for the same reason. fetchHabits/
                                         HabitsResponse stayed behind as an App-only extension on
                                         this same enum
                                         (HabitEntityQuery.swift) — its response decodes into
                                         [HabitEntity], which is App-target-only, so pulling it
                                         into this dual-membership file would fail to compile in
                                         the extension target.
  KeychainHelper.swift                — now dual target membership too (was App-only). Also
                                         changed to use an explicit kSecAttrAccessGroup instead
                                         of each target's implicit default group — see "Keychain
                                         Sharing" below.
  LiveActivityPlugin.swift            — App-only. CAPPlugin/CAPBridgedPlugin wrapping
                                         Activity<RoutineActivityAttributes>.request/update/end,
                                         registered in MainViewController.capacitorDidLoad()
                                         alongside ApiKeyBridgePlugin.

ios/App/RoutineActivity/              — filesystem-synchronized; see above
  RoutineActivityAttributes.swift     — the ActivityAttributes/ContentState shape. ALSO given
                                         explicit App target membership (via the xcodeproj gem —
                                         see below) since LiveActivityPlugin.swift needs it too,
                                         despite physically living in this folder.
  RoutineActivityLiveActivity.swift   — the actual Widget: Lock Screen view + Dynamic Island
                                         compact/expanded/minimal views. Hardcodes the app's
                                         dark/olive/gold palette (Palette enum) since a widget
                                         extension can't reach Tailwind config.
  RoutineActivityBundle.swift         — @main WidgetBundle; trimmed to just the one widget (the
                                         wizard's template also generates a plain home-screen
                                         widget and a Control Widget, both deleted — this project
                                         only wants the Live Activity).
  CompleteHabitFromActivityIntent.swift — the "Done" button's AppIntent (LiveActivityIntent).
  RoutineActivity.entitlements        — Keychain Sharing, matching App/App.entitlements.
```

## Keychain Sharing

The "Done" button's intent runs in the `RoutineActivityExtension` process, not the WebView or even the main `App` process — same "can't reach `localStorage`/React state" problem [`app-intents.md`](app-intents.md#the-keychain-bridge) already solved for App Intents, except now *two different bundle IDs* need to read the same Keychain item (`com.bostonbijold.chrps` and `com.bostonbijold.chrps.RoutineActivity`), and each gets a different *implicit* default access group. Fix: both targets now declare the same explicit **Keychain Sharing** group —

```xml
<key>keychain-access-groups</key>
<array><string>$(AppIdentifierPrefix)com.bostonbijold.chrps.shared</string></array>
```

— in `App/App.entitlements` and the new `RoutineActivity/RoutineActivity.entitlements` (wired to the extension target via `CODE_SIGN_ENTITLEMENTS`), and `KeychainHelper.swift`'s `save`/`load` now pass `kSecAttrAccessGroup` explicitly rather than relying on the per-target default. The value is hardcoded as `"X3DPK5Y29G.com.bostonbijold.chrps.shared"` (team ID + group name) rather than resolved from `$(AppIdentifierPrefix)` at runtime — Swift code needs the literal resolved string, not the build-setting macro; same manual-sync tradeoff as `ChrpsAPI.baseURL`, equally unlikely to change for a single-developer personal app.

**Migration note**: since the access group changed, an API key saved under the *old* implicit group before this change won't be found by the new explicit-group `load()` on first launch after updating — self-heals automatically, since `NativeBootstrap.tsx` re-pushes the key via `save()` (now targeting the new group) on every native cold start, same as the existing "Profile never opened yet" gap already documented in app-intents.md.

## `RoutineActivityAttributes` — everything lives in `ContentState`

```swift
struct RoutineActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var routineLabel: String    // group name, or "Timer" for a standalone habit
        var habitName: String
        var startedAt: Date         // a *virtual* start time — see below, not always the raw server startedAt
        var projectedMinutes: Int   // 0 = no target (stopwatch) — hides the estimated-finish line
        var routineItemId: String
        var routineGroupId: String? // nil for standalone; set for a Task List Session item
    }
}
```

No fixed (non-`ContentState`) attributes — a single Activity persists for an entire Task List Session and is **updated in place**, not re-created, as the session advances from task to task (avoids the Lock Screen card re-animating/re-appearing on every task switch), so everything needs to be able to change across the Activity's lifetime.

### `startedAt` is a virtual anchor, not always the raw `TaskLog.startedAt`

The Lock Screen elapsed timer is a native `Text(timerInterval:)` — a free-running, self-updating countup that needs no repeated JS pushes, matching this codebase's existing "derive elapsed from wall-clock time, not ticks" philosophy ([`timer.md`](timer.md#how-elapsed-time-is-computed)). But `Text(timerInterval:)` only knows a single start instant — it has no concept of `pausedSeconds` banked from an earlier running segment (an item resumed after being jumped away from mid-session, see [`timer.md`](timer.md#single-active-timer-pause-instead-of-complete-or-run-concurrently)). Every call site computes the already-existing "seeded elapsed" value (`pausedSeconds + (now - startedAt)`, the same expression used throughout `TasksView.tsx`/`TaskListSessionView.tsx` for the in-app ring) and derives `startedAt: new Date(Date.now() - seeded * 1000).toISOString()` from it — a start instant that, if fed straight into a naive "now minus this" count, already reproduces the correct accumulated elapsed time and continues counting up accurately from there. The native side never needs to know `pausedSeconds` exists.

### Estimated completion

A static (non-live) `Text(date, style: .time)` computed once as `startedAt + projectedMinutes` — not a second live-updating element. `projectedMinutes: 0` (stopwatch items) hides this line entirely.

## `lib/native/routine-activity.ts` — call sites

Thin wrappers (`startRoutineActivity`, `updateRoutineActivity`, `endRoutineActivity`) around `lib/native/live-activity-bridge.ts`'s `registerPlugin` call, each `Capacitor.isNativePlatform()`-gated and swallowing rejections — mirrors `lib/native/api-key-bridge.ts`'s pattern exactly, so every call site below is a single unguarded call with no try/catch of its own.

- **`start`** always ends any existing Activity first, then `request()`s a fresh one — safe given the single-active-timer invariant (at most one relevant Activity ever exists), and used for the standalone `TimerScreen` path (`TasksView.tsx`'s `handleStartTimer` resume/fresh-start branches, and `openInProgressTimer`'s cold-start resume).
- **`update`** mutates the existing Activity's `ContentState` in place if one exists, otherwise falls back to `start()` — used by `TaskListSessionView.tsx`'s per-item effect (the same effect keyed on `currentIndex` that already POSTs `in_progress`/seeds `elapsed` on every item switch — see [`timer.md`](timer.md#the-sequential-session-tasklistsessionviewtsx)). This fallback is what lets the *first* item of a session and every *subsequent* switch use the exact same call, with no separate "is this the first item" branch needed.
- **`end`** — called from `TasksView.tsx`'s `handleTimerComplete`/`handleTimerMissed` (standalone timer), and from two places in `TaskListSessionView.tsx`: the `advance()` summary branch and the foreground-revalidation effect's summary branch — both genuine "every item in the group is finished" moments.

**Deliberately *not* called from `TimerScreen`'s plain `onClose`, nor from `TaskListSessionView`'s `handleClose`** (the X button) — both leave the current item's log `in_progress` on the server rather than completing it, and the whole point of a Live Activity is staying visible on the Lock Screen after the app itself is closed. `handleClose` used to flush the current item to `done` before calling the parent's close handler (see [`timer.md`](timer.md#the-sequential-session-tasklistsessionviewtsx)); that was changed specifically because it made X indistinguishable from actually finishing the item, and a still-running Live Activity now gives a real reason to just dismiss the session view without finishing anything — the user resumes via the FAB's active-timer indicator instead.

**Checkbox and form tasks** (see [`timer.md`](timer.md)) have no ring timer of their own; `TaskListSessionView.tsx`'s per-item effect calls `end` rather than `update` when landing on either (`isCheckboxTask || isFormTask`), so the Lock Screen doesn't show a frozen, meaningless timer while the user is filling in a check's fields. Landing on the *next* timed item afterward goes through `update()`'s start-fallback, same as a session's very first item.

## The "Done" button — matches the NFC/Shortcuts tap exactly server-side; the card itself doesn't update live

`CompleteHabitFromActivityIntent` (`LiveActivityIntent`, runs in the `RoutineActivityExtension` process without opening the app or showing any UI — same `openAppWhenRun`-false spirit as `TriggerHabitIntent`) is meant to feel identical to tapping an NFC tag or running the "Trigger Habit" Shortcut: complete the current habit, start the next one in the group if there is one, or finish the routine if it was the last. Getting the *data* side of that right took three iterations, kept here because the failure modes are non-obvious and specific to running inside a Live Activity's extension process rather than an ordinary Shortcuts-invoked intent:

1. **`ChrpsAPI.triggerHabit(routineItemId:, routineGroupId:)` with those two values passed as the button's bound `@Parameter`s**, captured at `Button(intent:)` construction time from `context.state`. Confirmed on-device: tapping Done a *second* time while the screen had stayed asleep since the first tap re-fired against the *first* habit's id — the value baked into the button at the last time SwiftUI actually rendered it, not the current one, even though the Activity's real content state had already moved on.
2. **Same endpoint, but `perform()` read `routineItemId`/`routineGroupId` fresh from `Activity<RoutineActivityAttributes>.activities.first?.content.state`** instead of trusting the bound parameters — reasoning that it's a live, system-synced data source independent of view rendering. Confirmed on-device: this made the Done button do **nothing at all** — no completion, no advance — because `Activity.activities` was empty when queried from inside this intent's `perform()`, so the guard at the top of the function returned immediately.
3. **`POST /api/external/complete-active-task`** ([`api/external-api.md`](../api/external-api.md#post-apiexternalcomplete-active-task)) — takes no `routineItemId` at all, resolving "which task" server-side from the single in_progress `TaskLog` (server-authoritative, via the single-active-timer invariant). This is the one that actually works, and is what `perform()` calls today: correctness no longer depends on any value the widget extension itself has to track or look up, only on the API key in Keychain.

A fourth iteration tried using `Activity.activities` for a *cosmetic-only* update — swap the card to show the newly-started next habit in place, falling back to `.end()` if that data wasn't available — reasoning that even if unreliable for identifying "which habit" (iteration 2's problem), it might still be good enough for a best-effort display refresh. **Confirmed via a Simulator log capture that this isn't viable either**, and dropped: `xcrun simctl spawn <udid> log stream` filtered to the `RoutineActivityExtension` process shows ActivityKit's own internal `[com.apple.activitykit:outputClient] Fetched descriptors for content states: []` logged nine times, ~200ms apart, staying empty for the full ~2 seconds `perform()` polled — the extension process's `ActivityClient` connection doesn't finish syncing with the system's activity store fast enough for this to be a viable path, and 2 seconds is already too long to make an interactive widget button wait. `perform()` today does nothing beyond the `completeActiveHabit` call — no `Activity.activities` lookup, no `GET /api/external/tasks` follow-up, no polling.

**Net effect, and not a bug**: tapping Done reliably completes the current habit and advances to the next one (or finishes the routine) *server-side*, confirmed by reopening the app afterward — but the Lock Screen card itself keeps showing the habit that was just completed until the app is next opened. At that point `TaskListSessionView.tsx`'s foreground-revalidation effect ([`timer.md`](timer.md)) notices the item is already current, advances `currentIndex`, and its per-item effect starts a fresh, fully-correct Live Activity (real icon/`projectedMinutes` included) for whatever's actually current. This is the same self-healing mechanism that was always the fallback for the "last item in the group" case; it's now doing double duty as the *primary* way the card ever visually catches up, not just an edge-case backstop.

`source: "live_activity"` on the old `trigger-task` codepath was a distinct value from Shortcuts' `"app_intent"`, used only for `AppIntentLink` bookkeeping ([`app-intents.md`](app-intents.md#connection-status-in-manage-habit)) — `complete-active-task` doesn't take a `source` param at all, so Live-Activity-only usage no longer lights up the "Connected" badge in Manage Habit either way.

## No tap-through deep link

`widgetURL`/`Link` on the card body (tapping anywhere that isn't the Done button) was deliberately left unset. Universal Links / the Associated Domains entitlement (`applinks:chrps.vercel.app`) do exist and work in this project — they back the NFC tap-to-trigger flow (see [`nfc.md`](nfc.md#native-setup)) — but they're wired specifically to `/nfc/<tagCode>`, not to any generic "open the app" URL a Live Activity card could point at. Setting `widgetURL` here would need its own route and deep-link target to be worth building, and no one has asked for tap-through from the Lock Screen card yet. The Done button remains the one interactive element.

## Palette and typography

`RoutineActivityLiveActivity.swift`'s `Palette` enum hardcodes the white/blue hex values from CLAUDE.md's Design System section (`bg`, `text`, `muted`, `olive`, `gold`, `done`) — a widget extension has no access to the app's Tailwind config. Token *names* (`olive`, `gold`) are kept from the pre-rebrand dark theme for continuity with the rest of this file, same convention as the web app's own tokens — only their hex values changed, now both resolving to the same blue accent. `Palette.done` is the one addition: the completed-timeline-segment color reads the dedicated Ch'rps Green token instead of the blue accent, matching the web app's own separation of "done" indicators from ordinary blue actions/buttons. Typography uses the system font (SF Pro), not Playfair Display/IBM Plex Mono — bundling and registering a custom font for a widget extension target was judged not worth it for a Lock Screen glance; only the color palette carries the brand.

## Push-driven updates

Everything above (local `start`/`update`/`end` from `LiveActivityPlugin.swift`, and the Done button's failed attempts at touching `Activity.activities`) shares one limitation: it only works while some process on-device — the app or the widget extension — is alive and synced. An **NFC tap, a Shortcut, or the Lock Screen Done button, with the app not open**, changes the active habit on the server with nothing able to tell the Lock Screen card about it. Apple's actual answer to this is **ActivityKit push updates** — the server sends an Apple Push Notification carrying the new content state, and iOS renders it directly, with no app or extension process needing to be running or synced at all.

### Token flow

1. `LiveActivityPlugin.start()` requests the Activity with `pushType: .token` (was `nil`) — this makes iOS issue a **push-to-update token** specific to that Activity (distinct from a device's general remote-notification token; no Notifications permission prompt involved).
2. `observePushToken(for:)` consumes `Activity<RoutineActivityAttributes>.pushTokenUpdates` (an `AsyncSequence` that yields a new token whenever iOS (re)issues one, and finishes on its own once the Activity ends) and forwards each one to JS via `notifyListeners("pushTokenReceived", ...)`, hex-encoded, tagged with `"sandbox"` or `"production"` via a `#if DEBUG` check (this project's only build config today is Debug/Development-signed, which must push through APNs' sandbox host — see the entitlement note below).
3. `lib/native/routine-activity.ts`'s `registerPushTokenForwarding()` — called once from `components/NativeBootstrap.tsx`, same pattern as the API key bridge — listens for that event and `POST`s it to `/api/live-activity/push-token`.
4. That route (session-authenticated, not the API key — this call originates from the app's own logged-in context) upserts `User.liveActivityPushToken`/`liveActivityPushEnvironment`, always overwriting rather than versioning: only the latest token is ever usable, and there's at most one relevant Live Activity per user (single-active-timer invariant).

### Sending a push

`lib/apns.ts`'s `sendLiveActivityPush()` — signs a fresh ES256 provider JWT per call (via `jose`, already present transitively through `@auth/core` and pinned as a direct dependency) using `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_PRIVATE_KEY`, then POSTs to `https://api.push.apple.com` or `.sandbox.` over HTTP/2 (Node's built-in `http2` client — APNs requires HTTP/2, HTTP/1.1 isn't supported) with `apns-topic: com.bostonbijold.chrps.push-type.liveactivity` and `apns-push-type: liveactivity`. One connection per call — correct at this app's volume (a personal, single-user app sending at most a handful of pushes a day), not tuned for the connection-reuse a high-throughput provider would want.

`lib/task-trigger.ts`'s `notifyLiveActivity()` builds the actual payload and is called from both `triggerTask()` (NFC/Shortcuts) and `completeActiveTask()` (the Lock Screen Done button) after they resolve — **not** from the in-app `/api/task-logs` routes, since those are already covered by the app's own local `update()`/`end()` calls firing from foreground JS. It looks up the target task (whichever just started, or whichever just completed if nothing new started) via `Task`/`TaskList` directly — full DB access, unlike the native side's old `GET /api/external/tasks` workaround, so the pushed content state is always fully correct (`projectedMinutes` included, no `0`-placeholder needed) on the first try. Sends an `"update"` event if something's now active, an `"end"` event (with a `dismissal-date` of now) if nothing is. Wrapped in a try/catch that never throws — a push failure shouldn't fail the task-completion request that triggered it, same as the `AppIntentLink` bookkeeping elsewhere on this surface.

**`content-state`'s `startedAt` is a JSON number, not an ISO string — and specifically seconds since the Cocoa reference date (2001-01-01T00:00:00Z), not Unix epoch seconds.** Swift's default `Codable` synthesis for `Date` (`.deferredToDate`, which `RoutineActivityAttributes.ContentState` doesn't override, and which is what APNs-delivered content actually gets decoded through on-device) encodes/decodes `Date` as `timeIntervalSinceReferenceDate`, not `timeIntervalSince1970` — a 31-year, `978307200`-second difference that's a genuinely common Foundation gotcha, not specific to this feature. Confirmed on-device: sending raw Unix seconds decoded to a `startedAt` ~31 years in the future, so the Lock Screen's `Text(timerInterval:)` — whose displayed range never included "now" — just showed a frozen value instead of counting up, even though the habit name/label updated correctly (those are plain strings, unaffected). `lib/apns.ts`'s `toAppleReferenceSeconds()` does the conversion; `lib/task-trigger.ts`'s `notifyLiveActivity()` is the only caller.

This is the one place in this feature where the wire format for the *same* struct differs depending on the transport: the local plugin's `parseContentState` reads an ISO string (matching JS's `Date#toISOString()`) because that request is JSON-encoded by hand in `LiveActivityPlugin.swift`'s own Capacitor call layer, not by `Codable` — so the reference-date gotcha above is specific to the push path and doesn't affect local `start`/`update`/`end` calls at all.

### Push Notifications entitlement

`App.entitlements` needs `aps-environment` for the Activity to receive a push token at all — added as `development` (matching this project's only build config, Debug/Development-signed; would need to become `production` alongside an eventual Distribution-signed Release build). Same underlying entitlement ordinary remote notifications would need if this app ever adds those — `lib/apns.ts`'s JWT-signing and HTTP/2 send logic is written to be reusable for that (only the payload shape and `apns-push-type` header are Live-Activity-specific), even though nothing else calls it yet.

### What still doesn't get pushed live

The Done button's `perform()` still doesn't touch `Activity.activities` for a same-tap cosmetic update — the push it triggers arrives asynchronously (typically under a second, but not synchronous with the button tap completing), so tapping Done still won't flip the card *instantly* the way the local-update path does when the app is open. It'll update shortly after, without needing the app opened at all, which is the actual gap this was built to close.

## Countdown timer, and colors

`RoutineActivityLiveActivity.swift`'s `timerText(_:size:)` shows a real countdown (`Text(timerInterval:countsDown: true)`) toward the target for items with `projectedMinutes > 0`, falling back to the plain count-up elapsed display (as before) for stopwatch items with no target. `timerColor(_:)` is a deliberately simpler two-color scheme than the in-app ring's olive → amber → burgundy: olive until 75% of target, amber from there on — including once over target, where the in-app ring would step to burgundy but this doesn't. Confirmed with the user that's the wanted behavior here specifically, not an oversight.

**Does flip to a live "+HH:MM:SS" count-up once over target, matching the in-app ring** — an earlier version of this doc said this wasn't achievable without a scheduled push exactly at the crossing moment, reasoning that `Text(timerInterval:)` has no built-in "count down, then count up past zero" mode. That's still true of a *single* `Text(timerInterval:)`, but it turned out not to matter: `timerText(_:size:)` branches at render time — `if Date() >= target`, it renders `overtimeText(from:)` (a fresh count-up `Text(timerInterval:)` anchored to `target`, prefixed with `"+"` via SwiftUI's `Text` concatenation) instead of the countdown. The flip happens at the next real redraw (a local/push update, or an OS-triggered periodic reload), not necessarily the exact crossing instant — the same "eventually consistent" characteristic every other live-computed value in this file already has, not a new limitation.

**No way to hide the seconds field** — confirmed while designing this: `Text(timerInterval:)` has no API for suppressing seconds, only `showsHours` (HH:MM:SS vs MM:SS). A "+3:47" ticking every second was accepted as reading fine, framed as an explicit overage badge rather than a wall-clock label that would look broken ticking seconds.

**A freshly-started Activity's countdown can render as a frozen, non-ticking snapshot** — confirmed on-device: starting a routine while the phone was already locked showed the full target duration (e.g. `10:00`) the entire time, only beginning to actually tick once the app was reopened and its own foreground re-sync issued a fresh `update()` call. `LiveActivityPlugin.start()` now works around this by following its own `request()` with an `update()` call carrying identical content ~500ms later — the extra call is what attaches live-ticking behavior; a `request()` alone was, at least in this instance, not sufficient on its own.

## Task list timeline

The original single "Finish by 7:45 AM" line read ambiguously once a routine had more than one item left — indistinguishable from "this *habit* finishes at 7:45," which was never the intent. `ContentState.timelineSegments`/`routineStartedAt`/`routineFinishAt` (`RoutineActivityAttributes.swift`) carry a whole-routine view instead: a proportional segment bar (`timelineBar`/`routineTimelineBlock`, `RoutineActivityLiveActivity.swift`) plus the routine's actual start time and live projected finish, both shown side-by-side with the bar. Empty/`nil` (a standalone, non-session timer, which has no routine to show one for) falls back to the original single-habit `finishLine`.

**The math is the exact same functions the in-app view already uses** — `lib/projected-finish.ts`'s `TaskProjection`/`projectedFinishTime` and `lib/task-timeline.ts`'s `computeTimeline`, both pure functions with no React dependency, so nothing needed reimplementing:

- **Local path** (`TaskListSessionView.tsx`'s per-item switch effect) builds `projectionItems` from `items` + the `records` it already just fetched via `fetchDayLogs()` (the current item is `"active"`, everything else resolved from that fresh fetch — simpler than the render-time version below it, which additionally has to reconcile `sessionLogs`/`latestLogs`/`externalLogs` precedence for its own live display) and passes `timelineSegments`/`routineStartedAt`/`routineFinishAt` alongside the existing fields in the same `updateRoutineActivity(...)` call — no new call site, no extra bridge round-trip.
- **Push path** (`lib/task-trigger.ts`'s new `buildTaskListTimeline()`, called from `notifyLiveActivity()` whenever `target.sessionTaskListId` is set) does the server-side equivalent: queries every active `Task` in the list plus today's `TaskLog`s for them, resolves each to the same four-state `TaskProjection`, and calls the identical `computeTimeline`/`projectedFinishTime`.

Both paths map `TimelineColorState`'s `"active-over"` to `"activeOver"` before sending — a Swift-identifier-friendly rename, not a semantic change; `RoutineActivityAttributes.TimelineSegment.colorState` is a plain `String`, not a Swift enum, so this is just string matching in `timelineSegmentColor(_:)`, not a shared type.

**One deliberate divergence from `computeTimeline`'s own color mapping**: `lib/task-timeline.ts` always reports a `"done"` item as olive regardless of variance (matching `TaskRow`'s done badge elsewhere in the app — see that file's own comment), and that in-app behavior is untouched. But confirmed with the user: on the Lock Screen specifically, a habit that ran well over target reverting straight to green the moment it's marked done loses information worth keeping visible at a glance. Both `TaskListSessionView.tsx` (via a local `projectionById` lookup) and `buildTaskListTimeline()` server-side re-label a segment as `"activeOver"` (amber) whenever its underlying `TaskProjection` is `state: "done"` with `actualMinutes > projectedMinutes` — a payload-building-time override, not a change to `computeTimeline` or anything the in-app timeline bar renders.

Like the countdown/color above, this is refreshed only on an item switch (or a push trigger), not per-second — a routine's projected finish time doesn't need second-level precision on a Lock Screen glance, and refreshing on every habit transition is already far more granular than the "only updates when the app is reopened" gap this feature exists to close.

**The active item's own segment is a second exception, and can't be a payload-building-time override the way the done-over-target one is.** Confirmed by the user: while a habit was still running and went over target, the timer text correctly turned amber (it's computed live from `Date()` on every render — see above) but its timeline segment stayed olive, because unlike the timer text, a segment's `colorState` is just a string read straight off whatever `ContentState` was last pushed — computed once, at update time, then frozen until the next update/push, with nothing to correct it as real time passes and the *same* habit quietly crosses from on-track to over. `timelineBar` now special-cases this: a segment whose `colorState` is `"active"` or `"activeOver"` (there's always at most one — `computeTimeline` only ever gives the current item one of those two states) ignores that static string entirely and renders via `timerColor(state)` instead, live, the same function the timer text already uses. Every other segment (`"done"`, `"pending"`) still reads its static color normally — only the one segment that can actually go stale between updates needed the live path.

**`routineFinishAt` itself turns out not to need a live correction, only a live *addition*.** The user's original ask was for the finish time to visibly creep later, minute by minute, while a habit sits over target with no new push arriving — genuinely not achievable the way the timer text is (there's no SwiftUI primitive for "a live-updating absolute clock time," only durations). But the math resolves it without one: `routineFinish` is sent at the moment the active item *starts* (elapsed ≈ 0, still on schedule), so the value sent is always exactly `targetInstant + (sum of every pending item's projectedMinutes)` — call this `baseFinish`. Once the active item runs over its own target, `lib/projected-finish.ts`'s `remainingMinutes` stops crediting it anything further, so the *true* live finish is `now + (that same pending sum)` — which is algebraically identical to `baseFinish + (now - targetInstant)`, i.e. `baseFinish` plus however long the active item has been over. That second term is exactly `overtimeText(from:)` — the same count-up powering the timer flip above. So `routineFinish` never needs correcting on its own; `overtimeBadge(_:)` appends that live "+HH:MM:SS" right next to it, inline, whenever the active item is over target, and the two numbers together are always exactly right.

**Known cosmetic issue, not yet resolved**: the badge sits inline with "Finish by" in the same `HStack`, trailing-anchored via a `Spacer` — so "Finish by"'s own position visibly shifts as the badge appears and as its digit count changes tick to tick, since anything sharing that `HStack` reflows when the badge's width changes. A separate-row layout was tried to fix this and rolled back — confirmed by the user it didn't actually help — so this is back to the simpler inline version with the shift still present, rather than carrying unproven complexity forward for no benefit.

## Setting it up

Same native-rebuild requirement as [`app-intents.md`](app-intents.md#setting-it-up): this only ships via an actual `xcodebuild`/install cycle, not a web-only Vercel deploy. After installing:

1. Open the app once (cold launch or Profile) so the API key reaches Keychain under the new shared access group.
2. Start any routine timer — the Lock Screen card should appear within a second or two (no permission prompt beyond the OS's standard Live Activities toggle, on by default).
3. Confirm Settings → Face ID & Passcode (or per-app) hasn't disabled Live Activities for Ch'rps — `LiveActivityPlugin.isSupported()` surfaces `ActivityAuthorizationInfo().areActivitiesEnabled` if this needs checking programmatically later.
4. For push updates specifically: `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_PRIVATE_KEY` need to be set both locally (`.env.local`) and on Vercel (production env) — see CLAUDE.md's Environment Variables section. A **physical device is required to test this end to end**; the Simulator cannot receive genuine APNs pushes (only `xcrun simctl push` for locally-simulated payloads, which doesn't exercise the real server round trip).

## Depends on

[`timer.md`](timer.md) (elapsed-time computation, the single-active-timer invariant, the Task List Session's per-task switch effect and foreground-revalidation effect) and [`api/external-api.md`](../api/external-api.md) (`complete-active-task`, which the Done button calls, and `trigger-task`'s Case 2 dispatch, which `complete-active-task` mirrors server-side). Shares `ChrpsAPI`/`KeychainHelper` with [`app-intents.md`](app-intents.md).
