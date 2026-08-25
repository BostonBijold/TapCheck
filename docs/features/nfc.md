> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# NFC Tap-to-Start Habits

Physical NFC tags, pre-manufactured with a generic branded URL and sold/handed to a user, that a user then links to one of their own habits inside the app — tapping the tag afterward opens the native app directly (not a browser) and starts or completes that habit. Distinct from [`api/external-api.md`](../api/external-api.md)'s `trigger-habit` endpoint, which is the older Shortcuts-app-mediated path (NFC tag → iOS Automation → Shortcut → API-key POST with a hardcoded `routineItemId`); this feature needs no Shortcuts setup from the end user at all. Both paths share the same underlying start/complete logic — see [Relationship to the external API](#relationship-to-the-external-api) below.

## Why Universal Links, not a plain web link

A tag just encodes a static URL — `https://be-one-nu.vercel.app/nfc/<tagCode>` — since NFC hardware has no way to carry a custom HTTP method or body. Opening that URL needs to land in the native app, not Safari, so the tap-to-open mechanism is Apple's **Universal Links**: the domain publishes an `apple-app-site-association` file and the app declares the `com.apple.developer.associated-domains` entitlement for it; iOS then routes a tap on that URL straight into the app instead of a browser, with no custom in-app NFC-reading code required for this direction (see [Native setup](#native-setup)).

## Data model

