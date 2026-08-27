> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Live Activity — Lock Screen / Dynamic Island Timer

While a routine timer is running, a branded card shows on the Lock Screen and Dynamic Island: the routine label, current habit, a live elapsed timer, an estimated-completion clock time, and a "Done" button that completes the habit without opening the app. This is the second piece of custom native code this project needed beyond Capacitor's stock plugins (the first was [`app-intents.md`](app-intents.md)'s Shortcuts/Siri integration) — Live Activities have no JS/Capacitor-JS equivalent, only reachable from ActivityKit/WidgetKit in a real Widget Extension target.

## Why a second Xcode target was required

App Intents (the first piece of native code here) compiled directly into the `App` target — no extension needed, since Shortcuts/Siri/Spotlight integration doesn't render any UI of its own. A Live Activity's Lock Screen/Dynamic Island UI, by contrast, is rendered by the OS from a **Widget Extension** process, not the app's own process — ActivityKit requires that UI to live in a `.appex` target. `RoutineActivityExtension` (product name `RoutineActivity`, bundle id `com.bostonbijold.beone.RoutineActivity`) was added via Xcode's own "Widget Extension" wizard (File → New → Target → Widget Extension, "Include Live Activity" checked) rather than hand-crafted in `project.pbxproj` — safer than scripting a whole new target from scratch, since Apple's template is what correctly wires the `NSExtension` Info.plist keys and the "Embed Foundation Extensions" build phase. Deployment target was lowered from Xcode's default (26.5) to 17.0 to match `App` (interactive Live Activity buttons need iOS 17+ anyway).

**The `RoutineActivity` folder is a filesystem-synchronized group** (`PBXFileSystemSynchronizedRootGroup`, Xcode 16+'s newer target-creation default) — any file physically present in `ios/App/RoutineActivity/` is automatically part of the `RoutineActivityExtension` target's Sources, with no `PBXBuildFile`/`PBXFileReference` bookkeeping needed. This is why `RoutineActivityAttributes.swift` and `CompleteHabitFromActivityIntent.swift` (below) needed no explicit project-file surgery to join that target — only files that needed to cross *into* the traditionally-managed `App` group (or vice versa) needed the `xcodeproj` Ruby gem.

## Swift file layout

```
ios/App/App/
  BeOneAPI.swift                      — baseURL, triggerHabit, BeOneAPIError. Dual target
                                         membership (App + RoutineActivityExtension) — moved
                                         out of AppIntents/HabitEntityQuery.swift (where it used
                                         to live inline) specifically so the Live Activity's
                                         "Done" button can call triggerHabit without duplicating
                                         this networking code. fetchHabits/HabitsResponse stayed
                                         behind as an App-only extension on this same enum
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

## The "Done" button — always ends the Activity, never tries to advance it live

`CompleteHabitFromActivityIntent` (`LiveActivityIntent`, runs in the extension process without opening the app or showing any UI — same `openAppWhenRun`-false spirit as `TriggerHabitIntent`) calls `BeOneAPI.triggerHabit(routineItemId, routineGroupId, source: "live_activity")` — the exact same endpoint and Case-2 dispatch ([`external-api.md`](../api/external-api.md#post-apiexternaltrigger-habit)) the Shortcuts/Siri path already uses, so completing (and, if `routineGroupId` is set, server-side auto-advancing to the next item) works identically regardless of which native entry point triggered it.

It then **unconditionally ends the Activity**, even when the server auto-started a next item. Reflecting that next item live in the widget itself was considered and rejected: `trigger-habit`'s response only carries `routineItemId`/`state`/`actualMinutes` (RoutineLog fields), never the next item's name/icon/`projectedMinutes` (those live on `RoutineItem`, not the log) — and `GET /api/external/habits` (the other native-reachable endpoint) doesn't return `projectedMinutes` either, so even a second fetch wouldn't have enough to rebuild a correct `ContentState`. Not worth the complexity for a Lock Screen button, especially given the app already self-heals this for free: `RoutineSession.tsx`'s foreground-revalidation effect ([`timer.md`](timer.md)) notices the external completion within 2 seconds (or immediately on foreground) and calls `setCurrentIndex`, whose effect runs `update()`'s start-fallback for the new current item. **Net effect**: tapping Done dismisses the card; if the session isn't actually finished, reopening the app shows it already advanced, with a fresh Live Activity appearing for the next item within a couple seconds.

`source: "live_activity"` is a distinct value from Shortcuts' `"app_intent"` — harmless (the route only branches on `=== "app_intent"` for `AppIntentLink` bookkeeping; any other value, including this one, is simply not recorded there) and more honest about where the trigger actually came from, at the cost of the "Connected" badge in Manage Habit ([`app-intents.md`](app-intents.md#connection-status-in-manage-habit)) not lighting up for Live-Activity-only usage.

## No tap-through deep link

`widgetURL`/`Link` on the card body (tapping anywhere that isn't the Done button) was deliberately left unset. This project has no working Universal Links or custom URL scheme configured right now — an earlier NFC-tag/Universal-Link system was removed when App Intents shipped ([`app-intents.md`](app-intents.md)), and nothing replaced the Associated Domains entitlement since. Setting `widgetURL` to the production `https://` URL without that entitlement would just open Safari, not the app — worse than doing nothing. The Done button is the one interactive element.

## Palette and typography

`RoutineActivityLiveActivity.swift`'s `Palette` enum hardcodes the dark/olive/gold hex values from CLAUDE.md's Design System section (`bg-primary`, `text-primary`, `text-muted`, `olive`, `gold`) — a widget extension has no access to the app's Tailwind config. Typography uses the system font (SF Pro), not Playfair Display/IBM Plex Mono — bundling and registering a custom font for a widget extension target was judged not worth it for a Lock Screen glance; only the color palette carries the brand.

## Setting it up

Same native-rebuild requirement as [`app-intents.md`](app-intents.md#setting-it-up): this only ships via an actual `xcodebuild`/install cycle, not a web-only Vercel deploy. After installing:

1. Open the app once (cold launch or Profile) so the API key reaches Keychain under the new shared access group.
2. Start any routine timer — the Lock Screen card should appear within a second or two (no permission prompt beyond the OS's standard Live Activities toggle, on by default).
3. Confirm Settings → Face ID & Passcode (or per-app) hasn't disabled Live Activities for Be One — `LiveActivityPlugin.isSupported()` surfaces `ActivityAuthorizationInfo().areActivitiesEnabled` if this needs checking programmatically later.

## Depends on

[`timer.md`](timer.md) (elapsed-time computation, the single-active-timer invariant, the Routine Session's per-item switch effect and foreground-revalidation effect) and [`api/external-api.md`](../api/external-api.md) (`trigger-habit`'s Case 2 dispatch, which the Done button reuses verbatim). Shares `BeOneAPI`/`KeychainHelper` with [`app-intents.md`](app-intents.md).
