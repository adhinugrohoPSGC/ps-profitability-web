import * as XLSX from 'xlsx'

function norm(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[\s_\-()/]/g, '')
}

function findCol(row: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(row)
  const normed = keys.map(norm)
  for (const c of candidates) {
    const idx = normed.indexOf(norm(c))
    if (idx !== -1) return row[keys[idx]]
  }
  return undefined
}

function toStr(v: unknown): string { return String(v ?? '').trim() }
function toNum(v: unknown): number { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }
function toDate(v: unknown): string {
  if (!v) return ''
  if (v instanceof Date) return v.toISOString().split('T')[0]
  // Excel serial date (days since 1899-12-30, accounting for the 1900 leap year bug)
  if (typeof v === 'number') return new Date((v - 25569) * 86400000).toISOString().split('T')[0]
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? String(v) : d.toISOString().split('T')[0]
}

export interface ExpenseRow {
  expense_date: string
  project_id: string
  identifier: string
  company_name: string
  country: string
  prs_prj: string
  sales_person: string
  pm: string
  resource: string
  category: string
  month: string
  billable_to_client: boolean
  amount_native: number
  currency: string
  amount_sgd_reported: number // sheet's own "Amount in SGD" column, 0 when absent
  _warnings: string[]
}

const VALID_EXPENSE_CATEGORIES = ['Travel', 'Accommodation', 'Meals & Entertainment', 'Overhead', 'Software & Tools', 'Miscellaneous', 'Daily Allowance', 'Transportation', 'Visa', 'Others']
const VALID_CURRENCIES = ['USD', 'IDR', 'SGD', 'EUR', 'GBP']

export function parseExpensesXLS(buffer: ArrayBuffer, defaultProjectId?: string, fxRate = 1): { rows: ExpenseRow[]; warnings: string[]; totalByCategory: Record<string, number> } {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.find(n => /expense/i.test(n)) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  const rows: ExpenseRow[] = []
  const globalWarnings: string[] = []
  const totalByCategory: Record<string, number> = {}

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    const amount = toAmount(findCol(r, ['Amount', 'amount', 'Amount in Actual Currency', 'Cost', 'Value']))
    if (amount <= 0) { globalWarnings.push(`Row ${i + 2}: Amount is 0 or negative — skipped`); continue }

    const category = toStr(findCol(r, ['Category', 'category', 'Expense Category', 'Type', 'Expense Type']))
    const currency = toStr(findCol(r, ['Currency', 'currency', 'CCY'])).toUpperCase() || 'SGD'

    const rowWarnings: string[] = []
    if (!VALID_EXPENSE_CATEGORIES.includes(category)) rowWarnings.push(`Unknown category: "${category}"`)
    if (!VALID_CURRENCIES.includes(currency)) rowWarnings.push(`Unknown currency: "${currency}"`)

    const amountSgd = currency === 'SGD' ? amount : currency === 'IDR' ? amount / fxRate : amount
    totalByCategory[category || 'Uncategorised'] = (totalByCategory[category || 'Uncategorised'] ?? 0) + amountSgd

    const expenseDate = toDate(findCol(r, ['Date', 'date', 'Expense Date']))

    rows.push({
      expense_date: expenseDate,
      project_id: toStr(findCol(r, ['Project Code / Name', 'Project ID', 'project_id', 'Project'])) || defaultProjectId || '',
      identifier: toStr(findCol(r, ['Identifier', 'identifier'])),
      company_name: toStr(findCol(r, ['Company Name', 'company_name'])),
      country: toStr(findCol(r, ['Country', 'country'])),
      prs_prj: toStr(findCol(r, ['PRS/PRJ', 'prs_prj'])) || 'Project',
      sales_person: toStr(findCol(r, ['Sales Person', 'sales_person'])),
      pm: toStr(findCol(r, ['PM', 'pm', 'Project Manager'])),
      resource: toStr(findCol(r, ['Resource', 'resource'])),
      category,
      month: toStr(findCol(r, ['Month', 'month'])) || (expenseDate ? expenseDate.slice(0, 7) : ''),
      billable_to_client: toStr(findCol(r, ['Billable to Client', 'billable_to_client', 'Billable'])).toLowerCase() === 'yes',
      amount_native: amount,
      currency,
      amount_sgd_reported: toAmount(findCol(r, ['Amount in SGD', 'Amount SGD', 'SGD Amount'])),
      _warnings: rowWarnings,
    })
  }

  return { rows, warnings: globalWarnings, totalByCategory }
}

