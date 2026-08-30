> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# App Intents — Native Check Triggers

> Note: this doc's prose has been updated for the app's pivot from personal
> habits to restaurant work checks, but the underlying Swift code's
> `Habit`/`Routine`-prefixed file and type names (`HabitEntity.swift`,
> `TriggerHabitIntent`, `fetchHabits`, `RoutineActivity`) are a native-project
> concern not touched by this pass — see CLAUDE.md for the pivot's current
> scope. The app's own brand name shown to Siri/Shortcuts (`ChrpsAPI`,
> `ChrpsShortcuts`, "Ch'rps") *was* renamed as part of the Ch'rps rebrand,
> unlike that Habit/Routine vocabulary.

Apple's App Intents framework (`AppEntity`, `EntityQuery`, `AppIntent`, `AppShortcutsProvider`) lets the app declare a "Trigger Habit" action that appears automatically in the Shortcuts app gallery, Siri, and Spotlight — a live, native picker of the user's actual checks, with no URL or API key ever touching a Shortcut. This is now the **only** supported way to trigger a check from outside the app; an earlier NFC-tag/Universal-Link-based system (per-card URLs, a claim flow, `NfcTag`/`PendingNfcLink` models) was removed once this shipped — everything it did, App Intents does better, including physical taps (see "Physical NFC tags" below).

## Why this needed real native code

App Intents has no JS/Capacitor-JS equivalent — this is OS-level Shortcuts-gallery/Siri/Spotlight integration, only reachable from actual Swift code compiled into the native app target. This is the first custom native code this project needed beyond Capacitor's stock plugins (`@capacitor/app`, `@capacitor/splash-screen`, `@capacitor/status-bar`).

## Physical NFC tags

No app-specific NFC code or data model is needed for a physical tap-to-trigger experience. Shortcuts' own NFC Automation binds directly to a tag's hardware UID when you set it up (Automation → + → NFC → scan tag → Run Shortcut) — it works with any tag, blank or not, and needs nothing written to it, no "claiming," no per-tag record in this app's database at all. Point that Automation at a Shortcut built around the "Trigger Habit" action (with the desired habit pre-selected as its parameter) and tapping the tag fires it silently, phone locked included. This is strictly simpler than the retired NFC-tag system, which needed a `tagCode` written to each tag, an in-app claim flow, and Universal Links just to get to the point of building a Shortcut.

## The habit list — `GET /api/external/tasks`

