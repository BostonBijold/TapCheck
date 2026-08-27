# A Good Man — Project Brief for Claude Code

## Vision
A stoic, masculine habit tracker and personal growth app rooted in virtue philosophy.
The goal: help the user *be* a good man, not just discuss it (Marcus Aurelius).
Inspired by Ben Franklin's 13 virtues (weekly focus rotation), agile project methodology,
and the insight that routines have a *projected* vs *actual* time — and the gap between
those two is where self-knowledge lives.

Primary user: Boston (the developer, building this for himself first).
Built mobile-first as a Vercel web app, designed to eventually become a native iOS/Android app.
The data layer must stay consistent for that future migration (MongoDB + REST API).

---

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: MongoDB via Mongoose
- **Auth**: Auth.js (NextAuth v5)
- **Styling**: Tailwind CSS
- **Deployment**: Vercel (free tier)
- **Future**: React Native wrapper around same API

---

## Design System

### Colors
```
bg-primary:     #18160f   (warm near-black — all backgrounds)
bg-card:        #211f17   (card surfaces)
bg-card-hover:  #2a2720
text-primary:   #e8e0cc   (parchment white)
text-muted:     #9a9280
text-dim:       #5a5548
olive:          #5a6b35   (primary action, streaks, done states)
olive-light:    #7a9248
gold:           #c4a84a   (virtue accent, etymology highlights)
tobacco:        #8b5a2b   (warnings, past-window states)
burgundy:       #7a2e2e   (missed, over-timer states)
burgundy-light: #a03a3a
amber:          #c47a2a   (timer warning — 75% of target elapsed)
blue-muted:     #4a7a9a   (goal/task layer — distinct from routine layer)
border:         #2e2c22
border-light:   #3d3b2e
```

### Typography
- **Headings/Virtue names**: Playfair Display (serif, italic for virtue word)
- **Data/Timers/Labels**: IBM Plex Mono
- **Body/UI**: Inter
- All loaded via Google Fonts

### Border Radius
- Cards: 12px
- Buttons: 8px
- Badges/pills: 20px (full round)
- Bottom sheet / modals: 16px top corners

### Layout
- Max width: 420px, centered
- Mobile-first
- Bottom navigation bar (Today, Virtues, Goals, Profile)

---

## Data Models

### User
```js
{
  _id, email, name,
  role: 'user' | 'admin',
  createdAt
}
```

### RoutineGroup
```js
{
  _id,
  userId,           // null = default/seed group, userId = custom
  name,             // 'Morning Routine', 'Evening Routine', etc.
  timeOfDay: 'morning' | 'evening' | 'custom',
  collapseAfter,    // '10:00' for morning, '22:00' for evening, null for custom
  order,            // display order
  isDefault: bool
}
```

### RoutineItem
```js
{
  _id,
  groupId,
  userId,           // null = default seed item
  name,             // 'Morning Shower'
  icon,             // emoji string '🚿'
  projectedMinutes, // user's intention
  order,
  isActive: bool,
  linkedGoalId      // optional — ties this routine to a Goal
}
```

### RoutineLog
```js
{
  _id,
  userId,
  routineItemId,
  date,             // YYYY-MM-DD
  actualMinutes,    // null if skipped
  state: 'done' | 'missed' | 'rest',
  // 'missed' = breaks streak, honest record
  // 'rest'   = intentional skip, protects streak (sick kid, late flight, rest day)
  note,             // optional manual back-entry note
  isBackEntry: bool,
  createdAt
}
```

### Virtue (admin-seeded, not user-editable)
```js
{
  _id,
  name,             // 'Disciplined'
  slug,             // 'disciplined'
  displayName,      // 'A Good Man Is Disciplined'
  order,            // 1-13, determines weekly rotation
  etymology,        // text block — word origin, reclaimed meaning
  essay,            // short essay (written by Boston over time)
  isActive: bool
}
```

### Quote (admin-only, add later)
```js
{
  _id,
  text,
  author,
  source,           // optional book/speech
  virtueId,         // which virtue this belongs to
  addedBy,          // admin userId
  createdAt
}
```

