> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Inventory

A top-up count tracker, not a decrement ledger. Its own bottom-nav tab (5th
slot, after Reports) — see CLAUDE.md's "Bottom nav" section.

## Why not decrement-on-task-completion

Considered and rejected. "Clean bathroom" doesn't reliably mean "minus 4
rolls of toilet paper" — the relationship between a task and inventory
consumption isn't consistent or automatable in a way that stays
trustworthy. A count that's wrong because it drifted out of sync with
reality is worse than no count at all. Top-up (someone looks, someone types
the number they see) keeps the data honest at the cost of needing a human
to actually check. Nothing in this codebase writes an `InventoryLog` as a
side effect of a `TaskLog` write — the two collections are completely
independent, and there is no field on `Task`/`TaskDefinition`/`TaskLog`
that references Inventory at all.

## Data model

- **`models/InventoryItemType.ts`** — `{ companyId, name, unit | null,
  parLevel | null, nfcTagUid | null, createdByUserId, isActive }`. The
  manager-defined catalog entry ("Toilet Paper," "Cases of Meat"). `unit` is
  a free-text display label ("rolls," "cases," "lbs") shown next to a count
  — display only, never used in a calculation. `parLevel` is stored but
  purely informational in this pass — see "Deferred" below. `isActive` is
  the soft-delete/archive flag, same convention as `TaskDefinition.isActive`
  — the spec that introduced this model floated a timestamp-based
  `archivedAt` field instead, but `isActive: bool` was chosen to stay
  consistent with every other soft-delete in this codebase
  (`TaskList.isActive`, `Task.isActive`, `TaskDefinition.isActive`), not to
  introduce a second archival convention for one model.
- **`models/InventoryLog.ts`** — `{ companyId, itemTypeId, count,
  loggedByUserId, loggedAt, verifiedNfcUid | null }`. One row per count
  entry — append-only, never edited in place, same "never mutate a past
  row" convention as `TaskLog`: a correction (including a manager fixing
  someone else's fat-fingered entry — there is no special manager-only edit
  path, since append-only already makes "log the right number" the
  correction) is just a new row with the right number. The "current count"
  shown anywhere in the UI is simply the most recent `InventoryLog` row for
  a given `itemTypeId` (highest `loggedAt`) — nothing computes or derives it
  any other way. `lib/inventory.ts`'s `getLatestInventoryLogs` is the one
  place that "most recent per item type" batch join lives (the Inventory
  tab's list view); a single item's detail screen just asks for that item's
  logs sorted newest-first and takes `logs[0]`.

No `TaskDefinition` changes and no field on `Task`/`TaskLog` — deliberately
kept as its own parallel system rather than folding into task completion
semantics. The one exception on the table (not yet built) is the optional
task-integration logic-gate described under "Deferred" below.

## Roles

- **Employees**: view current counts for every active item type. Can log a
  new count for any item type — whether or not it has a bound tag, manual
  entry is always available (`POST /api/inventory-logs`, open to any
  signed-in company user, not manager-gated).
- **Managers**: everything employees can do, plus create item types (`POST
  /api/inventory-item-types`), edit name/unit/parLevel (`PATCH
  /api/inventory-item-types/[id]`), archive one (`DELETE
  /api/inventory-item-types/[id]` — soft delete, no "still referenced"
  block the way `TaskDefinition` has, since an item type has no placement
  concept to check and its `InventoryLog` history stays valid/readable once
  archived), and bind/unbind an NFC tag (`POST`/`DELETE
  /api/inventory-item-types/[id]/nfc-tag`).

## NFC binding — uses Part 1's multi-target model directly

An `InventoryItemType.nfcTagUid` binds to a **storage location**, not
exclusively to that one item type's count — the same physical tag can (and
often will) also be bound to a `TaskDefinition` at the same location (e.g.
the walk-in freezer's tag backing both "Log Freezer Temperature" and "Meat
Inventory Count"). That cross-type sharing is the entire reason the
multi-target NFC model exists — see `docs/features/nfc.md`'s "Multi-target
binding" for the full mechanism (resolution, disambiguation, the
`alsoBoundTo` binding-UI warning). This doc only covers what's
Inventory-specific:

- **Binding never gates logging a count.** Unlike a bound `TaskDefinition`
  (which requires a matching Scan NFC to complete — see
  `docs/features/nfc.md`'s `assertNfcVerified`), there is no Inventory
  equivalent of that server-side enforcement. `POST /api/inventory-logs`
  accepts an optional `verifiedNfcUid`; it's stored on the new
  `InventoryLog` row **only when it actually matches** the item type's own
  bound `nfcTagUid` — a stray or mismatched value is silently dropped
  (never stored as verified), and the log still saves either way. Manual
  entry must always work, tag or no tag, match or no match.
- **From inside the item's own log-count screen** ("Save via NFC" on
  `components/InventoryItemDetailView.tsx`): unambiguous, same pattern as
  `TaskFormScreen.tsx`'s Scan NFC step — checks the scan against that item
  type's own `nfcTagUid` and nothing else. A mismatch shows an inline error
  but the plain "Save" button (no scan) is never blocked by it.
