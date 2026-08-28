> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# NFC Tap-to-Trigger Tasks

Physical NFC tags, pre-manufactured with a generic URL and handed out at a restaurant, that a manager then links to one of the company's tasks inside the app. Two supported paths turn a tap into the same start/complete/advance logic, sharing it via one underlying implementation — see [Relationship to the external API](#relationship-to-the-external-api) below:

- **Universal Links** (this document, below) — tapping the tag opens `/nfc/<tagCode>` directly in the native app (not a browser). Zero setup beyond linking the tag once in-app, works for any tag, but a tap always surfaces iOS's own unskippable confirmation prompt (see [Native setup](#native-setup) below) and needs the phone unlocked with the app reachable.
- **Shortcuts-driven silent triggers** (see [Setting up silent tap triggers](#setting-up-silent-tap-triggers) below) — a tiny, per-tag Shortcut paired with an NFC Automation fires the identical logic with no confirmation card, no app-open requirement, and the phone locked. Needs a one-time, ~30-second manual Shortcut build plus one Automation per physical tag, but is the faster everyday path once set up — an actively maintained fast path, not a legacy fallback.

## Why company-scoped, not user-scoped

Unlike the personal-habit-tracker app this was originally built for, TapCheck's tasks are shared restaurant configuration — any employee on shift can complete any task (`TaskLog` is keyed by `companyId+taskId+date`, not per-user). So an `NfcTag` belongs to the **company**, not to whichever person set it up:

- **Linking a tag is manager-only** (arming a pending link, claiming a cold tap, generating a silent trigger, unlinking) — configuration, gated the same way as Task List management (`role !== "manager" → 403`).
- **Triggering an already-linked tag is open to any signed-in user of that company** — same "any employee on shift" philosophy as the rest of the app. Whoever's session (in-app tap) or API key (Shortcut) fired it becomes `performedByUserId` on the resulting `TaskLog`.
- `claimedByUserId` on `NfcTag` is attribution only (who set it up), not an access restriction.

## Data model

- `models/NfcTag.ts` — `{ tagCode (unique), companyId | null, taskId | null, taskListId | null, claimedByUserId | null, claimedAt | null }`. A separate collection from `Task` (not a field on it) so one task can have multiple tags pointing at it — e.g. a tag by the walk-in fridge and one by the prep line, both logging the same "Walk-in Fridge Temp" task. `tagCode` is generated ahead of time, before any company owns the tag — see [Provisioning](#provisioning).
- `models/PendingNfcLink.ts` — `{ userId (unique), companyId, taskId, armedAt }`. One per user — supports the "arm, then tap" linking flow below. Treated as stale and ignored if `armedAt` is more than ~5 minutes old at read time (checked inline in `app/nfc/[tagCode]/page.tsx` and `app/api/external/nfc/[tagCode]/route.ts`) — no TTL index, just hygiene.

## Linking flow — "arm, then tap"

No native NFC scanning code is used for linking, only for the everyday trigger (both of which are actually the same Universal Link mechanism — reading is never done in-app). Manager-only throughout:

1. In Manage Task List (`components/TaskListEditView.tsx`'s per-task inline edit panel), a manager taps **Link a Physical Tag** → `POST /api/nfc-tags` upserts a `PendingNfcLink` for that task.
2. The manager physically taps an unclaimed tag against the phone → Universal Links opens `/nfc/<tagCode>` directly in-app.
3. `app/nfc/[tagCode]/page.tsx` finds a fresh `PendingNfcLink` for the signed-in user, claims the tag (sets `companyId`/`taskId`/`taskListId`/`claimedByUserId`/`claimedAt`), deletes the pending link, and renders `components/NfcTagLinkedSetup.tsx` (see [Setting up silent tap triggers](#setting-up-silent-tap-triggers) below).

If a tag is tapped cold (unclaimed, nothing armed) by a manager, the page instead renders a picker of the company's active tasks (`components/NfcClaimTagPicker.tsx`), posting to `POST /api/nfc-tags/[tagCode]` to claim on selection — on success this also renders `NfcTagLinkedSetup` inline, entirely client-side (no page reload), rather than falling through to the trigger flow below. A non-manager who taps a cold tag sees a plain "ask a manager to link it" message.

## Trigger flow

Tapping an already-claimed tag opens the same page; since `tag.companyId` now matches the signed-in user's company, it calls `triggerTask()` (`lib/task-trigger.ts`) directly — the same bidirectional start/complete case logic `trigger-task` uses (see below). If that call left the *tapped* task itself in a terminal `done` state — either it's a mark-and-done type (checkbox, always immediate) or it was the already-running timer this exact tap just completed — the page renders `components/NfcDoneScreen.tsx`: a static full-screen confirmation reusing `TaskCard`'s own "done" badge visual language. If instead the tap just *started* a timer (or completed a *different* task as a Case 3 jump side effect — see the case breakdown in [`api/external-api.md`](../api/external-api.md)), the tapped task isn't "done" yet, so the page falls through to a plain `redirect("/tasks")` where the running timer is visible instead.

If the tag belongs to a different company, the page shows a generic "already linked to another company" message without revealing which task/company.

## Setting up silent tap triggers

Universal Links' unskippable OS confirmation prompt is a hard platform constraint on any Universal-Link-driven NFC tap, not something this app's build can suppress — so the fast, silent, phone-locked everyday path instead goes through the Shortcuts app, which iOS lets an NFC Automation fire without asking.

**There is no single shared Shortcut — each physical tag gets its own.** An NFC Automation triggers off a tag's physical UID only — it never forwards the tag's NDEF content (the URL/`tagCode`) to the Shortcut it runs — so a single generic, runtime-resolving Shortcut isn't possible (see be-one's own history of this exact feature for the full reasoning; the same constraint applies here unchanged). The actual flow instead bakes each tag's exact trigger URL directly into a tiny Shortcut the manager builds themselves, right after linking that tag — no runtime resolution, no import/signing step at all:

1. Right after a tag is claimed to a task — either the "arm, then tap" auto-claim branch or the cold-tap `NfcClaimTagPicker` selection in `app/nfc/[tagCode]/page.tsx` — the page renders `components/NfcTagLinkedSetup.tsx`. It fetches the user's API key (`GET /api/user/api-key`, same call `components/ProfileView.tsx` already makes) and displays that tag's exact, fully-formed trigger URL: `` `${origin}/api/external/nfc/<tagCode>?apiKey=<key>` ``, with a copy button, plus a "Copy Setup Instructions" button for the full text blob.
2. The manager builds a single-action Shortcut once for that tag: `Get Contents of URL`, with the copied trigger URL pasted directly into its own URL field. Optionally, a second action — `Open URLs` pointed at `${origin}/tasks` — opens the app after the trigger fires instead of staying silent.
3. The manager creates one NFC Automation for that physical tag (Automation → + → NFC → scan tag → Run Shortcut → pick the Shortcut just built → turn off "Ask Before Running" and "Notify When Run").

Tapping the tag afterward fires the Automation directly — no app-open, no OS confirmation card, works with the phone locked — which calls [`GET /api/external/nfc/[tagCode]`](../api/external-api.md) with the baked-in `tagCode` and API key. The route resolves `tagCode` to whichever task is *currently* linked (re-resolved at request time, not at Shortcut-build time) and calls the same `triggerTask()` this page's own Universal Link flow uses — so relinking a tag to a different task in-app takes effect on the very next tap with zero changes to that tag's Shortcut or Automation.

**Accepted tradeoff:** the same long-lived, full-access API key already shown on the Profile page ends up copy-pasted in plaintext into every tag's Shortcut (readable if that Shortcut is ever exported/shared) — it belongs to whichever manager set the tag up, not the tag itself. This isn't a new exposure class versus the existing single-key model used elsewhere in [`api/external-api.md`](../api/external-api.md) — just now duplicated per tag instead of kept in one place.

### Generating a trigger without a physical tap

**`POST /api/nfc-tags/generate`** (`app/api/nfc-tags/generate/route.ts`). Given a `taskId`, it mints a fresh unique `tagCode` (same generator alphabet as `scripts/generate-nfc-tags.mjs`) and creates the `NfcTag` row already claimed — `companyId`/`taskId`/`taskListId`/`claimedByUserId`/`claimedAt` all set in one write, no `PendingNfcLink`, no physical tap, no Universal Link involved at all.

Surfaced in Manage Task List (`components/TaskListEditView.tsx`'s `SortableRow` panel, manager-only) as **"Generate Silent Trigger"**, sitting alongside **"Link a Physical Tag"** (the "arm, then tap" flow above) for a task with nothing linked yet. On success it renders the same `components/NfcTagLinkedSetup.tsx` screen the tap-based paths use. The resulting `NfcTag` row is otherwise completely ordinary: `GET /api/external/nfc/[tagCode]` can't tell (and doesn't care) whether a tag was claimed via a physical tap or generated this way.

**Setup Info, for viewing a trigger URL again later:** the same `NfcTagLinkedSetup` screen is also reachable for an *already*-linked task — the "Setup Info" button next to its "Linked · `<tagCode>`" status re-renders it inline using data already on hand plus a fresh `GET /api/user/api-key` fetch.

### Why not an in-app NFC listener instead

Reading the tag directly from within this app's own code (Core NFC) was considered and ruled out: a Core NFC reader session cannot survive the app backgrounding or the screen locking — it's torn down immediately — and even while the app stays foregrounded, iOS caps a single session at 60 seconds. There's no way to keep a listener armed silently the way a Shortcuts Automation can, so an in-app listener could only ever work with the app already open in the foreground at the moment of the tap.

## Manage Task List UI

`components/TaskListEditView.tsx`'s `SortableRow` inline edit panel shows current link status per task (loaded server-side by `app/(app)/tasks/[taskListId]/edit/page.tsx`, which queries `NfcTag.find({ companyId, taskId: { $in: taskIds } })` alongside the tasks — no client round-trip). All linking actions are manager-only (hidden for `role !== "manager"`, matching the API routes' own gate): for an unlinked task, "Link a Physical Tag" and "Generate Silent Trigger" side by side; for a linked task, "Setup Info" plus "Unlink" (`DELETE /api/nfc-tags/[tagCode]`, clears the tag back to unclaimed so it can be linked to something else).

## Auth redirect preservation

`/nfc/[tagCode]` isn't in `middleware.ts`'s `PUBLIC_PAGE_PATHS`, so a logged-out tap gets redirected to `/login?callbackUrl=/nfc/<tagCode>` — `app/login/page.tsx` already reads that param generically and passes it through as the sign-in destination.

## Native setup

- `app/.well-known/apple-app-site-association/route.ts` — a route handler (not a static `public/` file) so `Content-Type: application/json` is guaranteed. Scoped to `paths: ["/nfc/*"]` only, not the whole site. Also added to `middleware.ts`'s `PUBLIC_PAGE_PATHS` — Apple's CDN fetches this with no session cookie, so it must never redirect to `/login`.
- `ios/App/App/App.entitlements` — `com.apple.developer.associated-domains: ["applinks:tap-check.vercel.app"]`, wired into both Debug/Release via `CODE_SIGN_ENTITLEMENTS` in `ios/App/App.xcodeproj/project.pbxproj`.
- `ios/App/App/SceneDelegate.swift` forwards `scene(_:continue:)` (the Universal Link continuation entry point) and `scene(_:openURLContexts:)` to `SceneDelegateProxy.shared` (from `@capacitor/app`) — but that proxy only *broadcasts a native notification*; it never touches the WebView itself. `components/UniversalLinkHandler.tsx` — mounted in `app/layout.tsx`, guarded by `Capacitor.isNativePlatform()` so it's a no-op on the plain web/PWA — listens for the resulting `appUrlOpen` JS event and does `window.location.href = <tapped path>` to actually load `/nfc/<tagCode>`. This needs both a web deploy and a native rebuild (the new plugin behavior has to be compiled into the app binary; a live-reloaded web deploy alone isn't enough).

**Constraint:** Associated Domains requires a **paid** Apple Developer Program membership — free Personal Team accounts are blocked from this capability entirely. `ios/App/App.xcodeproj`'s `DEVELOPMENT_TEAM` (`X3DPK5Y29G`) and this AASA route's `appID` must be updated together if the app is ever re-signed under a different team, or Universal Links silently stop matching. Verify with `codesign -d --entitlements :- App.app`, not just a clean `xcodebuild` exit.

**Domain permanence:** tags carry `tap-check.vercel.app` baked into their URL permanently once written. If the production domain ever changes, previously-manufactured tags degrade to opening a webpage in Safari instead of the app directly (Universal Link matching happens on the tapped host before any redirect is followed) — still functional, just not the native-app-launch experience. Both `capacitor.config.ts`'s `server.url` and `ios/App/App/BeOneAPI.swift`'s hardcoded `baseURL` must match this domain too.

**Apple's CDN cache lags the origin.** iOS doesn't fetch a domain's AASA file directly at tap time — it relies on `app-site-association.cdn-apple.com`'s own cached copy, fetched asynchronously and independent of the origin's own cache headers. If Universal Links ever need re-diagnosing, check both `curl https://tap-check.vercel.app/.well-known/apple-app-site-association` and `curl https://app-site-association.cdn-apple.com/a/v1/tap-check.vercel.app` — a mismatch between them means it's purely propagation lag (can take anywhere from minutes to ~24 hours per Apple's own guidance), not a bug. Once Apple's CDN is confirmed correct, the **device** may still need a fresh app reinstall (uninstall + install, not just relaunch) to re-run its own domain validation.

**The OS confirmation prompt is not optional or app-controllable.** A background NFC tag read never silently opens the app — iOS always shows its own system confirmation (not our UI, not customizable in wording/icon/behavior) that the user must tap before anything happens. This is a deliberate platform security choice and applies to every app using NFC + Universal Links.

## Provisioning

`scripts/generate-nfc-tags.mjs` (one-off, manually run, not wired into app boot) bulk-generates unclaimed `NfcTag` rows and prints each one's full URL:

```
node --env-file=.env.local scripts/generate-nfc-tags.mjs [count]
```

Write each printed URL to a physical tag with an NFC writer app — this app never writes tags itself, only reads via Universal Links once tapped.

## Relationship to the external API

`GET /api/external/nfc/[tagCode]` (`app/api/external/nfc/[tagCode]/route.ts`) calls the same `triggerTask()` (`lib/task-trigger.ts`) that `POST /api/external/trigger-task` and this page both use — see [`api/external-api.md`](../api/external-api.md). Unlike `trigger-task` (caller supplies `taskId` directly), this route resolves a `tagCode` to a `taskId` server-side on every call, and is API-key-authenticated via `findSessionByApiKey` (`lib/api-key.ts`) — the same auth every other external route uses, open to any user of the company the key resolves to, not manager-restricted (only *linking* a tag is manager-only, not *triggering* one).