### Goal
```js
{
  _id,
  userId,
  name,               // 'Lose 20 lbs', 'Build the App', 'Write a Book'
  description,
  status: 'active' | 'complete' | 'paused' | 'abandoned',
  targetDate,

  // Progress — derived from lowest available unit (see calculation rules below)
  // If milestones+tasks exist → task completion drives %
  // If milestones only → milestone completion drives %
  // If neither → manual progressPct
  progressPct,        // 0-100, computed or manual

  // Outcome tracking (for correlation goals — e.g. weight, revenue, pages written)
  outcomeMetric: {
    label,            // 'Weight (lbs)', 'Pages Written'
    targetValue,      // 160, 100
    unit,             // 'lbs', 'pages'
  },
  outcomeLog: [{      // periodic manual check-ins
    _id, value, date, note
  }],

  milestones: [{
    _id,
    name,
    targetDate,
    order,
    complete,         // DERIVED — true when all tasks done (or manually if no tasks)
    completedAt,
    tasks: [{
      _id,
      name,
      done: bool,
      completedAt,
      scheduledDate,  // YYYY-MM-DD — if set, appears in Today view on that date
      scheduledTime,  // 'HH:MM' optional
      estimatedMinutes,
      note
    }]
  }],

  createdAt
}
```

### HabitGoalLink
```js
{
  _id,
  userId,
  routineItemId,      // the habit
  goalId,             // the goal it relates to

  relationshipType: 'correlation' | 'accumulation',
  // correlation: habit adherence shown as context on goal (gym → weight loss)
  //              completing habit does NOT auto-advance goal progress
  // accumulation: each habit completion ticks a counter toward goal target
  //               (page/day → 100 pages) — BUILD LATER

  // accumulation only (leave null for correlation):
  unitPerCompletion,  // 1
  unit,               // 'page'
  targetCount,        // 100
}
```

---

## Feature Build Order

### Phase 1 — Routines (current focus)
- [ ] MongoDB connection + Mongoose models
- [ ] Auth (email/password or Google OAuth)
- [ ] Seed default routine groups + items on first login
- [ ] Today view: morning group (collapses after 10am) + evening group (collapses after 10pm)
- [ ] Routine card: tap to expand actions (Start timer / Missed it / Rest+Life)
- [ ] Timer screen: ring countdown, green→amber→red color shift, actual time logged on stop
- [ ] RoutineLog write on complete/skip
- [ ] 7-day streak dots per item
- [ ] Back-entry: manual log when morning window has passed

### Phase 2 — Goals + Tasks
- [ ] Goal model + CRUD (name, description, targetDate, outcomeMetric)
- [ ] Milestones inside goal (ordered, with targetDate)
- [ ] Tasks inside milestones (scheduledDate optional → appears in Today view if set)
- [ ] Progress calculation — lowest unit wins:
      - Has tasks → (total tasks done / total tasks) × 100
      - Has milestones only → (milestones complete / total milestones) × 100
      - Neither → manual progressPct
      - Milestone.complete is DERIVED (all its tasks done), never manually set
- [ ] HabitGoalLink model — correlation type only for now
      - Linking a habit to a goal is optional
      - Completing a habit does NOT auto-advance goal progress (correlation, not causation)
- [ ] Habit adherence % on goal detail (last 30 days per linked habit)
- [ ] Outcome log: periodic manual check-ins (e.g. weigh-in) with date + value
- [ ] Tasks appear in Today view between morning and evening routines
- [ ] Active goal progress card on Today view (most recently active goal)
- [ ] Goal detail page: progress bar, milestones+tasks, linked habit adherence, outcome log

### Phase 3 — Virtues
- [ ] Admin seeds 13 virtues (see list below)
- [ ] Weekly rotation logic (week number % 13 → current virtue)
- [ ] Virtue detail page: name, etymology, essay
- [ ] Virtue shown on Today view header

### Phase 4 — Quotes (last)
- [ ] Admin UI to add quotes, tag to virtue
- [ ] Random quote from current virtue's pool on each app load

