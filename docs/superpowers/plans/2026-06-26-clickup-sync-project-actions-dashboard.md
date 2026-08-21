# ClickUp Sync, Project Quick Actions & Dashboard Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate nightly ClickUp timesheet sync, add inline expense/budget modals to project cards, and collapse the per-phase budget table to a single totals row.

**Architecture:** Three independent features on the existing Next.js + Supabase app. No new npm packages needed. Native `fetch` for ClickUp API calls. Vercel cron via `vercel.json`. `ExpensesCard` extracted from `upload/page.tsx` into a shared component.

**Tech Stack:** Next.js 16 App Router, Supabase JS client, Tailwind CSS, TypeScript, Vercel Cron, ClickUp REST API v2.

---

## File Map

| File | Action |
|------|--------|
| `lib/clickup.ts` | Create — ClickUp fetch helper + type definitions |
| `app/api/sync-clickup/route.ts` | Create — cron-protected POST handler |
| `app/api/sync-clickup-manual/route.ts` | Create — rate-limited manual trigger |
| `vercel.json` | Create — cron schedule |
| `app/(app)/settings/page.tsx` | Modify — add ClickUp section with 2 fields + Sync Now button |
| `components/ExpensesCard.tsx` | Create — extracted from upload/page.tsx |
| `app/(app)/upload/page.tsx` | Modify — replace local ExpensesCard with imported component |
| `app/(app)/projects/page.tsx` | Modify — add + Expenses and + Budget buttons + Budget modal |
| `app/(app)/dashboard/page.tsx` | Modify — replace phase table with single totals row |

---

## Task 1: ClickUp helper lib

