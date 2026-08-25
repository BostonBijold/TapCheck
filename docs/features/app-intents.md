> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# App Intents — Native Habit Triggers

A native alternative to [NFC tap-to-start habits](nfc.md)'s per-card URL-copy-paste Shortcut flow: Apple's App Intents framework (`AppEntity`, `EntityQuery`, `AppIntent`, `AppShortcutsProvider`) lets Be One declare a "Trigger Habit" action that appears automatically in the Shortcuts app gallery, Siri, and Spotlight — a live, native picker of the user's actual habits, with no URL or API key ever touching a Shortcut. This is **additive**, not a replacement: [`components/TagLinkedSetup.tsx`](nfc.md#generating-a-trigger-without-a-physical-tap), `POST /api/nfc-tags/generate`, and `GET /api/external/nfc/[tagCode]` are untouched and remain the path that needs no native rebuild at all. An NFC Automation can be pointed at this native intent directly instead of a URL-based Shortcut, once it's built.

## Why this needed real native code

App Intents has no JS/Capacitor-JS equivalent — unlike Universal Links, which route an NFC tap through the WebView (`components/UniversalLinkHandler.tsx`), Shortcuts-gallery/Siri/Spotlight integration is OS-level and only reachable from actual Swift code compiled into the native app target. This is the first custom native code this project needed beyond Capacitor's stock plugins (`@capacitor/app`, `@capacitor/splash-screen`, `@capacitor/status-bar`).

## The habit list — `GET /api/external/habits`