---

## Routine Behavior Rules

### Time-Aware Collapse
- Morning routine auto-collapses after 10:00am local time
- Evening routine auto-collapses after 10:00pm local time
- Collapsed state shows: group name, dot summary, time-warning badge
- Expanding a past-window group shows a "Back-entry" banner above items
- Custom groups do not auto-collapse

### Skip Types
Two distinct skip states — must be visually and semantically different:

**Missed it** (`state: 'missed'`)
- User forgot, chose not to, couldn't be bothered
- Breaks streak — red dot in history
- Honest record of not doing it

**Rest / Life** (`state: 'rest'`)
- Intentional, justified skip
- Examples: rest day, sick child, late flight, vacation, injury
- Protects streak — blue dot in history
- App never punishes the user for living life

### Variance Tracking
Every RoutineLog with `state: 'done'` stores `actualMinutes`.
Over time this builds a picture of projected vs actual per item.
Analytics (Phase 1 end): show average actual vs projected per item,
identify where the user consistently over/under-runs.

---

## Goal Rules

### Progress Calculation
Use the lowest available unit — never mix levels:
```
if (goal has milestones with tasks):
  progress = tasks_done / tasks_total
elif (goal has milestones, no tasks):
  progress = milestones_complete / milestones_total
else:
  progress = goal.progressPct  // manual
```
Milestone.complete is always DERIVED (all tasks done), never set manually.
Example: 2 milestones × 3 tasks = 6 total. 3 done = 50%.

### Habit-Goal Relationship
Two types — build correlation now, accumulation later:

**Correlation** (e.g. gym → weight loss)
- Habit adherence shown as *context* on goal detail page
- "Last 30 days: Gym 75% of planned"
- Does NOT drive goal progress percentage
- User draws conclusions — app shows data, doesn't assume causation

**Accumulation** (e.g. page/day → 100 pages) — BUILD LATER
- Each habit completion ticks a unit counter
- Progress = (completions × unitPerCompletion) / targetCount
- Same HabitGoalLink model, just `relationshipType: 'accumulation'`

### Outcome Logging
For goals with a measurable outcome (weight, revenue, etc.):
- User logs check-ins manually: value + date + optional note
- Shown as a line chart on goal detail page over time
- Target value shown as a horizontal reference line
- This is separate from progress % — it's the real-world result

### Today View — Task Appearance
- Tasks with `scheduledDate === today` appear between morning and evening routines
- Tasks without scheduledDate live in goal backlog only (not in Today view)
- Tasks show: goal name tag (blue), task name, time if scheduled, checkbox
- Checking a task updates milestone completion, which updates goal progress

---

## Default Seed Data

### Morning Routine (collapseAfter: '10:00')
| name | icon | projectedMinutes |
|---|---|---|
| Morning Shower | 🚿 | 10 |
| Get Dressed | 👔 | 10 |
| Cook Breakfast | 🍳 | 20 |
| Eat Breakfast | 🥚 | 20 |
| Morning Workout | 🏋️ | 45 |
| Meditate | 🧘 | 10 |
| Read Scriptures / Morning Reading | 📖 | 15 |

### Evening Routine (collapseAfter: '22:00')
| name | icon | projectedMinutes |
|---|---|---|
| Evening Workout | 🏋️ | 45 |
| Cook Dinner | 🍽️ | 30 |
| Eat Dinner | 🥩 | 30 |
| Family Time | 👨‍👩‍👧‍👦 | 60 |
| Evening Walk | 🚶 | 20 |
| Wind Down / Stretch | 🧘 | 15 |
| Read | 📚 | 20 |
| Journal | 📓 | 15 |
| Brush Teeth / Hygiene | 🪥 | 10 |

---

## Virtue List (13 — weekly rotation)
Seed these in order. Essays and etymology to be added by Boston over time.