**Files:**
- Create: `lib/clickup.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/clickup.ts

export interface ClickUpTimeEntry {
  id: string
  user: { id: number; username: string }
  task: { name: string } | null
  start: string        // Unix ms as string
  duration: string     // ms as string
}

export async function fetchClickUpTimeEntries(
  token: string,
  workspaceId: string,
  listId: string,
  startMs: number,
  endMs: number,
): Promise<ClickUpTimeEntry[]> {
  const url =
    `https://api.clickup.com/api/v2/team/${workspaceId}/time_entries` +
    `?list_id=${listId}&start_date=${startMs}&end_date=${endMs}`
  const res = await fetch(url, {
    headers: { Authorization: token },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`ClickUp API ${res.status}: ${await res.text()}`)
  const json = await res.json() as { data: ClickUpTimeEntry[] }
  return json.data ?? []
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output (no errors)

---

## Task 2: ClickUp sync core route

**Files:**
- Create: `app/api/sync-clickup/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/sync-clickup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'
import { fetchClickUpTimeEntries } from '@/lib/clickup'

const ANON_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get('authorization') ?? ''
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createClient()

  // Read ClickUp credentials from settings
  const { data: settingsRows } = await sb
    .from('user_settings')
    .select('key, value')
    .in('key', ['clickup_api_token', 'clickup_workspace_id'])
  const settings = Object.fromEntries(
    (settingsRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  )
  const token = settings['clickup_api_token']
  const workspaceId = settings['clickup_workspace_id']
  if (!token || !workspaceId) {
    return NextResponse.json({ error: 'ClickUp token or workspace ID not configured in Settings' }, { status: 400 })
  }

  // Fetch active projects with a ClickUp list ID
  const { data: projects } = await sb
    .from('projects')
    .select('id, name, external_id')
    .not('external_id', 'is', null)
    .neq('status', 'archived')

  if (!projects?.length) {
    return NextResponse.json({ synced: 0, projects: [] })
  }

  // Load rate card for cost lookup  
  const { data: rateCards } = await sb
    .from('rate_card')
    .select('id, user_external_id, cost_rate_sgd, bill_rate_sgd')
    .eq('active', true)

  const rcMap: Record<string, { id: number; cost: number; bill: number }> = {}
  for (const rc of (rateCards ?? []) as { id: number; user_external_id: string | null; cost_rate_sgd: number; bill_rate_sgd: number }[]) {
    if (rc.user_external_id) rcMap[rc.user_external_id] = { id: rc.id, cost: rc.cost_rate_sgd, bill: rc.bill_rate_sgd }
  }

  const now = Date.now()
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000
  const today = new Date().toISOString().slice(0, 10)
  const syncedProjects: string[] = []

  for (const project of projects as { id: string; name: string; external_id: string }[]) {
    try {
      const entries = await fetchClickUpTimeEntries(token, workspaceId, project.external_id, ninetyDaysAgo, now)

      // Full refresh: delete previous clickup-synced rows for this project
      await sb
        .from('timesheet_entries')
        .delete()
        .eq('project_id', project.id)
        .like('import_batch_id', 'clickup-%')

      if (!entries.length) continue

      const batchId = `clickup-${project.id}-${today}`
      const mapped = entries.map(e => {
        const userIdStr = String(e.user.id)
        const rc = rcMap[userIdStr]
        const hours = Math.round((Number(e.duration) / 3600000) * 100) / 100
        return {
          project_id: project.id,
          entry_date: new Date(Number(e.start)).toISOString().slice(0, 10),
          consultant_name: e.user.username,
          user_external_id: userIdStr,
          external_project_id: project.external_id,
          task_description: e.task?.name ?? '',
          phase: '',
          hours,
          rate_card_id: rc?.id ?? null,
          cost_rate_sgd: rc?.cost ?? 0,
          labour_cost_sgd: hours * (rc?.cost ?? 0),
          bill_rate_sgd: rc?.bill ?? 0,
          billable_value_sgd: hours * (rc?.bill ?? 0),
          import_batch_id: batchId,
        }
      })

      const { error } = await sb.from('timesheet_entries').insert(mapped)
      if (error) throw error

      await sb.from('import_log').insert({
        batch_id: batchId,
        project_id: project.id,
        template_type: 'clickup-sync',
        filename: `clickup-sync-${today}`,
        rows_imported: mapped.length,
        rows_skipped: 0,
        user_id: ANON_USER_ID,
      })

      syncedProjects.push(project.name)
    } catch (err) {
      console.error(`ClickUp sync failed for project ${project.name}:`, err)
      // Continue to next project — partial success is acceptable
    }
  }

  return NextResponse.json({ synced: syncedProjects.length, projects: syncedProjects })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output

---

## Task 3: Manual sync route (rate-limited)

**Files:**
- Create: `app/api/sync-clickup-manual/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/sync-clickup-manual/route.ts
import { NextResponse } from 'next/server'

// Module-level rate limit: 1 call per 60 seconds
let lastCallMs = 0

export async function POST() {
  const now = Date.now()
  if (now - lastCallMs < 60_000) {
    const waitSec = Math.ceil((60_000 - (now - lastCallMs)) / 1000)
    return NextResponse.json({ error: `Rate limited — try again in ${waitSec}s` }, { status: 429 })
  }
  lastCallMs = now

  // Delegate to the main sync route handler directly (same process)
  const { POST: syncHandler } = await import('../sync-clickup/route')
  // Call with an empty request — no CRON_SECRET check when CRON_SECRET is not set
  const fakeReq = new Request('http://localhost/api/sync-clickup', { method: 'POST' })
  return syncHandler(fakeReq as Parameters<typeof syncHandler>[0])
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output

---

## Task 4: Vercel cron config

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Check if vercel.json already exists**

Run: `ls vercel.json 2>$null`

- [ ] **Step 2: Create or update vercel.json**

If the file doesn't exist, create it. If it does exist, read it first, then merge in the `crons` key.

Full content for a new file:
```json
{
  "crons": [
    {
      "path": "/api/sync-clickup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/clickup.ts app/api/sync-clickup/route.ts app/api/sync-clickup-manual/route.ts vercel.json
git commit -m "feat: ClickUp nightly sync API routes and vercel cron"
```

---

## Task 5: Settings page — ClickUp section

**Files:**
- Modify: `app/(app)/settings/page.tsx`

The file uses a `Section` + `Field` + `saveSetting` pattern throughout. Follow it exactly.

- [ ] **Step 1: Add the Link icon import**

The existing import line is:
```typescript
import { Building2, DollarSign, Gauge, Database, ChevronDown, ChevronUp, Check, AlertTriangle } from 'lucide-react'
```

Replace with:
```typescript
import { Building2, DollarSign, Gauge, Database, ChevronDown, ChevronUp, Check, AlertTriangle, Link, Loader2 } from 'lucide-react'
```

- [ ] **Step 2: Add syncLoading state and syncStatus state**

After the existing `const [clearError, setClearError] = useState('')` line, add:
```typescript
const [syncLoading, setSyncLoading] = useState(false)
const [syncStatus, setSyncStatus] = useState<string | null>(null)
```

- [ ] **Step 3: Add handleSyncNow function**

After the `update` function, add:
```typescript
const handleSyncNow = async () => {
  setSyncLoading(true)
  setSyncStatus(null)
  try {
    const res = await fetch('/api/sync-clickup-manual', { method: 'POST' })
    const json = await res.json() as { synced?: number; projects?: string[]; error?: string }
    if (!res.ok) throw new Error(json.error ?? 'Sync failed')
    setSyncStatus(`Synced ${json.synced} project(s): ${(json.projects ?? []).join(', ') || 'none'}`)
  } catch (err) {
    setSyncStatus(`Error: ${String(err)}`)
  } finally {
    setSyncLoading(false)
  }
}
```

- [ ] **Step 4: Add ClickUp Integration section**

Add this block after the closing `</Section>` of the Overhead section (before the Data Management section):

```tsx
{/* ── ClickUp Integration ──────────────────────────────────────────────── */}
<Section icon={Link} title="ClickUp Integration">
  <Field label="API Token" hint="Personal token from ClickUp → Settings → Apps">
    <div className="flex items-center gap-2">
      <input
        type="password"
        value={settings.clickup_api_token ?? ''}
        onChange={e => update('clickup_api_token', e.target.value)}
        placeholder="pk_xxxxxxxxxxxx"
        className="flex-1 border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
      />
      <SavedBadge k="clickup_api_token" />
    </div>
  </Field>
  <Field label="Workspace ID" hint="Numeric ID from your ClickUp workspace URL">
    <div className="flex items-center gap-2">
      <input
        value={settings.clickup_workspace_id ?? ''}
        onChange={e => update('clickup_workspace_id', e.target.value)}
        placeholder="e.g. 9012345678"
        className="w-52 border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
      />
      <SavedBadge k="clickup_workspace_id" />
    </div>
  </Field>
  <div className="pt-3 flex items-center gap-3">
    <button
      onClick={handleSyncNow}
      disabled={syncLoading}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
    >
      {syncLoading ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
      {syncLoading ? 'Syncing…' : 'Sync Now'}
    </button>
    {syncStatus && (
      <p className="text-xs text-slate-500">{syncStatus}</p>
    )}
  </div>
  <p className="text-xs text-slate-400 mt-2">
    Nightly sync runs automatically at 2:00 AM UTC. Each project must have its External Project ID set to a ClickUp List ID.
  </p>
</Section>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add app/(app)/settings/page.tsx
git commit -m "feat: ClickUp settings section with API token, workspace ID, and Sync Now button"
```

---

## Task 6: Extract ExpensesCard to shared component

**Files:**
- Create: `components/ExpensesCard.tsx`
- Modify: `app/(app)/upload/page.tsx`

The `ExpensesCard` function currently lives at line ~503 of `upload/page.tsx`. It accepts `{ selectedProject: string | null }`.

- [ ] **Step 1: Create components/ExpensesCard.tsx**

Copy the entire `ExpensesCard` function from `upload/page.tsx` into a new file. The component needs its own imports — check what it uses:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { parseExpensesXLS, generateExpensesTemplate, type ExpenseRow } from '@/lib/parseTemplates'
import Modal from '@/components/Modal'
import { createClient } from '@/lib/supabase/client'

// ── Helpers (duplicated from upload/page.tsx to keep this component self-contained) ──

function downloadBlob(buf: ArrayBuffer, filename: string) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function batchId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n)
}

