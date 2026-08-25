> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# NFC Tap-to-Start Habits

Physical NFC tags, pre-manufactured with a generic branded URL and sold/handed to a user, that a user then links to one of their own habits inside the app. Two supported paths turn a tap into the same start/complete/advance logic, sharing it via one underlying implementation — see [Relationship to the external API](#relationship-to-the-external-api) below:

- **Universal Links** (this document, below) — tapping the tag opens `/nfc/<tagCode>` directly in the native app (not a browser). Zero setup beyond linking the tag once in-app, works for any tag, but a tap always surfaces iOS's own unskippable confirmation prompt (see [Native setup](#native-setup) below) and needs the phone unlocked with the app reachable.
- **Shortcuts-driven silent triggers** (see [Setting up silent tap triggers](#setting-up-silent-tap-triggers) below) — a tiny, per-card Shortcut paired with an NFC Automation fires the identical logic with no confirmation card, no app-open requirement, and the phone locked. Needs a one-time, ~30-second manual Shortcut build plus one Automation per physical card, but is the faster everyday path once set up — an actively maintained fast path, not a legacy fallback.

## Why Universal Links, not a plain web link

A tag just encodes a static URL — `https://be-one-nu.vercel.app/nfc/<tagCode>` — since NFC hardware has no way to carry a custom HTTP method or body. Opening that URL needs to land in the native app, not Safari, so the tap-to-open mechanism is Apple's **Universal Links**: the domain publishes an `apple-app-site-association` file and the app declares the `com.apple.developer.associated-domains` entitlement for it; iOS then routes a tap on that URL straight into the app instead of a browser, with no custom in-app NFC-reading code required for this direction (see [Native setup](#native-setup)).

## Data model

- `models/NfcTag.ts` — `{ tagCode (unique), userId | null, routineItemId | null, routineGroupId | null, claimedAt | null }`. A separate collection from `RoutineItem` (not a field on it) so one habit can have multiple tags pointing at it — e.g. a tag by the shower and one by the gym bag, both starting the same routine. `tagCode` is generated ahead of time, before any user owns the tag — see [Provisioning](#provisioning).
- `models/PendingNfcLink.ts` — `{ userId (unique), routineItemId, armedAt }`. One per user; supports the "arm, then tap" linking flow below. Treated as stale and ignored if `armedAt` is more than ~5 minutes old at read time (checked inline in `app/nfc/[tagCode]/page.tsx`, no TTL index).

## Linking flow — "arm, then tap"

No native NFC scanning code is used for linking, only for the everyday trigger (both of which are actually the same Universal Link mechanism — reading is never done in-app):

1. In Manage Habit (`components/RoutineEditView.tsx`'s per-item inline edit panel), the user taps **Link NFC Tag** → `POST /api/nfc-tags` upserts a `PendingNfcLink` for that item.
2. The user physically taps an unclaimed tag against the phone → Universal Links opens `/nfc/<tagCode>` directly in-app.
3. `app/nfc/[tagCode]/page.tsx` finds a fresh `PendingNfcLink` for the signed-in user, claims the tag (sets `userId`/`routineItemId`/`routineGroupId`/`claimedAt`), deletes the pending link, and renders `components/TagLinkedSetup.tsx` (see [Setting up silent tap triggers](#setting-up-silent-tap-triggers) below).

If a tag is tapped cold (unclaimed, nothing armed), the page instead renders a picker of the user's active routine items (`components/ClaimTagPicker.tsx`), posting to `POST /api/nfc-tags/[tagCode]` to claim on selection — on success this also renders `TagLinkedSetup` inline, entirely client-side (no page reload), rather than falling through to the trigger flow below.

## Trigger flow

Tapping an already-claimed tag opens the same page; since `tag.userId` now matches the session, it calls `triggerHabit()` (`lib/nfc-actions.ts`) — the same bidirectional start/complete case logic `trigger-habit` uses (see below). If that call left the *tapped* item itself in a terminal `done` state — either it's a mark-and-done type (checkbox/virtue_checkin/weekly_review, always immediate) or it was the already-running timer this exact tap just completed — the page renders `components/DoneScreen.tsx`: the same full-screen layout as `TimerScreen.tsx`'s own completion state (icon, name, big centered circle), just static instead of a running countdown, with a checkmark instead of a timer. If instead the tap just *started* a timer (or completed a *different* item as a Case 3 jump side effect — see the case breakdown in [`api/external-api.md`](../api/external-api.md)), the tapped item isn't "done" yet, so the page falls through to a plain `redirect("/routines")` where the running timer is visible instead.

If the tag belongs to a different user, the page shows a generic "already linked to another account" message without revealing which item/user.

## Setting up silent tap triggers

Universal Links' unskippable OS confirmation prompt is a hard platform constraint on any Universal-Link-driven NFC tap, not something this app's build can suppress — so the fast, silent, phone-locked everyday path instead goes through the Shortcuts app, which iOS lets an NFC Automation fire without asking.

**There is no single shared Shortcut — each physical card gets its own.** An earlier design tried a single generic Shortcut, imported once, that would read the tapped tag's URL at runtime via "Get Details of NFC Tag" and resolve which card fired it. That doesn't work: **an NFC Automation triggers off a tag's physical UID only — it never forwards the tag's NDEF content (the URL/`tagCode`) to the Shortcut it runs.** A Shortcut invoked silently by an Automation has no tag data available to read at all, so it has no way to know which card was just tapped. Auto-generating and serving a ready-to-download, pre-filled `.shortcut` file per card was also considered as a fix, but since iOS 15 a `.shortcut` file must be cryptographically signed before Shortcuts will import it, and that signing can only be done via Apple's `shortcuts sign` CLI — macOS-only, no serverless/Linux path, no public API for minting an iCloud share link either. Doing that "for real" would mean standing up a dedicated macOS signing service — real, ongoing infrastructure built on reverse-engineered, unofficial behavior — not worth it for this feature.

The actual flow instead bakes each card's exact trigger URL directly into a tiny Shortcut the user builds themselves, right after linking that card — no runtime resolution, no import/signing step at all, since authoring a *new* Shortcut on your own device never requires a signature (signing only matters when *importing* someone else's exported file):

1. Right after a tag is claimed to a habit — either the "arm, then tap" auto-claim branch or the cold-tap `ClaimTagPicker` selection in `app/nfc/[tagCode]/page.tsx` — the page renders `components/TagLinkedSetup.tsx`. It fetches the user's API key (`GET /api/user/api-key`, same call `components/ProfileView.tsx` already makes) and displays that card's exact, fully-formed trigger URL: `` `${origin}/api/external/nfc/<tagCode>?apiKey=<key>` ``, with a copy button, plus a "Copy Setup Instructions" button for the full text blob.
2. The user builds a 2-action Shortcut once for that card: `Text` (paste the copied URL) → `Get Contents of URL` (GET, no further config).
3. The user creates one NFC Automation for that physical card (Automation → + → NFC → scan card → Run Shortcut → pick the Shortcut just built → turn off "Ask Before Running" and "Notify When Run").

Tapping the card afterward fires the Automation directly — no app-open, no OS confirmation card, works with the phone locked — which calls [`GET /api/external/nfc/[tagCode]`](../api/external-api.md) with the baked-in `tagCode` and API key. The route resolves `tagCode` to whichever habit is *currently* linked (re-resolved at request time, not at Shortcut-build time) and calls the same `triggerHabit()` this page's own Universal Link flow uses — so relinking a card to a different habit in-app (see [Manage Habit UI](#manage-habit-ui) below) takes effect on the very next tap with zero changes to that card's Shortcut or Automation.

**Accepted tradeoff:** the same long-lived, full-access API key already shown on the Profile page ends up copy-pasted in plaintext into every card's Shortcut (readable if that Shortcut is ever exported/shared). This isn't a new exposure class versus the existing single-key model used elsewhere in [`api/external-api.md`](../api/external-api.md) — just now duplicated per card instead of kept in one place. Scoping to short-lived, per-card tokens would reduce blast radius but is a separate, larger change not taken on here.

### Why not an in-app NFC listener instead

Reading the tag directly from within this app's own code (Core NFC) was considered and ruled out: a Core NFC reader session cannot survive the app backgrounding or the screen locking — it's torn down immediately — and even while the app stays foregrounded, iOS caps a single session at 60 seconds. There's no way to keep a listener armed silently the way a Shortcuts Automation can, so an in-app listener could only ever work with the app already open in the foreground at the moment of the tap — a materially worse experience than either path above, and not pursued further.

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

`lib/nfc-actions.ts`'s `triggerHabit()` is the same case-dispatch logic every API-key-authenticated external route uses — `POST /api/external/trigger-habit` (caller supplies `routineItemId` directly) and `GET /api/external/nfc/[tagCode]` (caller supplies a `tagCode`, resolved to a `routineItemId` server-side on every call — see [Setting up silent tap triggers](#setting-up-silent-tap-triggers) above) — see [`api/external-api.md`](../api/external-api.md). Extracted out so every Shortcuts-authenticated route and this session-authenticated page share one implementation instead of three. Each route stays a thin wrapper around it (auth/param parsing + ownership checks, then `triggerHabit()`); documented request/response shapes and case behavior are unchanged by that sharing.