1. Disciplined — *dis·ci·pli·na*, instruction/training. Not punishment — studenthood of self.
2. Present — fully here, not elsewhere. Phone down, eyes up.
3. Patient — practiced stillness. Requires discipline as foundation.
4. Humble — knows what he doesn't know. Foundation of learning.
5. Honest — with himself first, then others.
6. Courageous — acts despite fear. Distinct from fearlessness.
7. Genuine / His Own Man — aligned inside and out. Not performing.
8. Responsible — owns outcomes, doesn't deflect.
9. Provider — not just financial. Presence, safety, stability.
10. Strong — physical and moral. Both require training.
11. Intentional — choices are deliberate, not reactive.
12. Faithful — to his values, his people, his word.
13. Servant Leader — leads by example and sacrifice, not authority.

---

## Admin Role
- Boston's account gets `role: 'admin'`
- Admin can: add/edit quotes, edit virtue essays/etymology
- Admin cannot be set via UI — set directly in MongoDB or via seed script
- Regular users cannot modify virtues or quotes

---

## Current App State (as of Jun 16 2025)
- Routines: BUILT — morning/afternoon/evening groups, time-aware collapse/expand, dot progress, Edit button per group
- Analytics tab: BUILT — basic habit adherence data
- FAB button (center bottom nav): BUILT — opens quick actions (start next routine, add standalone habit, add task)
- Goals tab: IN PROGRESS
- Review tab: NOT BUILT
- Quotes: BUILT — `Quote` model, admin authoring UI, loading-screen virtue-pinned pick + nav-button random pick (see `docs/api/quotes-api.md`)

**Bottom nav (final structure):**
1. Routines (far left) — Today view
2. Goals — Goal list + active goal
3. Analytics — Habit trends, variance, adherence
4. Review (far right) — Daily virtue check-in + weekly recap

**Top nav:**
- Left: Jackalope logo mark (links to about/merch eventually)
- Center: "A Good Man" + date
- Right: Profile avatar (Google icon or initial — opens profile/settings)
- Store/merch: hidden for MVP, accessible via jackalope logo or profile later

---

## UI Reference

### Today View Structure (top to bottom)
1. Top nav: Jackalope left, "A Good Man / [date]" center, profile avatar right
2. Virtue card: "THIS WEEK'S VIRTUE — A Good Man Is [Virtue]" with chevron → virtue detail
3. Today/Analytics tab toggle (already built — reconsider moving Analytics to bottom nav)
4. Date navigator: < Today >
5. X/14 progress counter + progress bar
6. Morning Routine group (collapsible, time-aware)
7. Goal tasks for today (if any, between routines)
8. Afternoon Routine group (collapsible, time-aware)
9. Evening Routine group (collapsible, time-aware)
10. Bottom nav: Routines / Goals / Analytics / Review

### Routine Group — Time-Aware Collapse Logic
Each RoutineGroup has: expectedStartTime, expectedEndTime, bufferMinutes
```
Before expectedStartTime     → collapsed (not yet)
Between start and end        → expanded (active window)
Within bufferMinutes after end → expanded with "back-entry" banner (manual logging)
After buffer expires         → collapsed (window passed, dots show summary)
```
Morning: ~4:30am–10:00am | Afternoon: ~4:00pm–6:00pm | Evening: ~6:00pm–10:00pm
User can customize these times per group in settings.

### Timer Screen
- Full screen takeover
- Ring countdown (SVG circle, stroke animates)
- Color states: olive (on track) → amber (75% elapsed) → burgundy (over target)
- Over-target shows +MM:SS in burgundy
- Pause / Resume / Log buttons
- Recent history below (last 5 logs for this item)

### Routine Card States
- **open**: pending, dark card, "Pending" badge, tap expands to 3 actions
- **done**: olive border, "Done" badge, variance shown (+/-Xm)
- **missed**: burgundy border, "Missed" badge
- **rest**: blue-muted border, "Rest" badge

---

## Virtue Check-in System

### Overview
Two special RoutineItem types that live inside routine groups like any other habit.
User can move them between routine groups (e.g. move Daily Check-in from evening to afternoon).
Instead of opening a timer, they open a modal specific to their type.