- `models/NfcTag.ts` — `{ tagCode (unique), userId | null, routineItemId | null, routineGroupId | null, claimedAt | null }`. A separate collection from `RoutineItem` (not a field on it) so one habit can have multiple tags pointing at it — e.g. a tag by the shower and one by the gym bag, both starting the same routine. `tagCode` is generated ahead of time, before any user owns the tag — see [Provisioning](#provisioning).
- `models/PendingNfcLink.ts` — `{ userId (unique), routineItemId, armedAt }`. One per user; supports the "arm, then tap" linking flow below. Treated as stale and ignored if `armedAt` is more than ~5 minutes old at read time (checked inline in `app/nfc/[tagCode]/page.tsx`, no TTL index).

## Linking flow — "arm, then tap"

No native NFC scanning code is used for linking, only for the everyday trigger (both of which are actually the same Universal Link mechanism — reading is never done in-app):

1. In Manage Habit (`components/RoutineEditView.tsx`'s per-item inline edit panel), the user taps **Link NFC Tag** → `POST /api/nfc-tags` upserts a `PendingNfcLink` for that item.
2. The user physically taps an unclaimed tag against the phone → Universal Links opens `/nfc/<tagCode>` directly in-app.
3. `app/nfc/[tagCode]/page.tsx` finds a fresh `PendingNfcLink` for the signed-in user, claims the tag (sets `userId`/`routineItemId`/`routineGroupId`/`claimedAt`), deletes the pending link, and shows confirmation.

If a tag is tapped cold (unclaimed, nothing armed), the page instead renders a picker of the user's active routine items (`components/ClaimTagPicker.tsx`), posting to `POST /api/nfc-tags/[tagCode]` to claim on selection.

## Trigger flow

Tapping an already-claimed tag opens the same page; since `tag.userId` now matches the session, it calls `triggerHabit()` (`lib/nfc-actions.ts`) — the same bidirectional start/complete case logic `trigger-habit` uses (see below). If that call left the *tapped* item itself in a terminal `done` state — either it's a mark-and-done type (checkbox/virtue_checkin/weekly_review, always immediate) or it was the already-running timer this exact tap just completed — the page renders `components/DoneScreen.tsx`: the same full-screen layout as `TimerScreen.tsx`'s own completion state (icon, name, big centered circle), just static instead of a running countdown, with a checkmark instead of a timer. If instead the tap just *started* a timer (or completed a *different* item as a Case 3 jump side effect — see the case breakdown in [`api/external-api.md`](../api/external-api.md)), the tapped item isn't "done" yet, so the page falls through to a plain `redirect("/routines")` where the running timer is visible instead.

If the tag belongs to a different user, the page shows a generic "already linked to another account" message without revealing which item/user.

## Manage Habit UI

`components/RoutineEditView.tsx`'s `SortableRow` inline edit panel shows current link status per item (fetched server-side by `app/(app)/routines/[groupId]/edit/page.tsx`, which loads `NfcTag.find({ routineItemId: { $in: itemIds } })` alongside the items — no client round-trip) and a Link/Unlink action. Unlinking (`DELETE /api/nfc-tags/[tagCode]`) clears the tag back to unclaimed so it can be linked to something else.

## Auth redirect preservation

`/nfc/[tagCode]` isn't in `middleware.ts`'s `PUBLIC_PAGE_PATHS`, so a logged-out tap gets redirected to `/login?callbackUrl=/nfc/<tagCode>` — `app/login/page.tsx` reads that param and passes it as `signIn`'s `redirectTo`, falling back to `/welcome` when absent (its previous, only, behavior). Skipping the `/welcome` animated-quote ritual when a tag is waiting is deliberate — the moment that matters here is starting the habit fast.

## Native setup

- `app/.well-known/apple-app-site-association/route.ts` — a route handler (not a static `public/` file) so `Content-Type: application/json` is guaranteed. Scoped to `paths: ["/nfc/*"]` only, not the whole site.
- `ios/App/App/App.entitlements` — `com.apple.developer.associated-domains: ["applinks:be-one-nu.vercel.app"]`, wired into both Debug/Release via `CODE_SIGN_ENTITLEMENTS` in `ios/App/App.xcodeproj/project.pbxproj`.
- **Actually navigating the WebView needed a real fix, not "just works."** `SceneDelegate.swift` forwards `scene(_:continue:)` (the Universal Link continuation entry point) to Capacitor's own `CAPSceneDelegateProxy` — but that proxy only *broadcasts a native notification* (`capacitorOpenUniversalLink`); it never touches the WebView itself. With nothing listening for it, a tag tap correctly opened the app (Universal Link matching worked) but left the WebView on whatever page it was already showing, never actually reaching `/nfc/<tagCode>` — confirmed the hard way: an early real-device test tapping a claimed "shower" tag just landed on the normal Routines view, and the habit only got logged because a manual back-entry was made afterward, not because the tap did anything. Fixed by installing `@capacitor/app` (its native side listens for that notification and forwards it to JS as the `appUrlOpen` event) and adding `components/UniversalLinkHandler.tsx` — mounted in `app/layout.tsx`, guarded by `Capacitor.isNativePlatform()` so it's a no-op on the plain web/PWA — which listens for `appUrlOpen` and does `window.location.href = <tapped path>` to actually load `/nfc/<tagCode>`. This needed both a web deploy (the listener is part of the live Next.js app, same as everything else in server-URL mode) and a native rebuild (the new plugin's Swift bridge has to be compiled into the app binary; a live-reloaded web deploy alone isn't enough).

**Constraint (resolved):** Associated Domains requires a **paid** Apple Developer Program membership — free Personal Team accounts are blocked from this capability entirely (`xcodebuild` fails with "Personal development teams... do not support the Associated Domains capability"). Boston's enrollment cleared and upgraded his existing team in place (same Team ID, `X3DPK5Y29G` — Apple didn't issue a new one for an individual enrollment), so device builds with the entitlement now succeed; confirmed via `codesign -d --entitlements :- App.app`, not just a clean `xcodebuild` exit. If the app is ever re-signed under a different team (e.g. an organization account later), both `ios/App/App.xcodeproj`'s `DEVELOPMENT_TEAM` and the AASA route's `appID` need updating together, or Universal Links silently stop matching.

**Domain permanence:** tags carry `be-one-nu.vercel.app` baked into their URL permanently once written. If the production domain ever changes, previously-manufactured tags degrade to opening a webpage in Safari instead of the app directly (Universal Link matching happens on the tapped host before any redirect is followed) — still functional, just not the native-app-launch experience.

**Apple's CDN cache lags the origin.** iOS doesn't fetch a domain's AASA file directly at tap time — it relies on `app-site-association.cdn-apple.com`'s own cached copy, fetched asynchronously and independent of the origin's own cache headers. After the `appID` fix above (switching `T3NRTCA735` → `X3DPK5Y29G`), the origin (`curl https://be-one-nu.vercel.app/.well-known/apple-app-site-association`) updated immediately, but Apple's CDN (`curl https://app-site-association.cdn-apple.com/a/v1/be-one-nu.vercel.app`) kept serving the stale value for a while afterward, and flapped between old/new values across different requests (multiple edge nodes refreshing independently) before settling — Apple's own guidance is this can take anywhere from minutes to ~24 hours. There's no way to force-flush it. If Universal Links ever need re-diagnosing, check both URLs — a mismatch between them means it's purely propagation lag, not a bug. Once Apple's CDN is confirmed correct, the **device** may still need a fresh app reinstall (uninstall + install, not just relaunch) to re-run its own domain validation — iOS validates primarily at install time, not on every tap, so a device can keep failing after the CDN has already caught up.

**The OS confirmation prompt is not optional or app-controllable.** A background NFC tag read never silently opens the app — iOS always shows its own system confirmation (not our UI, not customizable in wording/icon/behavior) that the user must tap before anything happens. This is a deliberate platform security choice (any tag could otherwise silently trigger actions in any app) and applies to every app using NFC + Universal Links, not something specific to this build.

## Provisioning

`scripts/generate-nfc-tags.mjs` (one-off, manually run, not wired into app boot) bulk-generates unclaimed `NfcTag` rows and prints each one's full URL:

```
node --env-file=.env.local scripts/generate-nfc-tags.mjs [count]
```

Boston writes each printed URL to a physical tag using his own NFC writer app — this app never writes tags itself, only reads via Universal Links once tapped.

## Relationship to the external API

`lib/nfc-actions.ts`'s `triggerHabit()` is the same case-dispatch logic `POST /api/external/trigger-habit` (see [`api/external-api.md`](../api/external-api.md)) uses — extracted out so both the Shortcuts-authenticated route and this session-authenticated page share one implementation instead of two. The route stayed a thin wrapper around it (auth/param parsing + ownership checks, then `triggerHabit()`); its documented request/response shape and case behavior are unchanged.
