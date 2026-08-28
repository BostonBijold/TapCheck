> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Habits API

Covers the habit-template catalog — the data consumed by [habits.md](../features/habits.md). Adding an item to a habit group, and logging a habit's daily state, both go through the shared endpoints documented in [routines-api.md](routines-api.md) (`/api/routine-items`, `/api/routine-logs`) — not duplicated here. This includes `scheduledDays`/`successThreshold` and `formFields` (routines-api.md's Routine Items section) — habit items are `RoutineItem`s in a `timeOfDay: "habit"` group, same collection, same fields, same clamping behavior, nothing habit-specific about them.

**Auth**: same pattern as routines-api.md — NextAuth session, with a `SKIP_AUTH`-gated dev fallback, `401` otherwise.

`GET /api/habits` (a legacy quick-log listing for a since-removed FAB sheet) has been deleted along with its only caller — logging a check's daily state goes through `/api/routine-logs` (routines-api.md), not a habit-specific endpoint.

## `GET /api/habit-templates?groupId=…`

Returns the browsable catalog for `AddHabitSheet`: system-seeded templates (`isSystem: true`, visible to everyone) plus this user's own custom templates (`isSystem: false, createdBy: userId`), **excluding** any template already used by an active item in the given group.

## `POST /api/habit-templates`

Creates a new custom `HabitTemplate`. Request body: `{ name, icon, defaultProjectedMinutes, category: "custom", timeOfDay: "any", formFields? }`. `formFields` follows the same `FormFieldDef[]` shape as `RoutineItem.formFields` (see routines-api.md) — a template carries its checklist fields so "add from catalog" creates a fully-formed `form_check` item; defaults to `[]` if omitted. Always inserts a new document — **no dedupe** against an existing custom template with the same name. Server sets `isSystem: false, createdBy: userId`.

Collection: `habittemplates` (`models/HabitTemplate.ts`). Fields: `name`, `icon`, `defaultProjectedMinutes`, `category` (enum: `food_safety | cleaning | cash_handling | equipment | opening_closing | custom`), `timeOfDay: "morning" | "evening" | "any"` (a display/catalog hint only — unrelated to `RoutineGroup.timeOfDay`, which has different possible values), `formFields`, `description?`, `isSystem`, `createdBy: userId | null`, `isActive`.

`RoutineItem.templateId` is the only link back to a template, and it's a one-time copy made at creation time (`POST /api/routine-items`, in routines-api.md) — editing or deleting a template afterward does not cascade to items already created from it.

## Consumed by

[`features/habits.md`](../features/habits.md).
