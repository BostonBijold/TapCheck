> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# NFC Tags

Maps a physical NFC tag's arbitrary UID (chosen when writing the tag externally via a tool like NFC Tools) to a `RoutineItem`, and resolves a tap into the same start/close toggle [`external-api.md`](external-api.md)'s `trigger-habit` endpoint uses. Unlike `trigger-habit`, which requires an iPhone Shortcut and a per-tag API key, a tag written for this feature only ever encodes a stable app URL — `https://<host>/nfc/t/<tagUID>` — so it works from any NFC-capable phone in a normal logged-in browser/PWA session, and reassigning a tag to a different habit later is a database update, never a re-tap-to-write.

## `NfcTag` model (`models/NfcTag.ts`)

```ts
{
  userId: string;
  tagUID: string;                          // arbitrary, chosen when writing the physical tag — e.g. "desk-01"
  routineItemId: ObjectId | null;
  groupId: ObjectId | null;                // optional session anchor, same meaning as trigger-habit's routineGroupId
  label: string | null;
  createdAt, updatedAt;
}
```

Unique compound index on `{ userId, tagUID }` — one row per physical tag per user.

## Session-authenticated routes

Ordinary app auth (`auth()`, same `SKIP_AUTH`/`dev-local-user` fallback as every other session-authenticated route) — not the API-key mechanism `external-api.md` uses, since these are only ever called from inside the logged-in app.

### `GET /api/nfc-tags`

Lists this user's tags, each with the linked item's `name`/`icon` populated. Accepts `?routineItemId=<id>` to filter to the tag(s) linked to one item — used by the habit edit panel to show whether an item already has a tag.

### `POST /api/nfc-tags`

Body: `{ tagUID, routineItemId?, groupId?, label? }`. **Explicit create-or-reassign** — upserts on `{userId, tagUID}` with `$set`, so calling this on an already-linked tag deliberately overwrites its assignment. This is the call the habit edit panel's "Link NFC tag" button makes (see [`features/nfc.md`](../features/nfc.md)).

Validation, same as `trigger-habit`'s: if `routineItemId` given, it must exist, belong to this user, and be `isActive: true` (`404` otherwise); if `groupId` also given, the item's `groupId` must match it (`400` otherwise).

### `DELETE /api/nfc-tags/[id]`

Hard delete (unlink). A future tap of the same physical tag's URL just re-registers it as unassigned — see below.

There is no `POST /api/nfc-tags/register` route. The tap-triggered, idempotent upsert (never overwrites an existing assignment — `$setOnInsert` only) happens as a direct Mongoose call inside the resolve page itself, not a separate HTTP endpoint, the same way every other page under `app/(app)/` fetches its own data server-side rather than round-tripping through an internal `fetch`.

## Resolve page — `app/(app)/nfc/t/[tagUID]/page.tsx`

The literal URL written to the physical tag. Session-authenticated server component (redirects to `/login` if not signed in — same as every other page under `app/(app)/`, this route gets no auth from the route group layout itself).

1. Upserts the tag idempotently (`$setOnInsert`) so a first tap of a brand-new UID creates its row without needing a separate register step, and a later tap never clobbers an existing assignment.
2. **`routineItemId` is null** (never linked, or a typo'd UID) → renders "This tag isn't linked to a habit yet — open the habit in Manage Routines and tap Link NFC tag" with the tapped `tagUID` shown for reference. No in-page picker — linking only happens from the habit's own edit panel (see [`features/nfc.md`](../features/nfc.md)).
3. **Linked item is missing or soft-deleted** (`isActive: false`) → self-heals by clearing `routineItemId`/`groupId` on the tag, then shows the same "not linked" message as above.
4. **Otherwise** → calls `toggleRoutineItemLog(userId, item, today, tag.groupId)` (`lib/routine-log-actions.ts`, shared with `trigger-habit` — see [`external-api.md`](external-api.md#post-apiexternaltrigger-habit) for the full case breakdown):
   - `alreadyDone` → renders "Already completed today" inline.
   - `started` present (fresh start, resume, jump, or the auto-advance-to-next-item that follows a close inside a group) → redirects to `/routines?resumeTimer=1`, which reuses `RoutinesView`'s existing `autoResumeTimer` effect to open the right screen (standalone timer or `RoutineSession`, based on whether the log carries a `sessionGroupId`) — no NFC-specific client code needed.
   - Only `completed` present → redirects to plain `/routines`.

## Consumed by

[`features/nfc.md`](../features/nfc.md) — the user-facing linking/tapping flow.
