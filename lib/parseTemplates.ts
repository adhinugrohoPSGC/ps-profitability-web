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

export interface TimesheetRow {
  entry_date: string
  consultant_name: string
  user_external_id: string
  task_description: string
  project_id: string
  external_project_id: string
  phase: string
  hours: number
  _warnings: string[]
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
  _warnings: string[]
}

export interface ProjectInfoData {
  id: string
  name: string
  project_manager: string
  start_date: string
  end_date: string
  contract_value: number
  contract_currency: string
  billing_type: string
  phases: string
  overhead_rate_pct: number
  notes: string
  budget_lines: { phase: string; budgeted_hours: number; budgeted_cost: number; budgeted_revenue: number }[]
}

const VALID_EXPENSE_CATEGORIES = ['Travel', 'Accommodation', 'Meals & Entertainment', 'Overhead', 'Software & Tools', 'Miscellaneous', 'Daily Allowance', 'Transportation', 'Visa', 'Others']
const VALID_CURRENCIES = ['USD', 'IDR', 'SGD', 'EUR', 'GBP']

export function parseTimesheetXLS(buffer: ArrayBuffer, defaultProjectId?: string): { rows: TimesheetRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.find(n => /timesheet/i.test(n)) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  const today = new Date().toISOString().split('T')[0]
  const rows: TimesheetRow[] = []
  const globalWarnings: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    const rowWarnings: string[] = []

    const hours = toNum(findCol(r, ['Hours', 'hours', 'Hrs', 'hrs', 'Time']))
    if (hours <= 0) { globalWarnings.push(`Row ${i + 2}: Hours is 0 or empty — skipped`); continue }

    // Support both old format (Consultant Name) and new format (User Name)
    const name = toStr(findCol(r, ['User Name', 'Consultant Name', 'Consultant', 'Name', 'Resource', 'Employee']))
    const userId = toStr(findCol(r, ['User ID', 'UserID', 'user_id']))
    const externalProjectId = toStr(findCol(r, ['Project ID', 'ProjectID', 'project_id', 'Project']))
    const date = toDate(findCol(r, ['Date', 'date', 'Entry Date', 'Work Date'])) || today
    const phase = toStr(findCol(r, ['Phase', 'phase', 'Stage', 'Category', 'Activity']))
    const task = toStr(findCol(r, ['Task', 'Task / Description', 'Description', 'Task Description', 'Activity']))

    if (!name) rowWarnings.push('Missing consultant name')

    rows.push({
      entry_date: date,
      consultant_name: name,
      user_external_id: userId,
      task_description: task,
      project_id: externalProjectId || defaultProjectId || '',
      external_project_id: externalProjectId,
      phase,
      hours,
      _warnings: rowWarnings,
    })
  }

  return { rows, warnings: globalWarnings }
}

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
    const amount = toNum(findCol(r, ['Amount', 'amount', 'Amount in Actual Currency', 'Cost', 'Value']))
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
      _warnings: rowWarnings,
    })
  }

  return { rows, warnings: globalWarnings, totalByCategory }
}

