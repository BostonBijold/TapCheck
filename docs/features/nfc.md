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

Tapping an already-claimed tag opens the same page; since `tag.userId` now matches the session, it calls `triggerHabit()` (`lib/nfc-actions.ts`) — the same bidirectional start/complete case logic `trigger-habit` uses (see below) — then redirects to `/routines`, which already shows in-progress timer state.

If the tag belongs to a different user, the page shows a generic "already linked to another account" message without revealing which item/user.

## Manage Habit UI

`components/RoutineEditView.tsx`'s `SortableRow` inline edit panel shows current link status per item (fetched server-side by `app/(app)/routines/[groupId]/edit/page.tsx`, which loads `NfcTag.find({ routineItemId: { $in: itemIds } })` alongside the items — no client round-trip) and a Link/Unlink action. Unlinking (`DELETE /api/nfc-tags/[tagCode]`) clears the tag back to unclaimed so it can be linked to something else.

## Auth redirect preservation

`/nfc/[tagCode]` isn't in `middleware.ts`'s `PUBLIC_PAGE_PATHS`, so a logged-out tap gets redirected to `/login?callbackUrl=/nfc/<tagCode>` — `app/login/page.tsx` reads that param and passes it as `signIn`'s `redirectTo`, falling back to `/welcome` when absent (its previous, only, behavior). Skipping the `/welcome` animated-quote ritual when a tag is waiting is deliberate — the moment that matters here is starting the habit fast.

## Native setup

- `app/.well-known/apple-app-site-association/route.ts` — a route handler (not a static `public/` file) so `Content-Type: application/json` is guaranteed. Scoped to `paths: ["/nfc/*"]` only, not the whole site.
- `ios/App/App/App.entitlements` — `com.apple.developer.associated-domains: ["applinks:be-one-nu.vercel.app"]`, wired into both Debug/Release via `CODE_SIGN_ENTITLEMENTS` in `ios/App/App.xcodeproj/project.pbxproj`.
- `SceneDelegate.swift` needed no changes — it already forwards `scene(_:continue:)` (the Universal Link continuation entry point) to Capacitor's own `SceneDelegateProxy`, which routes the link into the existing WKWebView/session automatically once Associated Domains is configured.

**Known constraint:** Associated Domains requires a **paid** Apple Developer Program membership — free Personal Team accounts are blocked from this capability entirely (`xcodebuild` fails with "Personal development teams... do not support the Associated Domains capability"). Until enrollment clears, physical-device rebuilds fail with the entitlement present; Simulator builds are unaffected. The AASA file's `appID` team ID also needs updating to match whatever team ends up signing TestFlight/App Store builds, if different from the Personal Team used during initial local development.

**Domain permanence:** tags carry `be-one-nu.vercel.app` baked into their URL permanently once written. If the production domain ever changes, previously-manufactured tags degrade to opening a webpage in Safari instead of the app directly (Universal Link matching happens on the tapped host before any redirect is followed) — still functional, just not the native-app-launch experience.

## Provisioning

`scripts/generate-nfc-tags.mjs` (one-off, manually run, not wired into app boot) bulk-generates unclaimed `NfcTag` rows and prints each one's full URL:

```
node --env-file=.env.local scripts/generate-nfc-tags.mjs [count]
```

Boston writes each printed URL to a physical tag using his own NFC writer app — this app never writes tags itself, only reads via Universal Links once tapped.

## Relationship to the external API

`lib/nfc-actions.ts`'s `triggerHabit()` is the same case-dispatch logic `POST /api/external/trigger-habit` (see [`api/external-api.md`](../api/external-api.md)) uses — extracted out so both the Shortcuts-authenticated route and this session-authenticated page share one implementation instead of two. The route stayed a thin wrapper around it (auth/param parsing + ownership checks, then `triggerHabit()`); its documented request/response shape and case behavior are unchanged.