New, read-only sibling to `trigger-habit`/`nfc/[tagCode]` (see [`api/external-api.md`](../api/external-api.md#get-apiexternalhabits)) — lists a user's active habits with inline group context (`{ id, name, icon, itemType, groupId, groupName }`), sorted to match in-app ordering. Nothing else calls this endpoint; it exists solely to back the native picker below.

## The Keychain bridge

App Intents code runs independent of the WebView — possibly via a background launch of the app from a locked-phone NFC Automation — so it can't reach into `localStorage`/React state for the API key. Instead:

- **`ios/App/App/KeychainHelper.swift`** — a small `Security`-framework wrapper (`save`/`load`), using **`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`**, not the more commonly-defaulted `WhenUnlocked*` variant. This is the single most important correctness detail here: an intent fired by a locked-phone Automation needs to read the key *before* the device is necessarily unlocked that session — `WhenUnlocked*` fails with `errSecInteractionNotAllowed` in exactly that case. `ThisDeviceOnly` keeps it out of encrypted backups.
- **`ios/App/App/ApiKeyBridgePlugin.swift`** — the first custom Capacitor plugin in this project. A `CAPPlugin` + `CAPBridgedPlugin` conforming class, compiled directly into the `App` target (no separate npm package, no manual registration — Capacitor 8.x auto-discovers `CAPBridgedPlugin` conformers via runtime introspection at bridge init). One method, `setApiKey({ apiKey })`, writes to `KeychainHelper`. No App Groups entitlement needed — there's no separate extension target in this project, so the plugin and the App Intents code already share one process/bundle ID/default keychain access group.
- **`lib/native/api-key-bridge.ts`** — the JS-side `registerPlugin<ApiKeyBridgePlugin>("ApiKeyBridge")` wrapper.
- **Bootstrapped from two call sites**, both already `Capacitor.isNativePlatform()`-gated no-ops on web:
  1. `components/ProfileView.tsx`'s existing API-key fetch (already there for the copy-to-clipboard card) now also pushes the key to Keychain.
  2. `components/UniversalLinkHandler.tsx` (globally mounted in `app/layout.tsx`) does the same fetch-and-push on every native cold start — closing the gap where an intent invoked before the user ever opened Profile would find nothing in Keychain. If Be One is installed but Profile has never been opened *and* the app hasn't been cold-launched natively even once, the key genuinely isn't there yet — `TriggerHabitIntent` surfaces a clear, actionable error in that case rather than failing silently (see below).

## Swift file layout

```
ios/App/App/
  KeychainHelper.swift
  ApiKeyBridgePlugin.swift
  AppIntents/
    HabitEntity.swift         — AppEntity wrapping one habit from GET /api/external/habits
    HabitEntityQuery.swift    — EntityQuery + EntityStringQuery, backed by a 45s-TTL actor
                                 cache (HabitCache) so the Shortcuts editor's search field
                                 doesn't hit the network on every keystroke; also hosts the
                                 shared BeOneAPI networking enum (base URL, fetch/trigger
                                 calls) used by TriggerHabitIntent too
    TriggerHabitIntent.swift  — the AppIntent itself; POSTs to the existing
                                 /api/external/trigger-habit, no new trigger logic
    BeOneShortcuts.swift      — AppShortcutsProvider; this alone is what makes the action
                                 appear in the Shortcuts gallery/Siri/Spotlight, no
                                 Info.plist configuration needed
```

`BeOneAPI`'s base URL (`https://be-one-nu.vercel.app`) is a hardcoded Swift constant matching `capacitor.config.ts`'s `server.url` — there's no way to share the JS config into native code, so this is a second place (beyond `App.entitlements`'s associated domain and the AASA route — see [`nfc.md`'s "Domain permanence"](nfc.md#native-setup)) that needs updating together if the production domain ever changes.

**`ios/App/App/SceneDelegate.swift` must construct `MainViewController()`, not a bare `CAPBridgeViewController()`.** It was the latter until this feature exposed the bug — meaning `MainViewController`'s overrides, including `capacitorDidLoad()`'s plugin registration (and even the pre-existing scroll-bounce fix, unrelated to any of this), silently never ran, ever. Confirmed on-device: `NSLog`, `os_log(.fault)`, and raw stderr/stdout writes placed directly in `MainViewController.viewDidLoad()` produced zero output through any capture mechanism, even in a fully non-accelerated, traditionally-linked build — the only remaining explanation was that the class was never instantiated. Symptom, if this regresses again: the "Trigger Habit" Shortcuts action resolves its habit picker fine (native Capacitor bridge basics still work) but every run fails with `BeOneAPIError.notSignedIn` regardless of being actually signed in, because `ApiKeyBridgePlugin` was never registered to receive the key in the first place.

## `openAppWhenRun = false`

`TriggerHabitIntent` sets this explicitly. It's what makes the native intent behave like the existing silent NFC Automation path — no app launch, no UI, works with the phone locked — rather than the Universal Link path, which always foregrounds the app and shows the OS confirmation prompt. This is the actual functional parity target: an NFC Automation's "Run Shortcut" step can run this intent directly and get the same silence the URL-based flow already provides.

## Connection status in Manage Habit

There's no Apple-provided hook for "a user configured a Shortcut with this habit as its parameter" — the Shortcuts editor never talks to a server just because someone picked a value from `HabitEntityQuery`'s list. The only signal Be One ever gets is when the Shortcut actually **runs**. So rather than pretend to track individual Shortcuts, `models/AppIntentLink.ts` records usage: `{ userId, routineItemId, lastTriggeredAt }`, upserted by `POST /api/external/trigger-habit` whenever the caller passes `source: "app_intent"` (see [`api/external-api.md`](../api/external-api.md#post-apiexternaltrigger-habit)) — `TriggerHabitIntent`'s `BeOneAPI.triggerHabit` always sends this.

`app/(app)/routines/[groupId]/edit/page.tsx` loads these alongside `NfcTag` rows and passes `appIntentLastTriggeredAt` to `components/RoutineEditView.tsx`, which shows a "Siri & Shortcuts — Connected · last used {date}" line in the per-item edit panel whenever it's non-null. This is independent of, and stacks freely with, the existing NFC tag status — a habit can be "linked" to a physical card *and* show as Shortcuts-connected at the same time, and nothing here blocks a habit from having multiple NFC tags or being picked by multiple different Shortcuts; the badge is just "has this ever been triggered via App Intent," not an exclusive slot.

## Accepted v1 gap — `updateAppShortcutParameters()`

This static method exists to refresh Siri's own cached phrase/parameter matching (e.g. so a voice command resolves correctly sooner after a habit is renamed). There's no native code path to call it from, since all habit CRUD happens in the web view with no corresponding native hook. Not solved here — the Shortcuts-app picker itself is unaffected (it re-queries `HabitEntityQuery` fresh every time it's opened), so this only narrowly affects direct Siri voice-phrase matching potentially lagging behind a rename.

## Deployment target

Raised `IPHONEOS_DEPLOYMENT_TARGET` from `15.0` to `17.0` (all 4 occurrences in `ios/App/App.xcodeproj/project.pbxproj`) — App Intents needs 16+, and 17.0 is a reasonable floor for this single-user personal app with no backward-compat need. `ios/App/CapApp-SPM/Package.swift` was deliberately **not** touched — it's Capacitor-CLI-managed, and a Swift package's declared platform floor doesn't need to match or be raised alongside a higher consuming-app deployment target.

## Setting it up

1. Rebuild and install the app on-device (native code changed — a web-only deploy isn't enough, same caveat as any native change; see [`nfc.md`'s Universal Link fix note](nfc.md#native-setup) for why that distinction matters in this server-URL-mode app).
2. Open the app once (Profile, or just a cold launch) so the API key reaches Keychain.
3. In the Shortcuts app, the "Trigger Habit" action should appear under Be One — add it to a new Shortcut, or ask Siri directly ("Trigger a habit in Be One").
4. Pick a habit from the live picker. No URL, no API key entry.
5. For a physical card: create the NFC Automation as usual (Automation → + → NFC → scan card → Run Shortcut) and point it at this Shortcut instead of a `Get Contents of URL`-based one.