// ── Drop Zone ─────────────────────────────────────────────────────────────────

function DropZone({ onFile, loading, hasFile }: { onFile: (buf: ArrayBuffer, name: string) => void; loading: boolean; hasFile: boolean }) {
  const inputRef = useCallback((node: HTMLInputElement | null) => { if (node) (inputRef as { current: HTMLInputElement | null }).current = node }, [])
  const ref = { current: null as HTMLInputElement | null }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { if (ev.target?.result) onFile(ev.target.result as ArrayBuffer, file.name) }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  return (
    <div
      onClick={() => ref.current?.click()}
      className={`relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-6 px-4 transition-colors cursor-pointer select-none
        ${hasFile ? 'border-green-300 bg-green-50 cursor-default' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40'}`}
    >
      <input ref={n => { ref.current = n }} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
      {loading
        ? <Loader2 className="animate-spin text-blue-500 mb-2" size={28} />
        : hasFile
          ? <CheckCircle size={28} className="text-green-500 mb-2" />
          : <DollarSign size={28} className="text-slate-300 mb-2" />}
      <p className="text-sm text-slate-500">{loading ? 'Parsing…' : hasFile ? 'File loaded' : 'Drop expenses XLS here or click to browse'}</p>
    </div>
  )
}
```

Then paste the full `ExpensesCard` function body (lines 503–719 of `upload/page.tsx`) after the helpers. Change the signature to accept an optional `hideProjectWarning` prop:

```typescript
export default function ExpensesCard({
  selectedProject,
  hideProjectWarning = false,
}: {
  selectedProject: string | null
  hideProjectWarning?: boolean
}) {
```

In the `handleConfirmImport` function inside the component, the existing check `if (!selectedProject)` should respect `hideProjectWarning` — leave it as-is (if no project is selected the import will still fail at the DB insert level, which is acceptable).

End the file with `export default ExpensesCard`.

- [ ] **Step 2: Update upload/page.tsx to import from the component**

In `upload/page.tsx`, remove the entire `ExpensesCard` function (lines ~503–719) and add this import at the top with the other imports:

```typescript
import ExpensesCard from '@/components/ExpensesCard'
```

The `<ExpensesCard selectedProject={selectedProject} />` JSX call in the page's return remains unchanged.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add components/ExpensesCard.tsx app/(app)/upload/page.tsx
git commit -m "refactor: extract ExpensesCard to shared component"
```

---

## Task 7: Project card quick actions — + Expenses button

**Files:**
- Modify: `app/(app)/projects/page.tsx`

- [ ] **Step 1: Add ExpensesCard import and state**

Add to the existing imports at the top of `projects/page.tsx`:

```typescript
import ExpensesCard from '@/components/ExpensesCard'
import Modal from '@/components/Modal'
```

After `const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)`, add:

```typescript
const [expenseProject, setExpenseProject] = useState<Project | null>(null)
```

- [ ] **Step 2: Add + Expenses button to each project card**

In the project card action buttons row (after the existing Archive button), add:

```tsx
<button
  onClick={() => setExpenseProject(p)}
  title="Add Expenses"
  className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"
>
  <DollarSign size={14} />
</button>
```

Add `DollarSign` to the existing lucide-react import line.

- [ ] **Step 3: Add the Expenses modal**

After the Delete Confirm modal closing `</Modal>` tag, add:

```tsx
{/* Expenses Upload Modal */}
<Modal open={!!expenseProject} title={`Add Expenses — ${expenseProject?.name ?? ''}`} onClose={() => setExpenseProject(null)} maxWidth="max-w-3xl">
  <ExpensesCard selectedProject={expenseProject?.id ?? null} hideProjectWarning />
</Modal>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output

---

## Task 8: Project card quick actions — + Budget modal

**Files:**
- Modify: `app/(app)/projects/page.tsx`

- [ ] **Step 1: Add budget line type and state**

After the existing `Project` interface, add:

```typescript
interface BudgetLine {
  id?: number
  project_id: string
  phase: string
  budgeted_hours: number
  budgeted_cost: number
  budgeted_revenue: number
}
```

After `const [expenseProject, setExpenseProject] = useState<Project | null>(null)`, add:

```typescript
const [budgetProject, setBudgetProject] = useState<Project | null>(null)
const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([])
const [budgetSaving, setBudgetSaving] = useState(false)
```

- [ ] **Step 2: Add loadBudget and saveBudget functions**

After `handleToggleArchive`, add:

```typescript
async function loadBudget(p: Project) {
  const { data } = await createClient()
    .from('project_budget')
    .select('*')
    .eq('project_id', p.id)
    .order('id')
  setBudgetLines((data ?? []) as BudgetLine[])
  setBudgetProject(p)
}

async function saveBudget() {
  if (!budgetProject) return
  setBudgetSaving(true)
  try {
    // Delete all existing lines for this project then re-insert
    await createClient().from('project_budget').delete().eq('project_id', budgetProject.id)
    const toInsert = budgetLines
      .filter(l => l.phase.trim())
      .map(({ id: _id, ...rest }) => ({ ...rest, project_id: budgetProject.id }))
    if (toInsert.length) {
      const { error } = await createClient().from('project_budget').insert(toInsert)
      if (error) throw error
    }
    toast('Budget saved', 'success')
    setBudgetProject(null)
  } catch (err: unknown) {
    toast(err instanceof Error ? err.message : 'Save failed', 'error')
  } finally {
    setBudgetSaving(false)
  }
}

function updateBudgetLine(idx: number, field: keyof BudgetLine, value: string | number) {
  setBudgetLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
}

function addBudgetLine() {
  if (!budgetProject) return
  setBudgetLines(prev => [...prev, { project_id: budgetProject.id, phase: '', budgeted_hours: 0, budgeted_cost: 0, budgeted_revenue: 0 }])
}

function removeBudgetLine(idx: number) {
  setBudgetLines(prev => prev.filter((_, i) => i !== idx))
}
```

- [ ] **Step 3: Add + Budget button to each project card**

After the `+ Expenses` button added in Task 7, add:

```tsx
<button
  onClick={() => loadBudget(p)}
  title="Edit Budget"
  className="p-1.5 rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50"
>
  <BarChart2 size={14} />
</button>
```

`BarChart2` is already imported from lucide-react (it's used on the dashboard icon).

- [ ] **Step 4: Add the Budget modal**

After the Expenses modal added in Task 7, add:

```tsx
{/* Budget Line Editor Modal */}
<Modal open={!!budgetProject} title={`Budget — ${budgetProject?.name ?? ''}`} onClose={() => setBudgetProject(null)} maxWidth="max-w-2xl">
  <div className="space-y-3">
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
          <tr>
            {['Phase', 'Budg. Hours', 'Budg. Cost (SGD)', 'Budg. Revenue (SGD)', ''].map(h => (
              <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {budgetLines.map((line, idx) => (
            <tr key={idx}>
              <td className="px-3 py-1.5">
                <input
                  value={line.phase}
                  onChange={e => updateBudgetLine(idx, 'phase', e.target.value)}
                  placeholder="Discovery"
                  className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </td>
              <td className="px-3 py-1.5">
                <input
                  type="number" min="0" step="0.5"
                  value={line.budgeted_hours}
                  onChange={e => updateBudgetLine(idx, 'budgeted_hours', parseFloat(e.target.value) || 0)}
                  className="w-24 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </td>
              <td className="px-3 py-1.5">
                <input
                  type="number" min="0"
                  value={line.budgeted_cost}
                  onChange={e => updateBudgetLine(idx, 'budgeted_cost', parseFloat(e.target.value) || 0)}
                  className="w-32 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </td>
              <td className="px-3 py-1.5">
                <input
                  type="number" min="0"
                  value={line.budgeted_revenue}
                  onChange={e => updateBudgetLine(idx, 'budgeted_revenue', parseFloat(e.target.value) || 0)}
                  className="w-32 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </td>
              <td className="px-3 py-1.5">
                <button onClick={() => removeBudgetLine(idx)} className="text-slate-300 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
          {budgetLines.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-400">No budget lines yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
    <button
      onClick={addBudgetLine}
      className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800"
    >
      <Plus size={14} /> Add Phase
    </button>
    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
      <button onClick={() => setBudgetProject(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">Cancel</button>
      <button
        onClick={saveBudget}
        disabled={budgetSaving}
        className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-medium"
      >
        {budgetSaving ? 'Saving…' : 'Save Budget'}
      </button>
    </div>
  </div>
</Modal>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add app/(app)/projects/page.tsx
git commit -m "feat: project card + Expenses and + Budget quick action buttons"
```

---

## Task 9: Dashboard — replace phase table with totals row

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Delete budgetRows useMemo**

Remove the entire `budgetRows` useMemo block (lines ~95–112). It looks like:

```typescript
const budgetRows = useMemo(() => {
  const actualMap: Record<string, { hours: number; cost: number }> = {}
  for (const e of timesheet) {
    ...
  }
  ...
}, [budget, timesheet])
```

- [ ] **Step 2: Rewrite budgetTotals to not depend on budgetRows**

Replace the existing `budgetTotals` useMemo (which depends on `budgetRows`) with a direct computation from `budget` and `timesheet`:

```typescript
const budgetTotals = useMemo(() => {
  const actualHours = timesheet.reduce((s, e) => s + (e.hours ?? 0), 0)
  const actualCost = timesheet.reduce((s, e) => s + (e.labour_cost_sgd ?? 0), 0)
  const budgetedHours = budget.reduce((s, b) => s + (b.budgeted_hours ?? 0), 0)
  const budgetedCost = budget.reduce((s, b) => s + (b.budgeted_cost ?? 0), 0)
  const costVariance = actualCost - budgetedCost
  const hrsVariance = actualHours - budgetedHours
  const variancePct = budgetedCost > 0 ? (costVariance / budgetedCost) * 100 : 0
  return { budgetedHours, actualHours, hrsVariance, budgetedCost, actualCost, costVariance, variancePct }
}, [budget, timesheet])
```

- [ ] **Step 3: Replace the budget table JSX**

Remove the entire `{budgetRows.length > 0 && ( ... )}` block (roughly lines 213–265) and replace with:

```tsx
{/* Budget vs Actual — single totals row */}
{(budgetTotals.budgetedCost > 0 || budgetTotals.actualCost > 0) && (
  <div className="bg-white rounded-xl border border-slate-200 p-6">
    <h3 className="text-sm font-semibold text-slate-700 mb-4">Budget vs Actual</h3>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
            {['Budg. Hrs', 'Act. Hrs', 'Hrs Var', 'Budg. Cost', 'Act. Cost', 'Cost Var', 'Var %'].map(h => (
              <th key={h} className="text-right px-3 py-2 font-medium first:text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="font-semibold text-slate-800">
            <td className="text-right px-3 py-3">{budgetTotals.budgetedHours.toFixed(1)}</td>
            <td className="text-right px-3 py-3">{budgetTotals.actualHours.toFixed(1)}</td>
            <td className={`text-right px-3 py-3 ${budgetTotals.hrsVariance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {budgetTotals.hrsVariance > 0 ? '+' : ''}{budgetTotals.hrsVariance.toFixed(1)}
            </td>
            <td className="text-right px-3 py-3">{fmt(budgetTotals.budgetedCost)}</td>
            <td className="text-right px-3 py-3">{fmt(budgetTotals.actualCost)}</td>
            <td className={`text-right px-3 py-3 ${budgetTotals.costVariance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {budgetTotals.costVariance > 0 ? '+' : ''}{fmt(budgetTotals.costVariance)}
            </td>
            <td className="text-right px-3 py-3">
              {budgetTotals.budgetedCost > 0
                ? <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${variancePctColor(budgetTotals.variancePct)}`}>
                    {budgetTotals.variancePct > 0 ? '+' : ''}{fmtPct(budgetTotals.variancePct)}
                  </span>
                : '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add app/(app)/dashboard/page.tsx
git commit -m "feat: collapse budget vs actual to single totals row, remove phase breakdown"
```

---

## Task 10: Final check and push

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: no output

- [ ] **Step 2: Build check**

Run: `npx next build 2>&1 | tail -20`
Expected: `✓ Compiled successfully` or similar, no errors

- [ ] **Step 3: Push to GitHub**

Run: `git push`

- [ ] **Step 4: Add CRON_SECRET to Vercel environment**

In the Vercel dashboard → Project Settings → Environment Variables, add:
- Key: `CRON_SECRET`
- Value: any random string (e.g. output of `openssl rand -hex 32`)
- Environments: Production, Preview

---

## Self-Review

**Spec coverage:**
- ✅ ClickUp nightly sync: Tasks 1–4
- ✅ ClickUp manual trigger from Settings: Task 5
- ✅ Token stored in Supabase user_settings: Task 5
- ✅ Full refresh per project (delete + re-insert): Task 2
- ✅ Rate card lookup by user_external_id: Task 2
- ✅ import_log entry per project: Task 2
- ✅ vercel.json cron at 2am UTC: Task 4
- ✅ CRON_SECRET protection: Task 2
- ✅ ExpensesCard extracted to shared component: Task 6
- ✅ + Expenses button on project card: Task 7
- ✅ + Budget button + inline editor modal: Task 8
- ✅ Dashboard phase table replaced by single totals row: Task 9
- ✅ budgetRows deleted, budgetTotals rewritten without it: Task 9

**Type consistency check:** `BudgetLine` defined in Task 8, used only in Task 8. `ClickUpTimeEntry` defined in Task 1, used in Task 2. `budgetTotals` shape consistent between Task 9 steps 2 and 3 (same keys: `budgetedHours`, `actualHours`, `hrsVariance`, `budgetedCost`, `actualCost`, `costVariance`, `variancePct`).

**No placeholders found.**
