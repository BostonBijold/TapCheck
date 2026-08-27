> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Quotes API

Covers the `Quote` collection: the admin authoring surface (`components/QuoteManageSheet.tsx`) and the two read paths consumed by `components/QuoteScreen.tsx` (loading-screen virtue-pinned quote, nav-button fully-random quote). `models/Quote.ts` was migrated in from a pre-existing personal `quotes` collection (`{ quote, author, genre }` shape) via `scripts/migrate-quotes.mjs`, one-off, not wired into app boot.

**Auth**: `GET /api/quotes`, `POST /api/quotes`, and `PATCH /api/quotes/[id]` are **admin-only** (`isAdmin(session?.user?.email)`, `403` otherwise) — there is no admin `SKIP_AUTH` fallback distinct from the usual one. `GET /api/quotes/random` and `GET /api/quotes/today` are session-authenticated like any other route (`401` if not, with the usual `SKIP_AUTH`-gated `dev-local-user` fallback).

## `GET /api/quotes`

**Admin-only.** Listing for the authoring tool — not paginated. Optional query filters, combinable: `?virtue=<slug>`, `?genre=<string>`, `?pinned=true|false` (`true` = `virtueDayIndex` is set, `false` = unset). Response: array of

```ts
{ _id, text, author, genre, virtue: string | null, virtueDayIndex: number | null, source: string | null, lengthTier: "short" | "medium" | "long", isActive, createdAt }
```

sorted by `createdAt` descending. `lengthTier` is never trusted from the stored field alone — falls back to `computeLengthTier(text)` (`lib/quote-selection.ts`: ≤90 chars short, ≤200 medium, else long) if unset on the document.

## `POST /api/quotes`

**Admin-only.** Body: `{ text, author, genre, virtue?, virtueDayIndex?, source? }`. `400` if `text`/`author`/`genre` (trimmed) are missing. If both `virtue` and `virtueDayIndex` are present, checks for a clash — another **active** quote already pinned to that exact `{ virtue, virtueDayIndex }` slot — `400 { error: 'That day slot is already pinned for "<virtue>"' }` if found (`virtueDayIndex` is meant to be unique per virtue, per the model comment, but this is an app-level check at write time, not a DB unique index). Always creates with `isActive: true`. `201` with the same shape as the GET response.

## `PATCH /api/quotes/[id]`

**Admin-only.** Body: any subset of `{ text, author, genre, virtue, virtueDayIndex, source, isActive }`. Passing `virtue: null`/`""` or `source: null`/`""` unsets that field (`$unset`); passing `virtueDayIndex: null` unsets the pin. The same virtue/day clash check as POST runs when the update includes both a target `virtue` and `virtueDayIndex`, excluding the document being edited (`_id: { $ne: params.id }`). `404` if the id doesn't match an existing quote. Response: the updated quote, same shape as GET.

## `GET /api/quotes/random`

Session-authenticated. No params. Returns one **fully random active quote** — no virtue filter, no date logic, genuinely random every call (`Quote.countDocuments` + a random `skip`). This is what the nav-button tap (`QuoteScreen.tsx`, `mode !== "loading"`) calls. Response: `{ quote: QuoteDTO | null }` — `null` only if there are zero active quotes in the entire collection.

## `GET /api/quotes/today`

Session-authenticated. Optional `?date=YYYY-MM-DD` — the caller's **local** date, same convention as `GET /api/routines?date=`; falls back to server UTC "today" if omitted (the same UTC-vs-local caveat noted elsewhere in these docs). This is what the loading screen (`QuoteScreen.tsx`, `mode === "loading"`) calls.

Resolution order, via `lib/quote-selection.ts`'s `getQuoteForToday(userId, date)` (never a blank screen — always falls through to a random quote rather than `null`, unlike `/random` which can return `null`):
1. Resolve the caller's selected philosophy (`resolveSelectedPhilosophyId`) and this week's live virtue (`currentVirtueOrder`, same rotation math as `features/virtues.md`). No philosophy selected, zero active virtues, or no matching `Virtue` document → falls straight to a fully random quote.
2. Compute a `virtueDayIndex` (1-28) from the date — which day within the virtue's own weekly cycle, combined with which occurrence of that cycle within the calendar year (`computeVirtueDayIndex`, 7 days × 4 occurrences for a 13-virtue cycle).
3. **Pinned override** — an active quote with that exact `{ virtue: slug, virtueDayIndex }` wins if one exists.
4. Otherwise, a **deterministic hash pick** within that virtue's full active-quote pool (`hashSeed(date + slug)` — same date+virtue always yields the same quote, no pinning required to get stable "quote of the day" behavior).
5. Empty pool for that virtue → fully random quote.

Response: `{ quote: QuoteDTO | null }` (shape below).

### `QuoteDTO`

```ts
{ _id, text, author, genre, virtue: string | null, virtueDayIndex: number | null, source: string | null, lengthTier: "short" | "medium" | "long" }
```

Same fields as the admin GET response, minus `isActive`/`createdAt` (not useful to a non-admin reader).

## Consumed by

`components/QuoteScreen.tsx` (both read routes) and `components/QuoteManageSheet.tsx` (the three admin-only routes). Not currently referenced from any feature doc — added directly here since Quotes has no dedicated `features/*.md` file yet, unlike Todos/Analytics.
