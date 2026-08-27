> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Live Activity — Lock Screen / Dynamic Island Timer

While a routine timer is running, a branded card shows on the Lock Screen and Dynamic Island: the routine label, current habit, a live elapsed timer, an estimated-completion clock time, and a "Done" button that completes the habit without opening the app. This is the second piece of custom native code this project needed beyond Capacitor's stock plugins (the first was [`app-intents.md`](app-intents.md)'s Shortcuts/Siri integration) — Live Activities have no JS/Capacitor-JS equivalent, only reachable from ActivityKit/WidgetKit in a real Widget Extension target.

## Why a second Xcode target was required

App Intents (the first piece of native code here) compiled directly into the `App` target — no extension needed, since Shortcuts/Siri/Spotlight integration doesn't render any UI of its own. A Live Activity's Lock Screen/Dynamic Island UI, by contrast, is rendered by the OS from a **Widget Extension** process, not the app's own process — ActivityKit requires that UI to live in a `.appex` target. `RoutineActivityExtension` (product name `RoutineActivity`, bundle id `com.bostonbijold.beone.RoutineActivity`) was added via Xcode's own "Widget Extension" wizard (File → New → Target → Widget Extension, "Include Live Activity" checked) rather than hand-crafted in `project.pbxproj` — safer than scripting a whole new target from scratch, since Apple's template is what correctly wires the `NSExtension` Info.plist keys and the "Embed Foundation Extensions" build phase. Deployment target was lowered from Xcode's default (26.5) to 17.0 to match `App` (interactive Live Activity buttons need iOS 17+ anyway).

