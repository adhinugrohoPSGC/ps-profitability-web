# ClickUp Sync, Project Quick Actions & Dashboard Simplification — Design Spec

**Goal:** Automate nightly timesheet collection from ClickUp per project, add inline expense and budget editing to project cards, and collapse the per-phase budget vs actual table into a single totals summary.

**Architecture:** Three independent changes to the existing Next.js + Supabase app. No new dependencies required beyond the native `fetch` API for ClickUp HTTP calls.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL), Vercel Cron, ClickUp REST API v2.

---

## Feature 1: ClickUp Nightly Sync

### API Route

`app/api/sync-clickup/route.ts` — POST handler, protected by a `CRON_SECRET` header check (set as a Vercel env var, sent by the cron and by the manual "Sync Now" button).

**Execution sequence:**
1. Read `clickup_api_token` and `clickup_workspace_id` from Supabase `user_settings` table (keyed by `key`/`value` columns already in use).
2. Fetch all rows from `projects` where `external_id IS NOT NULL` and `status != 'archived'`.
3. For each project, call ClickUp API:
   ```
   GET https://api.clickup.com/api/v2/team/{workspace_id}/time_entries
     ?list_id={project.external_id}
     &start_date={90_days_ago_unix_ms}
     &end_date={now_unix_ms}
   Authorization: {clickup_api_token}
   ```
4. Delete existing rows from `timesheet_entries` where `project_id = project.id` AND `import_batch_id LIKE 'clickup-%'`.
5. Map ClickUp response fields:
   - `entry.user.id` → `user_external_id`
   - `entry.user.username` → `consultant_name`
   - `entry.start` (Unix ms) → `entry_date` (ISO date string)
   - `entry.duration` (ms) ÷ 3600000 → `hours`
   - `entry.task?.name` → `task_description`
   - `project.id` → `project_id`
6. Look up `rate_card` by `user_external_id` to populate `cost_rate_sgd`, `bill_rate_sgd`, `rate_card_id`. Default to 0 if no match.
7. Insert mapped rows with `import_batch_id = 'clickup-{project.id}-{YYYY-MM-DD}'`.
8. Write one row to `import_log` per project: `template_type = 'clickup-sync'`, `rows_imported`, `rows_skipped = 0`.
9. Return `{ synced: N, projects: [...names] }` JSON.

**Error handling:** If ClickUp token is missing → return 400 with clear message. If a single project's API call fails → log the error, continue to next project (partial success is fine).

### Vercel Cron

`vercel.json`:
```json
{
  "crons": [{ "path": "/api/sync-clickup", "schedule": "0 2 * * *" }]
}
```

Fires at 2:00 AM UTC daily. Vercel sends `Authorization: Bearer {CRON_SECRET}` automatically when `CRON_SECRET` env var is set.

### Settings Page Changes

Two new fields added to `app/(app)/settings/page.tsx`:
- **ClickUp API Token** — `<input type="password">`, saved to `user_settings` with key `clickup_api_token`.
- **ClickUp Workspace ID** — text input, saved as `clickup_workspace_id`.

One new button: **"Sync Now"** — calls `POST /api/sync-clickup-manual` (a separate route with no secret required, rate-limited server-side to 1 call per 60 seconds using a module-level timestamp). Shows toast with result.

### New Environment Variables

- `CRON_SECRET` — random secret, set in Vercel dashboard. Used only by the Vercel cron caller. Never exposed client-side.

### DB Changes

None. `timesheet_entries` already has `user_external_id`, `import_batch_id`, `external_project_id`.

---

## Feature 2: Project Card Quick Actions

### New Buttons on Each Project Card

Two icon buttons added to the action row of each card in `app/(app)/projects/page.tsx`:
- **`+ Expenses`** (DollarSign icon) — opens expense upload modal
- **`+ Budget`** (BarChart icon) — opens budget line editor modal

### Expense Upload Modal

Reuses `ExpensesCard` logic extracted from `app/(app)/upload/page.tsx` into `components/ExpensesCard.tsx`. The component accepts `projectId: string` as a prop. When opened from the Projects page, the project is pre-selected and the project selector dropdown is hidden.

**Extraction scope:** only the upload/parse/preview/import logic. No change to behaviour.

### Budget Line Editor Modal

New inline modal on the Projects page. Shows a table of existing `project_budget` rows for the selected project (columns: Phase, Budgeted Hours, Budgeted Cost SGD, Budgeted Revenue SGD). Supports:
- **Add row** — blank row appended, editable inline
- **Edit row** — click a row to edit its cells
- **Delete row** — trash icon per row
- **Save** — upserts all rows to `project_budget` via Supabase

No XLS import here — that stays on the Upload page for bulk import. This modal is for manual entry of a few lines.

### DB Changes

None. `project_budget` schema: `id, project_id, phase, budgeted_hours, budgeted_cost, budgeted_revenue` — already exists.

---

## Feature 3: Dashboard Budget vs Actual Simplification

### Change

In `app/(app)/dashboard/page.tsx`:

- **Delete** `budgetRows` useMemo (the per-phase array computation, ~18 lines).
- **Delete** the `<tbody>` rows loop and Phase table header.
- **Keep** `budgetTotals` useMemo (already a reduce over all phases — just sum, no display change needed).
- **Replace** the table with a single-row summary (or 4 KPI-style cards matching the existing dashboard card style):

  | Budg. Hrs | Act. Hrs | Hrs Var | Budg. Cost | Act. Cost | Cost Var | Var % |

  Using `budgetTotals` values directly.

**Net effect:** ~40 lines deleted from `dashboard/page.tsx`, replaced by ~10 lines.

### DB Changes

None. `project_budget` is still read; it's just summed rather than broken out per phase.

---

## File Map

| File | Action |
|------|--------|
| `app/api/sync-clickup/route.ts` | Create — cron-protected route |
| `app/api/sync-clickup-manual/route.ts` | Create — rate-limited manual trigger |
| `vercel.json` | Create (or update if exists) |
| `app/(app)/settings/page.tsx` | Modify — add 2 fields + Sync Now button |
| `app/(app)/projects/page.tsx` | Modify — add 2 action buttons + Budget modal |
| `components/ExpensesCard.tsx` | Create — extracted from upload/page.tsx |
| `app/(app)/upload/page.tsx` | Modify — import ExpensesCard from component |
| `app/(app)/dashboard/page.tsx` | Modify — remove phase rows, single totals |

---

## Out of Scope

- ClickUp OAuth flow — Personal API token only
- Syncing expenses from ClickUp
- Timesheet edit/delete UI (data comes in via sync or XLS, no row-level editing)
- Phase breakdown anywhere else in the app