- **From the FAB's blind scan** (`components/BottomNav.tsx`): goes through
  `GET /api/tasks/by-nfc-uid`'s combined `TaskDefinition` +
  `InventoryItemType` resolution. A single match resolves directly to `{
  mode: "inventory", itemTypeId }` — there's no session/lock/already-logged
  branching the way a task has (`resolveFabScanTarget`'s four-way split
  doesn't apply here: an append-only inventory count has no per-day
  terminal state to check), so the FAB just navigates to
  `/inventory/<itemTypeId>?verifiedNfcUid=<uid>`. A match shared with one or
  more other targets (another item type, a task, or both) surfaces Part 1's
  disambiguation picker instead; picking "Meat Inventory Count" lands here
  the same way, pre-verified, no second scan.
- **`preVerifiedNfcUid`** (the query param above) is read once by
  `app/(app)/inventory/[itemTypeId]/page.tsx` and passed to
  `InventoryItemDetailView.tsx`. If it matches the item's own `nfcTagUid`,
  the Save button treats the *next* save as pre-verified — same one-save
  pattern as `TaskFormScreen.tsx`'s `preVerifiedNfcUid`/`alreadyVerified`,
  except there's no shared multi-task `preVerified` state to clear
  afterward: this page is a fresh mount per scan (the FAB always does a
  full navigation here, never a same-page prop swap), so there's nothing
  left over to leak onto a later, unrelated save.

## UI structure

- **Inventory tab (list view)** — `components/InventoryView.tsx`, fetched
  from `GET /api/inventory-item-types`. Every active item type: name,
  current count + unit, and how recently it was logged ("Logged 2h ago by
  Maria" / "Not yet logged"). Tapping a row opens
  `/inventory/<itemTypeId>`. Managers see a "+ Add Item Type" button at the
  bottom (`components/AddInventoryItemTypeSheet.tsx` — name/unit/parLevel
  only; NFC binding is a separate step once the item exists, same
  create-then-bind flow as the task catalog).
- **Item detail/log screen** — `components/InventoryItemDetailView.tsx`
  (`app/(app)/inventory/[itemTypeId]/page.tsx`). Current count prominent at
  top, a numeric input + "Save" (always works) and, when the item has a
  bound tag, a second "Save via NFC" button next to it, then a recent-
  history list (`GET /api/inventory-logs?itemTypeId=&limit=`, newest first
  — each row shows count/who/when, with a small NFC glyph on any row whose
  `verifiedNfcUid` is set). A collapsible manager-only section below holds
  name/unit/parLevel editing (`PATCH /api/inventory-item-types/[id]`), the
  "Location Tag" bind/unbind panel (same "Scan to Link"/"Unbind"/"Also
  bound to" pattern as `TaskListEditView.tsx`'s Scan-to-Complete panel), and
  "Archive Item Type."

## API routes

| Route | Method | Gate | Purpose |
|---|---|---|---|
| `/api/inventory-item-types` | GET | any company user | list, joined with each item's latest log |
| `/api/inventory-item-types` | POST | manager | create |
| `/api/inventory-item-types/[id]` | GET | any company user | single item (detail page's server fetch) |
| `/api/inventory-item-types/[id]` | PATCH | manager | edit name/unit/parLevel |
| `/api/inventory-item-types/[id]` | DELETE | manager | archive (soft delete) |
| `/api/inventory-item-types/[id]/nfc-tag` | POST / DELETE | manager | bind / unbind — see `lib/inventory.ts`'s `bindInventoryNfcTag`/`unbindInventoryNfcTag` |
| `/api/inventory-logs` | GET | any company user | history for one `itemTypeId`, newest first (doubles as "current count" via `[0]`) |
| `/api/inventory-logs` | POST | any company user | log a new count (append-only) |

## Deferred / open questions

- **Par-level alerting** — `parLevel` is stored but nothing notifies or
  badges when a logged count drops below it. A fast-follow once push
  notifications (already on the roadmap separately) exist; out of scope
  here.
- **CSV export / Reports integration** — Inventory history does not show up
  anywhere in the Reports tab. Left fully separate for now given how new
  both features are; revisit once Inventory has real usage data.
- **Multiple item types sharing one tag** — supported by construction (it's
  just another entry in Part 1's resolution list — see the "Ice Packs" /
  "Meat Inventory Count" example above), not specially built for.
- **Task integration (optional logic-gate)** — a task could optionally
  prompt for an inventory count as a follow-up to a yes/no question (e.g.
  "Did you restock?" → Yes → a count field for the relevant item type,
  written as an `InventoryLog` row alongside the normal `TaskLog` write).
  **Not built.** This would touch `docs/features/task-lists.md`'s form-task
  field model and is scoped as a second, smaller spec of its own — logging
  a count directly from the Inventory tab already works regardless of
  whether any task references that item type, so nothing here blocks on it.