Read-only sibling to `trigger-task` (see [`api/external-api.md`](../api/external-api.md#get-apiexternaltasks)) — lists a company's active tasks with inline task-list context (`{ id, name, icon, itemType, groupId, groupName }`, field names kept as the external wire contract — see external-api.md's Vocabulary note), sorted to match in-app ordering. Nothing else calls this endpoint; it exists solely to back the native picker below.

## The Keychain bridge

App Intents code runs independent of the WebView — possibly via a background launch of the app from a locked-phone NFC Automation — so it can't reach into `localStorage`/React state for the API key. Instead:

- **`ios/App/App/KeychainHelper.swift`** — a small `Security`-framework wrapper (`save`/`load`), using **`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`**, not the more commonly-defaulted `WhenUnlocked*` variant. This is the single most important correctness detail here: an intent fired by a locked-phone Automation needs to read the key *before* the device is necessarily unlocked that session — `WhenUnlocked*` fails with `errSecInteractionNotAllowed` in exactly that case. `ThisDeviceOnly` keeps it out of encrypted backups.
- **`ios/App/App/ApiKeyBridgePlugin.swift`** — the first custom Capacitor plugin in this project. A `CAPPlugin` + `CAPBridgedPlugin` conforming class, compiled directly into the `App` target (no separate npm package, no manual registration — Capacitor 8.x auto-discovers `CAPBridgedPlugin` conformers via runtime introspection at bridge init). One method, `setApiKey({ apiKey })`, writes to `KeychainHelper`. No App Groups entitlement needed — there's no separate extension target in this project, so the plugin and the App Intents code already share one process/bundle ID/default keychain access group.
- **`lib/native/api-key-bridge.ts`** — the JS-side `registerPlugin<ApiKeyBridgePlugin>("ApiKeyBridge")` wrapper.
- **Bootstrapped from two call sites**, both already `Capacitor.isNativePlatform()`-gated no-ops on web:
  1. `components/ProfileView.tsx`'s existing API-key fetch (already there for the copy-to-clipboard card) now also pushes the key to Keychain.
  2. `components/NativeBootstrap.tsx` (globally mounted in `app/layout.tsx`) does the same fetch-and-push on every native cold start — closing the gap where an intent invoked before the user ever opened Profile would find nothing in Keychain. If Ch'rps is installed but Profile has never been opened *and* the app hasn't been cold-launched natively even once, the key genuinely isn't there yet — `TriggerHabitIntent` surfaces a clear, actionable error in that case rather than failing silently (see below).

## Swift file layout

```
ios/App/App/
  KeychainHelper.swift
  ApiKeyBridgePlugin.swift
  ChrpsAPI.swift             — baseURL, triggerHabit, ChrpsAPIError. Moved out of
                                HabitEntityQuery.swift (where it originally lived inline) when
                                the Live Activity feature needed to share it with a second
                                target — see docs/features/live-activity.md. Now dual
                                App + RoutineActivityExtension target membership.
  AppIntents/
    HabitEntity.swift         — AppEntity wrapping one task from GET /api/external/tasks
    HabitEntityQuery.swift    — EntityQuery + EntityStringQuery, backed by a 45s-TTL actor
                                 cache (HabitCache) so the Shortcuts editor's search field
                                 doesn't hit the network on every keystroke; also hosts
                                 fetchHabits as an App-only extension on the ChrpsAPI enum
                                 above (its response decodes into [HabitEntity], which the
                                 Live Activity's extension target doesn't compile, hence not
                                 in ChrpsAPI.swift itself)
    TriggerHabitIntent.swift  — the AppIntent itself; POSTs to the existing
                                 /api/external/trigger-task, no new trigger logic
    ChrpsShortcuts.swift      — AppShortcutsProvider; this alone is what makes the action
                                 appear in the Shortcuts gallery/Siri/Spotlight, no
                                 Info.plist configuration needed
```

A second AppIntent, `CompleteHabitFromActivityIntent` (the Live Activity's "Done" button), also calls into `ChrpsAPI.triggerHabit` — see [`live-activity.md`](live-activity.md).

`ChrpsAPI`'s base URL (`https://chrps.vercel.app`) is a hardcoded Swift constant matching `capacitor.config.ts`'s `server.url` — there's no way to share the JS config into native code, so this is a place that needs updating manually if the production domain ever changes.

**`ios/App/App/SceneDelegate.swift` must construct `MainViewController()`, not a bare `CAPBridgeViewController()`.** It was the latter until this feature exposed the bug — meaning `MainViewController`'s overrides, including `capacitorDidLoad()`'s plugin registration (and even the pre-existing scroll-bounce fix, unrelated to any of this), silently never ran, ever. Confirmed on-device: `NSLog`, `os_log(.fault)`, and raw stderr/stdout writes placed directly in `MainViewController.viewDidLoad()` produced zero output through any capture mechanism, even in a fully non-accelerated, traditionally-linked build — the only remaining explanation was that the class was never instantiated. Symptom, if this regresses again: the "Trigger Habit" Shortcuts action resolves its habit picker fine (native Capacitor bridge basics still work) but every run fails with `ChrpsAPIError.notSignedIn` regardless of being actually signed in, because `ApiKeyBridgePlugin` was never registered to receive the key in the first place.

## Local date, not server UTC

`ChrpsAPI.triggerHabit` sends an explicit `date` param (`YYYY-MM-DD`, computed from `DateFormatter` with `timeZone = .current`) rather than leaving it out. Confirmed on-device: without it, `POST /api/external/trigger-task` defaults to the *server's* UTC date, and a trigger fired at 7pm Mountain time landed on tomorrow's log — invisible on today's view. The web client never hits this, since `TasksView.tsx` has its own effect that compares the server-rendered UTC `today` against `new Date().toLocaleDateString("en-CA")` (the browser's local date) and redirects to correct it on every load/foreground; the App Intent path has no equivalent correction, so it has to get the date right itself up front instead.

## `openAppWhenRun = false`

`TriggerHabitIntent` sets this explicitly — no app launch, no UI, works with the phone locked, regardless of whether it's run manually, via Siri, or from an NFC Automation. This is the whole point: a silent trigger with no OS confirmation prompt of any kind.

## Connection status in Manage Habit

There's no Apple-provided hook for "a user configured a Shortcut with this task as its parameter" — the Shortcuts editor never talks to a server just because someone picked a value from `HabitEntityQuery`'s list. The only signal Ch'rps ever gets is when the Shortcut actually **runs**. So rather than pretend to track individual Shortcuts, `models/AppIntentLink.ts` records usage: `{ userId, taskId, lastTriggeredAt }`, upserted by `POST /api/external/trigger-task` whenever the caller passes `source: "app_intent"` (see [`api/external-api.md`](../api/external-api.md#post-apiexternaltrigger-task)) — `TriggerHabitIntent`'s `ChrpsAPI.triggerHabit` always sends this.

`app/(app)/tasks/[taskListId]/edit/page.tsx` loads these and passes `appIntentLastTriggeredAt` to `components/TaskListEditView.tsx`, which shows a "Siri & Shortcuts — Connected · last used {date}" line in the per-task edit panel whenever it's non-null. Nothing here blocks a task from being picked by multiple different Shortcuts, or an NFC Automation on top of one of them; the badge is just "has this ever been triggered via App Intent," not an exclusive slot.

## Accepted v1 gap — `updateAppShortcutParameters()`

This static method exists to refresh Siri's own cached phrase/parameter matching (e.g. so a voice command resolves correctly sooner after a habit is renamed). There's no native code path to call it from, since all habit CRUD happens in the web view with no corresponding native hook. Not solved here — the Shortcuts-app picker itself is unaffected (it re-queries `HabitEntityQuery` fresh every time it's opened), so this only narrowly affects direct Siri voice-phrase matching potentially lagging behind a rename.

## Deployment target

Raised `IPHONEOS_DEPLOYMENT_TARGET` from `15.0` to `17.0` (all 4 occurrences in `ios/App/App.xcodeproj/project.pbxproj`) — App Intents needs 16+, and 17.0 is a reasonable floor for this single-user personal app with no backward-compat need. `ios/App/CapApp-SPM/Package.swift` was deliberately **not** touched — it's Capacitor-CLI-managed, and a Swift package's declared platform floor doesn't need to match or be raised alongside a higher consuming-app deployment target.

## Setting it up

1. Rebuild and install the app on-device — native code changed, so a web-only deploy isn't enough; this app runs in Capacitor server-URL mode (`capacitor.config.ts`'s `server.url` points at the live Next.js deployment), so the *JS* side of any change ships on a normal web deploy, but Swift changes need an actual `xcodebuild`/install cycle.
2. Open the app once (Profile, or just a cold launch) so the API key reaches Keychain.
3. In the Shortcuts app, the "Trigger Habit" action should appear under Ch'rps — add it to a new Shortcut, or ask Siri directly ("Trigger a habit in Ch'rps").
4. Pick a habit from the live picker. No URL, no API key entry.
5. For a physical tap: Automation → + → NFC → scan any tag → Run Shortcut → the Shortcut built in step 3-4. No app-specific tag setup of any kind.
