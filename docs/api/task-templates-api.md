> **Keep this file updated after any code change in this area — do not let it drift from actual implementation.**

# Task Templates API

Covers the `TaskTemplate` catalog — the un-tied-to-any-company example catalog a `TaskDefinition` can be cloned from (see [task-lists.md](../features/task-lists.md)'s "Company Task Catalog" section) — and the data consumed by [anytime-tasks.md](../features/anytime-tasks.md). Adding a task to any task list, and logging a task's daily state, both go through the shared endpoints documented in [task-lists-api.md](task-lists-api.md) (`/api/tasks`, `/api/task-logs`) — not duplicated here. This includes `scheduledDays`/`successThreshold` (placement-level, on `Task`) and `formFields` (definition-level, on `TaskDefinition`) — same shapes, same clamping behavior as a template's own fields, nothing template-specific about them.

**Auth**: same pattern as task-lists-api.md — `lib/session.ts`'s `resolveSessionUser()`, with a `SKIP_AUTH`-gated dev fallback, `401`/`403` otherwise.

## `GET /api/task-templates?taskListId=…`

Returns the browsable catalog for `AddTaskSheet`: system-seeded templates (`isSystem: true`, visible to every company) plus this company's own custom templates (`isSystem: false, companyId`), **excluding** any template already used by an active task in the given list.

## `POST /api/task-templates`

Creates a new custom `TaskTemplate`. Request body: `{ name, icon, defaultProjectedMinutes, category: "custom", timeOfDay: "any", formFields? }`. `formFields` follows the same `FormFieldDef[]` shape as `Task.formFields` (see task-lists-api.md) — a template carries its checklist fields so "add from catalog" creates a fully-formed `form` task; defaults to `[]` if omitted. Always inserts a new document — **no dedupe** against an existing custom template with the same name. Server sets `isSystem: false, companyId`.

Collection: `tasktemplates` (`models/TaskTemplate.ts`). Fields: `name`, `icon`, `defaultProjectedMinutes`, `category` (enum: `food_safety | cleaning | cash_handling | equipment | opening_closing | custom`), `timeOfDay: "morning" | "evening" | "any"` (a display/catalog hint only — unrelated to `TaskList.timeOfDay`, which has different possible values), `formFields`, `description?`, `isSystem`, `companyId: string | null`, `isActive`.

`TaskDefinition.templateId` (not `Task` — see task-lists-api.md's "Tasks & Task Definitions" section) is the only link back to a template, and it's a one-time copy made at creation time (`POST /api/tasks`'s new-definition path, in task-lists-api.md) — editing or deleting a template afterward does not cascade to definitions already created from it.

## Consumed by

[`features/anytime-tasks.md`](../features/anytime-tasks.md).
