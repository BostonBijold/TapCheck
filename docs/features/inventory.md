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
- **`models/TaskInventoryLink.ts`** — `{ companyId, taskDefinitionId,
  itemTypeId, required: boolean }`. See "Task ↔ Inventory Linking" below.

No changes to `TaskDefinition`/`Task`/`TaskLog` themselves. Task ↔
Inventory linking is a separate join collection, not a field added to
either side — Inventory stays fully usable with zero tasks referencing it,
and a task's own completion semantics (`TaskLog`) are unaffected by whether
it happens to have linked items.

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
  /api/inventory-item-types/[id]/nfc-tag`). Managers also manage which item
  types are linked to a given task — see "Task ↔ Inventory Linking" below.

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

## Task ↔ Inventory Linking

A manager can attach one or more `InventoryItemType`s to a task, so checking
that area also captures an inventory count in the same flow — e.g. "Clean
Bathroom" links to Toilet Paper, Soap, and Paper Towels. Supersedes an
earlier yes/no-gate idea sketched (never built) in this doc's first pass —
dropped in favor of the simpler per-link required/optional model below.

**Data model**: `models/TaskInventoryLink.ts` — one join row per
`(taskDefinitionId, itemTypeId)` pair (unique index), not a bare array field
on either side, since `required` is a property of the *pairing*: the same
item type can be required on one task and optional on another. Lives at the
`TaskDefinition` level, not per `Task` placement — same reasoning as
`TaskDefinition.nfcTagUid` (see [nfc.md](nfc.md)'s "In-app scan-to-complete
binding") — a link set from one list's edit screen is shared by every list
this saved task is placed in. `lib/inventory.ts`'s
`getInventoryLinksForTaskDefinition`/`addOrUpdateInventoryLink`/
`removeInventoryLink` are the only writers/readers; both API routes below
resolve a specific `Task` placement to its `definitionId` first, same
placement-to-definition split as `app/api/tasks/[id]/nfc-tag`.

**Manager side**: a "Linked Inventory" panel on a task's inline edit row in
`TaskListEditView.tsx`'s `SortableRow`, alongside the existing
"Scan-to-Complete Tag" panel — lists current links (name + a
Required/Optional toggle pill + Unlink), plus "+ Add Item" opens
`components/LinkInventoryItemSheet.tsx`, a picker over the company's active
`InventoryItemType`s (already-linked ones excluded) fetched from the same
`GET /api/inventory-item-types` the Inventory tab itself uses. Removing a
link (`DELETE /api/tasks/[id]/inventory-links/[itemTypeId]`) only deletes
that one `TaskInventoryLink` row — the item type and its `InventoryLog`
history are completely untouched, no confirmation prompt (a low-stakes,
easily-re-added action).

**Employee side — the task form**: when a task has one or more links,
`TaskFormScreen.tsx` self-fetches them (`GET
/api/tasks/[id]/inventory-links`, same self-fetch pattern as `Header.tsx`'s
own `notificationSound` fetch — no caller needs to thread this through) and
renders one numeric count input per linked item, positioned after the
task's own fields, labeled with the item's name/unit and a `*` when
required. A required link blocks Save the same way a required field already
does (an inline error, same `setError` path); an optional link left blank
is simply skipped — no `InventoryLog` row is written for a blank optional
field, never a `count: 0`.

**Verification is shared, never duplicated** — this is the part that
depends on Part 1's multi-target NFC model, and the reason this needed its
own spec rather than a quick Part 2 addition. A task's own
`TaskDefinition.nfcTagUid` and a linked `InventoryItemType.nfcTagUid` are
independent bindings that may or may not point at the *same* physical tag:

- **Same tag on both** (the common case — e.g. the bathroom's tag bound to
  both "Clean Bathroom" and "Toilet Paper"): one scan satisfies both.
  Whichever UID verified the task's own completion (either
  `TaskFormScreen.tsx`'s in-form Scan NFC step, or a `preVerifiedNfcUid`
  carried in from the FAB's scan-in) is compared against each linked item's
  own `nfcTagUid`; a match shows "Tag verified" under that item's field and
  the resulting `InventoryLog` row gets that same `verifiedNfcUid`. No
  second scan, ever — `TaskFormScreen.tsx`'s `buildInventoryCounts` is the
  one place this comparison happens, client-side.
- **Different tags, or no tag on the item**: the task's own verification
  (if it has a tag) is completely unaffected. A linked item with a
  *different* tag, or no tag at all, just gets a plain manual-entry count
  (`verifiedNfcUid: null`) — this flow never initiates a second scan purely
  for a linked item's sake.
- **The server re-checks anyway**: `PATCH /api/task-logs` accepts an
  `inventoryCounts: Array<{ itemTypeId, count, verifiedNfcUid? }>` body
  field (only meaningful with `state: "done"`, same as `formData`), and
  `lib/inventory.ts`'s `writeInventoryLogsForTaskCompletion` — called right
  after the `TaskLog` write succeeds — drops any `itemTypeId` not actually
  linked to this task (defensive; the client only ever sends its own
  fetched links, but a client claim is never trusted outright) and
  re-validates each `verifiedNfcUid` against that item's own bound tag, same
  as `POST /api/inventory-logs` does directly. A UID that verified the
  *task* but doesn't match the *item's* own tag is never stored as
  verified — the two are separate claims that happen to reuse one scan when
  the bindings line up. There's no server-side "required" enforcement
  (same as `formData`'s own fields — trusted as sent), only the client-side
  gate in `TaskFormScreen.tsx`.
- **Where this write happens**: only `PATCH /api/task-logs`'s
  `completeInProgressLog` success path — the one path `TaskFormScreen.tsx`'s
  Save action actually reaches (both `TasksView.tsx`'s standalone
  `handleTaskFormComplete` and `TaskListSessionView.tsx`'s
  `saveLog`/`advance`/`handleTaskFormDone` chain funnel into this same PATCH
  call). The route's other "done" branch (manual time-edit / back-entry via
  `startedAt`+`completedAt` overrides) has no UI that ever produces
  `inventoryCounts`, so it's not wired there.
- **Offline**: no special-case code needed. `inventoryCounts` just rides
  along inside the same JSON body `lib/offline-sync.ts`'s
  `queueTaskLogMutation`/`flushQueue` already queues and replays verbatim —
  see [offline.md](offline.md). It only actually reaches the server (and
  writes `InventoryLog` rows) once the queue flushes online; nothing in the
  offline SQLite cache mirrors Inventory data in the meantime, so a
  just-logged count via a linked task isn't reflected in the Inventory tab
  until sync completes.

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
| `/api/tasks/[id]/inventory-links` | GET | any company user | this task's linked item types, joined with name/unit/nfcTagUid/required |
| `/api/tasks/[id]/inventory-links` | POST | manager | link an item type (or update `required` on an existing link — upsert) |
| `/api/tasks/[id]/inventory-links/[itemTypeId]` | PATCH | manager | toggle `required` |
| `/api/tasks/[id]/inventory-links/[itemTypeId]` | DELETE | manager | unlink |

## Deferred / open questions

- **Par-level alerting** — `parLevel` is stored but nothing notifies or
  badges when a logged count drops below it. A fast-follow once push
  notifications (already on the roadmap separately) exist; out of scope
  here.
- **CSV export / Reports integration** — Inventory history does not show up
  anywhere in the Reports tab. Left fully separate for now given how new
  both features are; revisit once Inventory has real usage data.
- **Multiple item types sharing one tag** — supported by construction (it's
  just another entry in Part 1's resolution list, same as the "Ice Packs" /
  "Meat Inventory Count" example in [nfc.md](nfc.md)'s "Multi-target
  binding"), not specially built for.
- **Does an `InventoryLog` need to record it came from a linked task** (vs.
  the Inventory tab directly)? Not modeled — `verifiedNfcUid` aside, nothing
  distinguishes a task-linked write from a direct one; a count is a count
  regardless of source. Revisit if the Reports "Logs" sub-tab or Inventory's
  own history view ever wants to show "via Clean Bathroom task" as context.
- **Order of the inventory fields relative to the task's own fields** —
  currently fixed as "after," matching the natural reading order of "do the
  task, then note what you noticed while you were there." No mechanism to
  configure this per task.
