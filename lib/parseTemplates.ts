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
    overhead_rate_pct: toNum(get('SG&A %', 'sga_pct', 'Overhead Rate %', 'overhead_rate_pct', 'overhead')),
    notes: get('Notes', 'notes'),
    budget_lines: budgetLines,
  }
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

// Amounts in the billing sheet may arrive as formatted strings ("4,051.21")
function toAmount(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  const n = parseFloat(String(v ?? '').replace(/[,$\s]/g, ''))
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

// ── CSM contract monitoring ─────────────────────────────────────────────────

export interface CsmMonitoringRow {
  project_name: string
  contract_type: string
  assignee: string
  status: string
  start_date: string
  contract_end_date: string
  team: string
  transition_date: string
  total_contracted_hours: number
  total_billed_hours: number
  remaining_hours: number
  sales_amo: string
  country: string
  customer_health: string
  sgd_hourly_rate: number
  sgd_contract_total: number
  sgd_remaining: number
  extended_expiry_date: string
}

export function parseCsmMonitoringXLS(buffer: ArrayBuffer): { rows: CsmMonitoringRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.find(n => /csm|monitoring/i.test(n)) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  const rows: CsmMonitoringRow[] = []
  const warnings: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]
    const projectName = toStr(findCol(r, ['Project Name']))
    if (!projectName) continue

    rows.push({
      project_name: projectName,
      contract_type: toStr(findCol(r, ['Contract Type'])),
      assignee: toStr(findCol(r, ['Assignee'])),
      status: toStr(findCol(r, ['Status'])),
      start_date: toDate(findCol(r, ['Start Date'])),
      contract_end_date: toDate(findCol(r, ['Contract End Date'])),
      team: toStr(findCol(r, ['Team'])),
      transition_date: toDate(findCol(r, ['Transition Date'])),
      total_contracted_hours: toNum(findCol(r, ['Total Contracted Hours'])),
      total_billed_hours: toNum(findCol(r, ['Total Billed Hours'])),
      remaining_hours: toNum(findCol(r, ['Remaining Hours'])),
      sales_amo: toStr(findCol(r, ['Sales AMO'])),
      country: toStr(findCol(r, ['Country'])),
      customer_health: toStr(findCol(r, ['Customer Health'])),
      sgd_hourly_rate: toNum(findCol(r, ['SGD Hourly Rate'])),
      sgd_contract_total: toNum(findCol(r, ['SGD Contract Total'])),
      sgd_remaining: toNum(findCol(r, ['SGD Remaining'])),
      extended_expiry_date: toDate(findCol(r, ['Extended Expiry Date'])),
    })
  }

  if (rows.length === 0) warnings.push(`No rows with a Project Name found in sheet "${sheetName}"`)
  return { rows, warnings }
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