// ── Billing milestones (PMO ERP Service Billing Milestone tracking) ────────

export interface BillingMilestoneRow {
  source_row: number
  project_owner: string
  country: string
  project_manager: string
  project_name: string
  quotation_source: string
  billing_milestone: string
  billing_status: string
  invoice_status: string
  quarter: string
  commitment: string
  baseline_date: string
  estimate_date: string
  invoice_date: string
  invoice_due_date: string
  amount_sgd: number
}

// Amounts may arrive as formatted strings ("4,051.21", "₱25,969.02")
function toAmount(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

export function parseBillingMilestonesXLS(buffer: ArrayBuffer): { rows: BillingMilestoneRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.find(n => /billing|milestone/i.test(n)) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  // Headers are not necessarily on row 1 — scan for the row containing "Project Name"
  const headerIdx = grid.findIndex(row =>
    Array.isArray(row) && row.some(c => norm(String(c ?? '')) === 'projectname'))
  if (headerIdx === -1) {
    throw new Error(`Could not find a header row containing "Project Name" in sheet "${sheetName}"`)
  }

  const headers = grid[headerIdx].map(h => norm(String(h ?? '')))
  const colIdx = (candidates: string[]): number => {
    for (const c of candidates) {
      const i = headers.indexOf(norm(c))
      if (i !== -1) return i
    }
    return -1
  }

  const cols = {
    project_owner: colIdx(['Project Owner', 'Owner']),
    country: colIdx(['Country']),
    project_manager: colIdx(['Project Manager', 'PM']),
    project_name: colIdx(['Project Name']),
    quotation_source: colIdx(['Quotation Source']),
    billing_milestone: colIdx(['Billing Milestone', 'Milestone']),
    billing_status: colIdx(['Billing Status']),
    invoice_status: colIdx(['Invoice Status']),
    quarter: colIdx(['Quarter']),
    commitment: colIdx(['Commitment']),
    baseline_date: colIdx(['Baseline Date', 'Baseline']),
    estimate_date: colIdx(['Estimate Date', 'Estimate']),
    invoice_date: colIdx(['Invoice Date']),
    invoice_due_date: colIdx(['Invoice Due Date', 'Due Date']),
    amount_sgd: colIdx(['Amount SGD', 'Amount (SGD)', 'Amount']),
  }

  const cell = (row: unknown[], i: number): unknown => (i === -1 ? undefined : row[i])
  const rows: BillingMilestoneRow[] = []
  const warnings: string[] = []

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i]
    if (!Array.isArray(r)) continue
    const projectName = toStr(cell(r, cols.project_name))
    if (!projectName) continue // blank / spacer / subtotal rows

    rows.push({
      source_row: i + 1, // sheet_to_json header:1 index 0 = Excel row 1
      project_owner: toStr(cell(r, cols.project_owner)),
      country: toStr(cell(r, cols.country)),
      project_manager: toStr(cell(r, cols.project_manager)),
      project_name: projectName,
      quotation_source: toStr(cell(r, cols.quotation_source)),
      billing_milestone: toStr(cell(r, cols.billing_milestone)),
      billing_status: toStr(cell(r, cols.billing_status)),
      invoice_status: toStr(cell(r, cols.invoice_status)),
      quarter: toStr(cell(r, cols.quarter)),
      commitment: toStr(cell(r, cols.commitment)),
      baseline_date: toDate(cell(r, cols.baseline_date)),
      estimate_date: toDate(cell(r, cols.estimate_date)),
      invoice_date: toDate(cell(r, cols.invoice_date)),
      invoice_due_date: toDate(cell(r, cols.invoice_due_date)),
      amount_sgd: toAmount(cell(r, cols.amount_sgd)),
    })
  }

  const missing = Object.entries(cols).filter(([, v]) => v === -1).map(([k]) => k)
  if (missing.length) warnings.push(`Columns not found in sheet "${sheetName}": ${missing.join(', ')}`)
  if (rows.length === 0) warnings.push(`No rows with a Project Name found in sheet "${sheetName}"`)

  return { rows, warnings }
}