**The `RoutineActivity` folder is a filesystem-synchronized group** (`PBXFileSystemSynchronizedRootGroup`, Xcode 16+'s newer target-creation default) — any file physically present in `ios/App/RoutineActivity/` is automatically part of the `RoutineActivityExtension` target's Sources, with no `PBXBuildFile`/`PBXFileReference` bookkeeping needed. This is why `RoutineActivityAttributes.swift` and `CompleteHabitFromActivityIntent.swift` (below) needed no explicit project-file surgery to join that target — only files that needed to cross *into* the traditionally-managed `App` group (or vice versa) needed the `xcodeproj` Ruby gem.

## Swift file layout

```
ios/App/App/
  BeOneAPI.swift                      — baseURL, triggerHabit, completeActiveHabit, BeOneAPIError.
                                         Dual target membership (App + RoutineActivityExtension) —
                                         triggerHabit/BeOneAPIError moved out of
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

The "Done" button's intent runs in the `RoutineActivityExtension` process, not the WebView or even the main `App` process — same "can't reach `localStorage`/React state" problem [`app-intents.md`](app-intents.md#the-keychain-bridge) already solved for App Intents, except now *two different bundle IDs* need to read the same Keychain item (`com.bostonbijold.beone` and `com.bostonbijold.beone.RoutineActivity`), and each gets a different *implicit* default access group. Fix: both targets now declare the same explicit **Keychain Sharing** group —

```xml
<key>keychain-access-groups</key>
<array><string>$(AppIdentifierPrefix)com.bostonbijold.beone.shared</string></array>
```

— in `App/App.entitlements` and the new `RoutineActivity/RoutineActivity.entitlements` (wired to the extension target via `CODE_SIGN_ENTITLEMENTS`), and `KeychainHelper.swift`'s `save`/`load` now pass `kSecAttrAccessGroup` explicitly rather than relying on the per-target default. The value is hardcoded as `"X3DPK5Y29G.com.bostonbijold.beone.shared"` (team ID + group name) rather than resolved from `$(AppIdentifierPrefix)` at runtime — Swift code needs the literal resolved string, not the build-setting macro; same manual-sync tradeoff as `BeOneAPI.baseURL`, equally unlikely to change for a single-developer personal app.

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
        var routineGroupId: String? // nil for standalone; set for a Routine Session item
    }
}
```

No fixed (non-`ContentState`) attributes — a single Activity persists for an entire Routine Session and is **updated in place**, not re-created, as the session advances from habit to habit (avoids the Lock Screen card re-animating/re-appearing on every item switch), so everything needs to be able to change across the Activity's lifetime.

### `startedAt` is a virtual anchor, not always the raw `RoutineLog.startedAt`

The Lock Screen elapsed timer is a native `Text(timerInterval:)` — a free-running, self-updating countup that needs no repeated JS pushes, matching this codebase's existing "derive elapsed from wall-clock time, not ticks" philosophy ([`timer.md`](timer.md#how-elapsed-time-is-computed)). But `Text(timerInterval:)` only knows a single start instant — it has no concept of `pausedSeconds` banked from an earlier running segment (an item resumed after being jumped away from mid-session, see [`timer.md`](timer.md#single-active-timer-pause-instead-of-complete-or-run-concurrently)). Every call site computes the already-existing "seeded elapsed" value (`pausedSeconds + (now - startedAt)`, the same expression used throughout `RoutinesView.tsx`/`RoutineSession.tsx` for the in-app ring) and derives `startedAt: new Date(Date.now() - seeded * 1000).toISOString()` from it — a start instant that, if fed straight into a naive "now minus this" count, already reproduces the correct accumulated elapsed time and continues counting up accurately from there. The native side never needs to know `pausedSeconds` exists.

### Estimated completion

A static (non-live) `Text(date, style: .time)` computed once as `startedAt + projectedMinutes` — not a second live-updating element. `projectedMinutes: 0` (stopwatch items) hides this line entirely.

## `lib/native/routine-activity.ts` — call sites

Thin wrappers (`startRoutineActivity`, `updateRoutineActivity`, `endRoutineActivity`) around `lib/native/live-activity-bridge.ts`'s `registerPlugin` call, each `Capacitor.isNativePlatform()`-gated and swallowing rejections — mirrors `lib/native/api-key-bridge.ts`'s pattern exactly, so every call site below is a single unguarded call with no try/catch of its own.

- **`start`** always ends any existing Activity first, then `request()`s a fresh one — safe given the single-active-timer invariant (at most one relevant Activity ever exists), and used for the standalone `TimerScreen` path (`RoutinesView.tsx`'s `handleStartTimer` resume/fresh-start branches, and `openInProgressTimer`'s cold-start resume).
- **`update`** mutates the existing Activity's `ContentState` in place if one exists, otherwise falls back to `start()` — used by `RoutineSession.tsx`'s per-item effect (the same effect keyed on `currentIndex` that already POSTs `in_progress`/seeds `elapsed` on every item switch — see [`timer.md`](timer.md#the-sequential-session-routinesessiontsx)). This fallback is what lets the *first* item of a session and every *subsequent* switch use the exact same call, with no separate "is this the first item" branch needed.
- **`end`** — called from `RoutinesView.tsx`'s `handleTimerComplete`/`handleTimerMissed` (standalone timer), and from two places in `RoutineSession.tsx`: the `advance()` summary branch and the foreground-revalidation effect's summary branch — both genuine "every item in the group is finished" moments.

**Deliberately *not* called from `TimerScreen`'s plain `onClose`, nor from `RoutineSession`'s `handleClose`** (the X button) — both leave the current item's log `in_progress` on the server rather than completing it, and the whole point of a Live Activity is staying visible on the Lock Screen after the app itself is closed. `handleClose` used to flush the current item to `done` before calling the parent's close handler (see [`timer.md`](timer.md#the-sequential-session-routinesessiontsx)); that was changed specifically because it made X indistinguishable from actually finishing the item, and a still-running Live Activity now gives a real reason to just dismiss the session view without finishing anything — the user resumes via the FAB's active-timer indicator instead.

**Checkbox/special items** (`virtue_checkin`, `weekly_review`, `routine_review` — see [`timer.md`](timer.md)) have no timer of their own; `RoutineSession.tsx`'s per-item effect calls `end` rather than `update` when landing on one, so the Lock Screen doesn't show a frozen, meaningless timer. Landing on the *next* timed item afterward goes through `update()`'s start-fallback, same as a session's very first item.

## The "Done" button — matches the NFC/Shortcuts tap exactly server-side; the card itself doesn't update live

`CompleteHabitFromActivityIntent` (`LiveActivityIntent`, runs in the `RoutineActivityExtension` process without opening the app or showing any UI — same `openAppWhenRun`-false spirit as `TriggerHabitIntent`) is meant to feel identical to tapping an NFC tag or running the "Trigger Habit" Shortcut: complete the current habit, start the next one in the group if there is one, or finish the routine if it was the last. Getting the *data* side of that right took three iterations, kept here because the failure modes are non-obvious and specific to running inside a Live Activity's extension process rather than an ordinary Shortcuts-invoked intent:

1. **`BeOneAPI.triggerHabit(routineItemId:, routineGroupId:)` with those two values passed as the button's bound `@Parameter`s**, captured at `Button(intent:)` construction time from `context.state`. Confirmed on-device: tapping Done a *second* time while the screen had stayed asleep since the first tap re-fired against the *first* habit's id — the value baked into the button at the last time SwiftUI actually rendered it, not the current one, even though the Activity's real content state had already moved on.
2. **Same endpoint, but `perform()` read `routineItemId`/`routineGroupId` fresh from `Activity<RoutineActivityAttributes>.activities.first?.content.state`** instead of trusting the bound parameters — reasoning that it's a live, system-synced data source independent of view rendering. Confirmed on-device: this made the Done button do **nothing at all** — no completion, no advance — because `Activity.activities` was empty when queried from inside this intent's `perform()`, so the guard at the top of the function returned immediately.
3. **`POST /api/external/complete-active-habit`** ([`api/external-api.md`](../api/external-api.md#post-apiexternalcomplete-active-habit)) — takes no `routineItemId` at all, resolving "which habit" server-side from the single in_progress `RoutineLog` (server-authoritative, via the single-active-timer invariant). This is the one that actually works, and is what `perform()` calls today: correctness no longer depends on any value the widget extension itself has to track or look up, only on the API key in Keychain.

A fourth iteration tried using `Activity.activities` for a *cosmetic-only* update — swap the card to show the newly-started next habit in place, falling back to `.end()` if that data wasn't available — reasoning that even if unreliable for identifying "which habit" (iteration 2's problem), it might still be good enough for a best-effort display refresh. **Confirmed via a Simulator log capture that this isn't viable either**, and dropped: `xcrun simctl spawn <udid> log stream` filtered to the `RoutineActivityExtension` process shows ActivityKit's own internal `[com.apple.activitykit:outputClient] Fetched descriptors for content states: []` logged nine times, ~200ms apart, staying empty for the full ~2 seconds `perform()` polled — the extension process's `ActivityClient` connection doesn't finish syncing with the system's activity store fast enough for this to be a viable path, and 2 seconds is already too long to make an interactive widget button wait. `perform()` today does nothing beyond the `completeActiveHabit` call — no `Activity.activities` lookup, no `GET /api/external/habits` follow-up, no polling.

**Net effect, and not a bug**: tapping Done reliably completes the current habit and advances to the next one (or finishes the routine) *server-side*, confirmed by reopening the app afterward — but the Lock Screen card itself keeps showing the habit that was just completed until the app is next opened. At that point `RoutineSession.tsx`'s foreground-revalidation effect ([`timer.md`](timer.md)) notices the item is already current, advances `currentIndex`, and its per-item effect starts a fresh, fully-correct Live Activity (real icon/`projectedMinutes` included) for whatever's actually current. This is the same self-healing mechanism that was always the fallback for the "last item in the group" case; it's now doing double duty as the *primary* way the card ever visually catches up, not just an edge-case backstop.

`source: "live_activity"` on the old `trigger-habit` codepath was a distinct value from Shortcuts' `"app_intent"`, used only for `AppIntentLink` bookkeeping ([`app-intents.md`](app-intents.md#connection-status-in-manage-habit)) — `complete-active-habit` doesn't take a `source` param at all, so Live-Activity-only usage no longer lights up the "Connected" badge in Manage Habit either way.

## No tap-through deep link

`widgetURL`/`Link` on the card body (tapping anywhere that isn't the Done button) was deliberately left unset. This project has no working Universal Links or custom URL scheme configured right now — an earlier NFC-tag/Universal-Link system was removed when App Intents shipped ([`app-intents.md`](app-intents.md)), and nothing replaced the Associated Domains entitlement since. Setting `widgetURL` to the production `https://` URL without that entitlement would just open Safari, not the app — worse than doing nothing. The Done button is the one interactive element.

## Palette and typography

`RoutineActivityLiveActivity.swift`'s `Palette` enum hardcodes the dark/olive/gold hex values from CLAUDE.md's Design System section (`bg-primary`, `text-primary`, `text-muted`, `olive`, `gold`) — a widget extension has no access to the app's Tailwind config. Typography uses the system font (SF Pro), not Playfair Display/IBM Plex Mono — bundling and registering a custom font for a widget extension target was judged not worth it for a Lock Screen glance; only the color palette carries the brand.

## Push-driven updates

Everything above (local `start`/`update`/`end` from `LiveActivityPlugin.swift`, and the Done button's failed attempts at touching `Activity.activities`) shares one limitation: it only works while some process on-device — the app or the widget extension — is alive and synced. An **NFC tap, a Shortcut, or the Lock Screen Done button, with the app not open**, changes the active habit on the server with nothing able to tell the Lock Screen card about it. Apple's actual answer to this is **ActivityKit push updates** — the server sends an Apple Push Notification carrying the new content state, and iOS renders it directly, with no app or extension process needing to be running or synced at all.

### Token flow

1. `LiveActivityPlugin.start()` requests the Activity with `pushType: .token` (was `nil`) — this makes iOS issue a **push-to-update token** specific to that Activity (distinct from a device's general remote-notification token; no Notifications permission prompt involved).
2. `observePushToken(for:)` consumes `Activity<RoutineActivityAttributes>.pushTokenUpdates` (an `AsyncSequence` that yields a new token whenever iOS (re)issues one, and finishes on its own once the Activity ends) and forwards each one to JS via `notifyListeners("pushTokenReceived", ...)`, hex-encoded, tagged with `"sandbox"` or `"production"` via a `#if DEBUG` check (this project's only build config today is Debug/Development-signed, which must push through APNs' sandbox host — see the entitlement note below).
3. `lib/native/routine-activity.ts`'s `registerPushTokenForwarding()` — called once from `components/NativeBootstrap.tsx`, same pattern as the API key bridge — listens for that event and `POST`s it to `/api/live-activity/push-token`.
4. That route (session-authenticated, not the API key — this call originates from the app's own logged-in context) upserts `User.liveActivityPushToken`/`liveActivityPushEnvironment`, always overwriting rather than versioning: only the latest token is ever usable, and there's at most one relevant Live Activity per user (single-active-timer invariant).

### Sending a push

`lib/apns.ts`'s `sendLiveActivityPush()` — signs a fresh ES256 provider JWT per call (via `jose`, already present transitively through `@auth/core` and pinned as a direct dependency) using `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_PRIVATE_KEY`, then POSTs to `https://api.push.apple.com` or `.sandbox.` over HTTP/2 (Node's built-in `http2` client — APNs requires HTTP/2, HTTP/1.1 isn't supported) with `apns-topic: com.bostonbijold.beone.push-type.liveactivity` and `apns-push-type: liveactivity`. One connection per call — correct at this app's volume (a personal, single-user app sending at most a handful of pushes a day), not tuned for the connection-reuse a high-throughput provider would want.

`lib/habit-trigger.ts`'s `notifyLiveActivity()` builds the actual payload and is called from both `triggerHabit()` (NFC/Shortcuts) and `completeActiveHabit()` (the Lock Screen Done button) after they resolve — **not** from the in-app `/api/routine-logs` routes, since those are already covered by the app's own local `update()`/`end()` calls firing from foreground JS. It looks up the target item (whichever just started, or whichever just completed if nothing new started) via `RoutineItem`/`RoutineGroup` directly — full DB access, unlike the native side's old `GET /api/external/habits` workaround, so the pushed content state is always fully correct (`projectedMinutes` included, no `0`-placeholder needed) on the first try. Sends an `"update"` event if something's now active, an `"end"` event (with a `dismissal-date` of now) if nothing is. Wrapped in a try/catch that never throws — a push failure shouldn't fail the habit-completion request that triggered it, same as the `AppIntentLink` bookkeeping elsewhere on this surface.

**`content-state`'s `startedAt` is a JSON number, not an ISO string — and specifically seconds since the Cocoa reference date (2001-01-01T00:00:00Z), not Unix epoch seconds.** Swift's default `Codable` synthesis for `Date` (`.deferredToDate`, which `RoutineActivityAttributes.ContentState` doesn't override, and which is what APNs-delivered content actually gets decoded through on-device) encodes/decodes `Date` as `timeIntervalSinceReferenceDate`, not `timeIntervalSince1970` — a 31-year, `978307200`-second difference that's a genuinely common Foundation gotcha, not specific to this feature. Confirmed on-device: sending raw Unix seconds decoded to a `startedAt` ~31 years in the future, so the Lock Screen's `Text(timerInterval:)` — whose displayed range never included "now" — just showed a frozen value instead of counting up, even though the habit name/label updated correctly (those are plain strings, unaffected). `lib/apns.ts`'s `toAppleReferenceSeconds()` does the conversion; `lib/habit-trigger.ts`'s `notifyLiveActivity()` is the only caller.

This is the one place in this feature where the wire format for the *same* struct differs depending on the transport: the local plugin's `parseContentState` reads an ISO string (matching JS's `Date#toISOString()`) because that request is JSON-encoded by hand in `LiveActivityPlugin.swift`'s own Capacitor call layer, not by `Codable` — so the reference-date gotcha above is specific to the push path and doesn't affect local `start`/`update`/`end` calls at all.

### Push Notifications entitlement

`App.entitlements` needs `aps-environment` for the Activity to receive a push token at all — added as `development` (matching this project's only build config, Debug/Development-signed; would need to become `production` alongside an eventual Distribution-signed Release build). Same underlying entitlement ordinary remote notifications would need if this app ever adds those — `lib/apns.ts`'s JWT-signing and HTTP/2 send logic is written to be reusable for that (only the payload shape and `apns-push-type` header are Live-Activity-specific), even though nothing else calls it yet.

### What still doesn't get pushed live

The Done button's `perform()` still doesn't touch `Activity.activities` for a same-tap cosmetic update — the push it triggers arrives asynchronously (typically under a second, but not synchronous with the button tap completing), so tapping Done still won't flip the card *instantly* the way the local-update path does when the app is open. It'll update shortly after, without needing the app opened at all, which is the actual gap this was built to close.

## Countdown timer, and colors

`RoutineActivityLiveActivity.swift`'s `timerText(_:size:)` shows a real countdown (`Text(timerInterval:countsDown: true)`) toward the target for items with `projectedMinutes > 0`, falling back to the plain count-up elapsed display (as before) for stopwatch items with no target. `timerColor(_:)` mirrors the in-app ring's olive → amber (past 75% of target) → burgundy (over target) convention, evaluated at render time.

**Deliberately does not flip to counting up past zero once over target** — confirmed with the user this was an acceptable tradeoff rather than building a scheduled push to swap the display exactly when `projectedMinutes` elapses: `Text(timerInterval:countsDown: true)` has no built-in "count down, then count up past zero" mode: once "now" passes the range's `upperBound`, it just holds at `00:00`. Paired with the color shifting to burgundy and the existing "Est. finish" clock time, this is still an unambiguous "you're over" signal — just not an exact running overage count the way the in-app ring shows.

**A freshly-started Activity's countdown can render as a frozen, non-ticking snapshot** — confirmed on-device: starting a routine while the phone was already locked showed the full target duration (e.g. `10:00`) the entire time, only beginning to actually tick once the app was reopened and its own foreground re-sync issued a fresh `update()` call. `LiveActivityPlugin.start()` now works around this by following its own `request()` with an `update()` call carrying identical content ~500ms later — the extra call is what attaches live-ticking behavior; a `request()` alone was, at least in this instance, not sufficient on its own.

## Routine timeline

The original single "Finish by 7:45 AM" line read ambiguously once a routine had more than one item left — indistinguishable from "this *habit* finishes at 7:45," which was never the intent. `ContentState.timelineSegments`/`routineStartedAt`/`routineFinishAt` (`RoutineActivityAttributes.swift`) carry a whole-routine view instead: a proportional segment bar (`timelineBar`/`routineTimelineBlock`, `RoutineActivityLiveActivity.swift`) plus the routine's actual start time and live projected finish, both shown side-by-side with the bar. Empty/`nil` (a standalone, non-session timer, which has no routine to show one for) falls back to the original single-habit `finishLine`.

**The math is the exact same functions the in-app view already uses** — `lib/projected-finish.ts`'s `ItemProjection`/`projectedFinishTime` and `lib/routine-timeline.ts`'s `computeTimeline`, both pure functions with no React dependency, so nothing needed reimplementing:

- **Local path** (`RoutineSession.tsx`'s per-item switch effect) builds `projectionItems` from `items` + the `records` it already just fetched via `fetchDayLogs()` (the current item is `"active"`, everything else resolved from that fresh fetch — simpler than the render-time version below it, which additionally has to reconcile `sessionLogs`/`latestLogs`/`externalLogs` precedence for its own live display) and passes `timelineSegments`/`routineStartedAt`/`routineFinishAt` alongside the existing fields in the same `updateRoutineActivity(...)` call — no new call site, no extra bridge round-trip.
- **Push path** (`lib/habit-trigger.ts`'s new `buildRoutineTimeline()`, called from `notifyLiveActivity()` whenever `target.sessionGroupId` is set) does the server-side equivalent: queries every active `RoutineItem` in the group plus today's `RoutineLog`s for them, resolves each to the same four-state `ItemProjection`, and calls the identical `computeTimeline`/`projectedFinishTime`.

Both paths map `TimelineColorState`'s `"active-over"` to `"activeOver"` before sending — a Swift-identifier-friendly rename, not a semantic change; `RoutineActivityAttributes.TimelineSegment.colorState` is a plain `String`, not a Swift enum, so this is just string matching in `timelineSegmentColor(_:)`, not a shared type.

**One deliberate divergence from `computeTimeline`'s own color mapping**: `lib/routine-timeline.ts` always reports a `"done"` item as olive regardless of variance (matching `RoutineItemRow`'s done badge elsewhere in the app — see that file's own comment), and that in-app behavior is untouched. But confirmed with the user: on the Lock Screen specifically, a habit that ran well over target reverting straight to green the moment it's marked done loses information worth keeping visible at a glance. Both `RoutineSession.tsx` (via a local `projectionById` lookup) and `buildRoutineTimeline()` server-side re-label a segment as `"activeOver"` (amber) whenever its underlying `ItemProjection` is `state: "done"` with `actualMinutes > projectedMinutes` — a payload-building-time override, not a change to `computeTimeline` or anything the in-app timeline bar renders.

Like the countdown/color above, this is refreshed only on an item switch (or a push trigger), not per-second — a routine's projected finish time doesn't need second-level precision on a Lock Screen glance, and refreshing on every habit transition is already far more granular than the "only updates when the app is reopened" gap this feature exists to close.

## Setting it up

Same native-rebuild requirement as [`app-intents.md`](app-intents.md#setting-it-up): this only ships via an actual `xcodebuild`/install cycle, not a web-only Vercel deploy. After installing:

1. Open the app once (cold launch or Profile) so the API key reaches Keychain under the new shared access group.
2. Start any routine timer — the Lock Screen card should appear within a second or two (no permission prompt beyond the OS's standard Live Activities toggle, on by default).
3. Confirm Settings → Face ID & Passcode (or per-app) hasn't disabled Live Activities for Be One — `LiveActivityPlugin.isSupported()` surfaces `ActivityAuthorizationInfo().areActivitiesEnabled` if this needs checking programmatically later.
4. For push updates specifically: `APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_PRIVATE_KEY` need to be set both locally (`.env.local`) and on Vercel (production env) — see CLAUDE.md's Environment Variables section. A **physical device is required to test this end to end**; the Simulator cannot receive genuine APNs pushes (only `xcrun simctl push` for locally-simulated payloads, which doesn't exercise the real server round trip).

## Depends on

[`timer.md`](timer.md) (elapsed-time computation, the single-active-timer invariant, the Routine Session's per-item switch effect and foreground-revalidation effect) and [`api/external-api.md`](../api/external-api.md) (`complete-active-habit`, which the Done button calls, and `trigger-habit`'s Case 2 dispatch, which `complete-active-habit` mirrors server-side). Shares `BeOneAPI`/`KeychainHelper` with [`app-intents.md`](app-intents.md).