### RoutineItem — Special Types
Add `itemType` field to RoutineItem:
```js
itemType: 'standard' | 'virtue_checkin' | 'weekly_review'
// standard = normal timer habit (default)
// virtue_checkin = opens daily virtue modal (no timer)
// weekly_review = opens weekly recap modal (no timer, Sunday only)
```

### Seed: Add to Evening Routine
| name | icon | itemType | projectedMinutes | order |
|---|---|---|---|---|
| Virtue Check-in | 🧭 | virtue_checkin | 5 | second to last |
| (Sunday only) Weekly Review | 📋 | weekly_review | 10 | last |

Weekly Review item is visible every day but:
- Mon-Sat: tapping it shows "This is a Sunday habit" — skip options only, no modal
- Sunday: tapping it opens the full weekly review modal

### Daily Virtue Check-in Modal
Triggered by tapping Start on a `virtue_checkin` routine item.
- Header: "A Good Man Is [This Week's Virtue]" + short virtue description
- Below: list of all 13 virtues, each with YES / NO toggle (both required — must pick one)
- Submit button → saves VirtueCheckIn doc, marks routine item as done
- Same skip options as any routine: Missed it / Rest+Life (does not open modal)
- Can only submit for today or yesterday (yesterday allowed before Sunday review locks the week)

### Weekly Review Modal
Triggered by tapping Start on a `weekly_review` routine item on Sunday evening.
- Auto-generated — no user input required
- Shows: "This week's virtue: Patience"
- Summary table: each of 13 virtues with X/7 score
- Highlights: strongest virtue this week, virtue that needs work
- Habit adherence for the week (linked habits only)
- Next week's virtue preview: name + description
- Single confirm button: "Got it. Start next week." → locks week, rotates virtue

### VirtueCheckIn Schema
```js
{
  _id,
  userId,
  date,               // YYYY-MM-DD — the day being checked in
  weekStartDate,      // YYYY-MM-DD — Sunday of that week
  answers: [{
    virtueId,
    answer: 'yes' | 'no'  // both options required, no blank answers
  }],
  createdAt
}
```

### Virtue Rotation Rules
- Virtues rotate weekly, Sunday night (midnight Sun→Mon)
- Rotation is calendar-based: weekNumber % 13 → virtue index
- Does NOT require user to complete weekly review to rotate (calendar drives it)
- Weekly review just surfaces the summary before the new week starts
- User start-of-week day: Monday (future setting: user can change to Sunday/Saturday)

### Check-in Honesty Rules
- User can submit for TODAY or YESTERDAY only
- No editing past answers once submitted
- No back-filling beyond yesterday
- Attempting to check in 2+ days ago: "You can only check in for today or yesterday"
- This is intentional — mirrors Franklin's pen-and-ink honesty
- Once Sunday midnight passes, that week's data is read-only

### Review Tab — Historical View
- List of past weeks (most recent first)
- Each week shows: virtue name, top score, lowest score, overall completion %
- Tap a week → full weekly summary (same layout as the Sunday modal, read-only)
- Chart: 13 virtues over time (last 4 weeks or all time toggle)
- Identifies patterns: "You consistently mark Humility high, Discipline low"

---

## Environment Variables Needed
```
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=      # if using Google OAuth
GOOGLE_CLIENT_SECRET=  # if using Google OAuth
APNS_KEY_ID=           # Apple Push Notifications Auth Key — see docs/features/live-activity.md
APNS_TEAM_ID=          # X3DPK5Y29G
APNS_PRIVATE_KEY=      # contents of the downloaded .p8 file
```

---

## Notes for Claude Code
- Always write to `/src` directory structure
- Use server components where possible, client components only where interactivity needed
- API routes under `/src/app/api/`
- Keep Mongoose models in `/src/lib/models/`
- DB connection utility in `/src/lib/mongodb.ts`
- Do not use localStorage or sessionStorage — all state lives in MongoDB
- The app should feel native on mobile Safari — test tap targets at 44px minimum
- Seed script should be idempotent (safe to run multiple times)