export function parseProjectInfoXLS(buffer: ArrayBuffer): ProjectInfoData {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  // Parse key-value pairs from "Project Info" sheet
  const infoSheet = wb.Sheets['Project Info'] ?? wb.Sheets[wb.SheetNames[0]]
  const infoRows = XLSX.utils.sheet_to_json<unknown[]>(infoSheet, { header: 1, defval: '' }) as unknown[][]

  const kv: Record<string, string> = {}
  for (const row of infoRows) {
    if (Array.isArray(row) && row.length >= 2) {
      const key = String(row[0] ?? '').trim().toLowerCase().replace(/[\s/]/g, '_')
      const val = String(row[1] ?? '').trim()
      if (key) kv[key] = val
    }
  }

  const get = (...keys: string[]) => keys.map(k => kv[k.toLowerCase().replace(/[\s/]/g, '_')] || '').find(v => v) ?? ''

  // Parse Budget sheet if present
  const budgetLines: ProjectInfoData['budget_lines'] = []
  const budgetSheet = wb.Sheets['Budget']
  if (budgetSheet) {
    const bRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(budgetSheet, { defval: '' })
    for (const r of bRows) {
      const phase = toStr(findCol(r, ['Phase', 'Phase / Milestone', 'Category']))
      if (!phase) continue
      budgetLines.push({
        phase,
        budgeted_hours: toNum(findCol(r, ['Budgeted Hours', 'Hours', 'Planned Hours'])),
        budgeted_cost: toNum(findCol(r, ['Budgeted Cost', 'Cost', 'Budget Cost'])),
        budgeted_revenue: toNum(findCol(r, ['Budgeted Revenue', 'Revenue'])),
      })
    }
  }

  return {
    id: get('Project ID', 'project_id') || `PRJ-${Date.now()}`,
    name: get('Project Name', 'project_name', 'name'),
    project_manager: get('Project Manager', 'pm', 'manager'),
    start_date: toDate(get('Start Date', 'start_date', 'start')),
    end_date: toDate(get('End Date', 'end_date', 'end')),
    contract_value: toNum(get('Contract Value', 'value', 'contract_value', 'total_contract_value_revenue')),
    contract_currency: get('Contract Currency', 'currency') || 'USD',
    billing_type: get('Billing Type', 'billing_type', 'type') || 'Fixed Fee',
    phases: get('Phases', 'phases'),
    overhead_rate_pct: toNum(get('Overhead Rate %', 'overhead_rate_pct', 'overhead')),
    notes: get('Notes', 'notes'),
    budget_lines: budgetLines,
  }
}

// ── Blank template generators ──────────────────────────────────────────────

export function generateTimesheetTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  // Matches the ClickUp / external timesheet export format
  const headers = ['Date', 'User ID', 'User Name', 'Project ID', 'Hours']
  const examples = [
    ['2025-05-01', 101059714, 'Alice Tan', 90168316816, 8],
    ['2025-05-02', 100907985, 'Bob Lim', 90168316816, 6],
    ['2025-05-03', 37681318, 'Alice Tan', 90168316816, 4],
    ['2025-05-04', 95071170, 'Charlie Wong', 90168316816, 2],
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples])
  ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 8 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Timesheet')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return buf
}

export function generateExpensesTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const headers = [
    'Identifier', 'Company Name', 'Country', 'Project Code / Name', 'PRS/PRJ', 'Sales Person', 'PM', 'Resource',
    'Expense Category', 'Date', 'Month', 'Billable to Client', 'Currency', 'Amount in Actual Currency',
  ]
  const examples = [
    ['SGD-2025-001', 'ZAP Clinic', 'Singapore', 'ZAP-001', 'Project', 'Jane Tan', 'Alice Tan', 'Bob Lim',
      'Travel', '2025-05-01', 'May-2025', 'Yes', 'SGD', 620],
    ['SGD-2025-002', 'ZAP Clinic', 'Singapore', 'ZAP-001', 'Project', 'Jane Tan', 'Alice Tan', 'Bob Lim',
      'Accommodation', '2025-05-02', 'May-2025', 'Yes', 'SGD', 420],
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples])
  ws['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
    { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return buf
}

export function generateProjectInfoTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new()

  // Project Info sheet (key-value)
  const infoData = [
    ['Field', 'Value'],
    ['Project ID', 'ZAP-001'],
    ['Project Name', 'Zap Cloud ERP Implementation'],
    ['Project Manager', 'Alice Tan'],
    ['Start Date', '2025-01-01'],
    ['End Date', '2025-06-30'],
    ['Contract Value', 150000],
    ['Contract Currency', 'SGD'],
    ['Billing Type', 'Fixed Fee'],
    ['Phases', 'Discovery,Design,Build,Testing,Go-Live'],
    ['Notes', 'NetSuite ERP implementation project'],
  ]
  const infoWs = XLSX.utils.aoa_to_sheet(infoData)
  infoWs['!cols'] = [{ wch: 25 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, infoWs, 'Project Info')

  // Budget sheet
  const budgetHeaders = ['Phase / Milestone', 'Budgeted Hours', 'Budgeted Cost', 'Budgeted Revenue']
  const budgetData = [
    ['Discovery', 80, 12000, 18000],
    ['Design', 120, 18000, 27000],
    ['Build', 200, 30000, 45000],
    ['Testing', 100, 15000, 22500],
    ['Go-Live', 60, 9000, 13500],
  ]
  const budgetWs = XLSX.utils.aoa_to_sheet([budgetHeaders, ...budgetData])
  budgetWs['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, budgetWs, 'Budget')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return buf
}
