'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileBarChart2, Download, Loader2, CheckCircle2 } from 'lucide-react'
import ExcelJS from 'exceljs'
import { createClient } from '@/lib/supabase/client'
import { useProject } from '@/contexts/ProjectContext'

// ── Types ────────────────────────────────────────────────────────────────────
interface Project {
  id: string
  name: string
  client_name: string
  project_manager: string
  start_date: string
  end_date: string
  contract_value: number
  contract_currency: string
  billing_type: string
  overhead_rate_pct: number
  status: string
}

interface TimesheetEntry {
  id: number
  entry_date: string
  consultant_name: string
  phase: string
  task_description: string
  hours: number
  cost_rate_sgd: number
  labour_cost_sgd: number
  bill_rate_sgd: number
  billable_value_sgd: number
}

interface ExpenseEntry {
  id: number
  expense_date: string
  category: string
  description: string
  vendor: string
  amount_native: number
  currency: string
  fx_rate: number
  amount_sgd: number
  receipted: number
  paid_by: string
  notes: string
}

interface BudgetLine {
  phase: string
  budgeted_hours: number
  budgeted_cost: number
  budgeted_revenue: number
}

interface RateCardEntry {
  id: number
  consultant_name: string
  role: string
  cost_rate_sgd: number
  bill_rate_sgd: number
  effective_from: string
  active: boolean
}

interface Settings {
  company_name?: string
  overhead_method?: string
  overhead_rate_pct?: string
  usd_to_idr?: string
  [key: string]: string | undefined
}

// ── Colour helpers ────────────────────────────────────────────────────────────
const TEAL = 'FF0F766E'
const WHITE = 'FFFFFFFF'
const LIGHT_TEAL = 'FFf0fdfa'
const GREEN_FILL = 'FFd1fae5'
const AMBER_FILL = 'FFfef3c7'
const RED_FILL = 'FFfee2e2'
const GREY_FILL = 'FFf8fafc'

function marginArgb(pct: number): string {
  if (pct >= 30) return GREEN_FILL
  if (pct >= 15) return AMBER_FILL
  return RED_FILL
}

function varianceArgb(pct: number): string {
  if (pct <= 0) return GREEN_FILL
  if (pct <= 25) return AMBER_FILL
  return RED_FILL
}

function solidFill(argb: string): ExcelJS.FillPattern {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

// ── ExcelJS helpers ───────────────────────────────────────────────────────────
function headerRow(
  ws: ExcelJS.Worksheet,
  values: (string | number)[],
  bgArgb = TEAL,
  fgArgb = WHITE
): ExcelJS.Row {
  const row = ws.addRow(values)
  row.eachCell(cell => {
    cell.fill = solidFill(bgArgb)
    cell.font = { bold: true, color: { argb: fgArgb } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFe2e8f0' } },
    }
  })
  row.height = 22
  return row
}

function currencyFmt(cell: ExcelJS.Cell): void {
  cell.numFmt = '$#,##0.00'
}

function applyBorder(row: ExcelJS.Row, top = false, bottom = false): void {
  row.eachCell(cell => {
    cell.border = {
      ...(top ? { top: { style: 'thin', color: { argb: 'FF94a3b8' } } } : {}),
      ...(bottom ? { bottom: { style: 'thin', color: { argb: 'FF94a3b8' } } } : {}),
    }
  })
}

// ── Report generator ──────────────────────────────────────────────────────────
async function generateReport(opts: {
  project: Project
  timesheet: TimesheetEntry[]
  expenses: ExpenseEntry[]
  budget: BudgetLine[]
  rateCard: RateCardEntry[]
  settings: Settings
  sections: Record<string, boolean>
  companyName: string
  generatedAt: string
}): Promise<ArrayBuffer> {
  const { project, timesheet, expenses, budget, rateCard, settings, sections, companyName, generatedAt } = opts

  // Financial calcs
  const labourCost = timesheet.reduce((s, e) => s + (e.labour_cost_sgd ?? 0), 0)
  const directExpenses = expenses
    .filter(e => e.category?.toLowerCase() !== 'overhead')
    .reduce((s, e) => s + (e.amount_sgd ?? 0), 0)
  const overheadLogged = expenses
    .filter(e => e.category?.toLowerCase() === 'overhead')
    .reduce((s, e) => s + (e.amount_sgd ?? 0), 0)
  const overheadRatePct = project.overhead_rate_pct ?? parseFloat(settings.overhead_rate_pct ?? '0')
  const overhead = Math.max(overheadLogged, labourCost * (overheadRatePct / 100))
  const totalCost = labourCost + directExpenses + overhead
  const billableValue = timesheet.reduce((s, e) => s + (e.billable_value_sgd ?? 0), 0)
  const revenue = project.billing_type === 'T&M' ? billableValue : project.contract_value
  const grossProfit = revenue - totalCost
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  const wb = new ExcelJS.Workbook()
  wb.creator = 'PS Profitability Dashboard'
  wb.created = new Date()

  // ── Sheet 1: Summary ───────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('Summary')
    ws.columns = [
      { key: 'a', width: 30 },
      { key: 'b', width: 22 },
    ]

    // Title block
    const r1 = ws.addRow([companyName])
    r1.height = 30
    r1.getCell(1).fill = solidFill(TEAL)
    r1.getCell(1).font = { bold: true, color: { argb: WHITE }, size: 14 }
    ws.mergeCells(`A1:B1`)

    const r2 = ws.addRow(['PROJECT PROFITABILITY REPORT'])
    r2.height = 22
    r2.getCell(1).font = { bold: true, size: 12 }
    ws.mergeCells(`A2:B2`)

    ws.addRow([])
    ws.addRow(['Project', project.name])
    ws.addRow(['Client', project.client_name ?? ''])
    ws.addRow(['Project Manager', project.project_manager ?? ''])
    ws.addRow(['Period', `${project.start_date ?? ''} — ${project.end_date ?? ''}`])
    ws.addRow(['Generated', generatedAt])
    ws.addRow([])

    // KPI block
    const kpiHeaders = ws.addRow(['Metric', 'Value'])
    kpiHeaders.font = { bold: true }
    kpiHeaders.fill = solidFill(LIGHT_TEAL)

    const kpiData: [string, number][] = [
      ['Contract Value', revenue],
      ['Labour Cost', labourCost],
      ['Direct Expenses', directExpenses],
      ['Overhead', overhead],
      ['Total Cost', totalCost],
      ['Gross Profit', grossProfit],
    ]
    for (const [label, value] of kpiData) {
      const row = ws.addRow([label, value])
      currencyFmt(row.getCell(2))
      if (label === 'Total Cost') row.font = { bold: true }
      if (label === 'Gross Profit') {
        row.font = { bold: true, color: { argb: grossProfit >= 0 ? 'FF059669' : 'FFdc2626' } }
        row.getCell(2).fill = solidFill(grossProfit >= 0 ? GREEN_FILL : RED_FILL)
      }
    }
    const marginRow = ws.addRow(['Gross Margin %', grossMarginPct / 100])
    marginRow.font = { bold: true }
    marginRow.getCell(2).numFmt = '0.0%'
    marginRow.getCell(2).fill = solidFill(marginArgb(grossMarginPct))
  }

  // ── Sheet 2: Labour Detail ─────────────────────────────────────────────────
  if (sections.labourByConsultant || sections.labourByPhase) {
    const ws = wb.addWorksheet('Labour Detail')
    ws.columns = [
      { key: 'date', width: 12 },
      { key: 'consultant', width: 22 },
      { key: 'role', width: 16 },
      { key: 'phase', width: 16 },
      { key: 'task', width: 35 },
      { key: 'hours', width: 8 },
      { key: 'costRate', width: 12 },
      { key: 'labourCost', width: 14 },
      { key: 'billRate', width: 12 },
      { key: 'billable', width: 14 },
    ]
    headerRow(ws, ['Date', 'Consultant', 'Role', 'Phase', 'Task', 'Hours', 'Cost Rate', 'Labour Cost', 'Bill Rate', 'Billable Value'])

    let totalHours = 0, totalLabour = 0, totalBillable = 0
    for (const e of timesheet) {
      const rc = rateCard.find(r => r.consultant_name === e.consultant_name)
      const row = ws.addRow([
        e.entry_date,
        e.consultant_name,
        rc?.role ?? '',
        e.phase ?? '',
        e.task_description ?? '',
        e.hours,
        e.cost_rate_sgd,
        e.labour_cost_sgd,
        e.bill_rate_sgd,
        e.billable_value_sgd,
      ])
      // Conditional: orange if hours > 10
      if ((e.hours ?? 0) > 10) {
        row.getCell(6).fill = solidFill('FFFED7AA')
      }
      row.getCell(6).numFmt = '0.0'
      currencyFmt(row.getCell(7))
      currencyFmt(row.getCell(8))
      currencyFmt(row.getCell(9))
      currencyFmt(row.getCell(10))
      totalHours += e.hours ?? 0
      totalLabour += e.labour_cost_sgd ?? 0
      totalBillable += e.billable_value_sgd ?? 0
    }

    const tot = ws.addRow(['', '', '', '', 'TOTAL', totalHours, '', totalLabour, '', totalBillable])
    tot.font = { bold: true }
    tot.fill = solidFill(GREY_FILL)
    currencyFmt(tot.getCell(8))
    currencyFmt(tot.getCell(10))
    applyBorder(tot, true)
  }

  // ── Sheet 3: Labour by Consultant ──────────────────────────────────────────
  if (sections.labourByConsultant) {
    const ws = wb.addWorksheet('Labour by Consultant')
    ws.columns = [
      { key: 'consultant', width: 24 },
      { key: 'role', width: 16 },
      { key: 'hours', width: 12 },
      { key: 'avgRate', width: 14 },
      { key: 'labourCost', width: 16 },
      { key: 'billable', width: 16 },
    ]
    headerRow(ws, ['Consultant', 'Role', 'Total Hours', 'Avg Cost Rate', 'Total Labour Cost', 'Total Billable Value'])

    const consultantMap: Record<string, { role: string; hours: number; cost: number; billable: number }> = {}
    for (const e of timesheet) {
      const key = e.consultant_name ?? 'Unknown'
      const rc = rateCard.find(r => r.consultant_name === key)
      if (!consultantMap[key]) consultantMap[key] = { role: rc?.role ?? '', hours: 0, cost: 0, billable: 0 }
      consultantMap[key].hours += e.hours ?? 0
      consultantMap[key].cost += e.labour_cost_sgd ?? 0
      consultantMap[key].billable += e.billable_value_sgd ?? 0
    }

    const sorted = Object.entries(consultantMap).sort((a, b) => b[1].cost - a[1].cost)
    let rowIdx = 2
    let totH = 0, totC = 0, totB = 0
    for (const [name, data] of sorted) {
      const avgRate = data.hours > 0 ? data.cost / data.hours : 0
      const row = ws.addRow([name, data.role, data.hours, avgRate, data.cost, data.billable])
      if (rowIdx % 2 === 0) row.fill = solidFill('FFf8fafc')
      row.getCell(3).numFmt = '0.0'
      currencyFmt(row.getCell(4))
      currencyFmt(row.getCell(5))
      currencyFmt(row.getCell(6))
      totH += data.hours; totC += data.cost; totB += data.billable
      rowIdx++
    }

    const tot = ws.addRow(['TOTAL', '', totH, '', totC, totB])
    tot.font = { bold: true }
    tot.fill = solidFill(GREY_FILL)
    currencyFmt(tot.getCell(5))
    currencyFmt(tot.getCell(6))
    applyBorder(tot, true)
  }

  // ── Sheet 4: Labour by Phase ───────────────────────────────────────────────
  if (sections.labourByPhase) {
    const ws = wb.addWorksheet('Labour by Phase')
    ws.columns = [
      { key: 'phase', width: 20 },
      { key: 'budgH', width: 14 },
      { key: 'actH', width: 14 },
      { key: 'hVar', width: 14 },
      { key: 'budgC', width: 16 },
      { key: 'actC', width: 16 },
      { key: 'cVar', width: 16 },
      { key: 'varPct', width: 12 },
    ]
    headerRow(ws, ['Phase', 'Budg. Hours', 'Act. Hours', 'Hrs Variance', 'Budg. Cost', 'Act. Cost', 'Cost Variance', 'Variance %'])

    const actualMap: Record<string, { hours: number; cost: number }> = {}
    for (const e of timesheet) {
      const ph = e.phase ?? 'Unassigned'
      if (!actualMap[ph]) actualMap[ph] = { hours: 0, cost: 0 }
      actualMap[ph].hours += e.hours ?? 0
      actualMap[ph].cost += e.labour_cost_sgd ?? 0
    }
    const allPhases = new Set([...budget.map(b => b.phase), ...Object.keys(actualMap)])

    for (const phase of allPhases) {
      const bud = budget.find(b => b.phase === phase)
      const act = actualMap[phase] ?? { hours: 0, cost: 0 }
      const hVar = act.hours - (bud?.budgeted_hours ?? 0)
      const cVar = act.cost - (bud?.budgeted_cost ?? 0)
      const varPct = (bud?.budgeted_cost ?? 0) > 0 ? cVar / bud!.budgeted_cost : 0

      const row = ws.addRow([phase, bud?.budgeted_hours ?? 0, act.hours, hVar, bud?.budgeted_cost ?? 0, act.cost, cVar, varPct])
      row.getCell(2).numFmt = '0.0'
      row.getCell(3).numFmt = '0.0'
      row.getCell(4).numFmt = '0.0'
      currencyFmt(row.getCell(5))
      currencyFmt(row.getCell(6))
      currencyFmt(row.getCell(7))
      row.getCell(8).numFmt = '0.0%'
      // Traffic light on variance %
      if (varPct !== 0) {
        row.getCell(8).fill = solidFill(varianceArgb(varPct * 100))
      }
    }
  }

  // ── Sheet 5: Expenses ──────────────────────────────────────────────────────
  if (sections.expenseBreakdown) {
    const ws = wb.addWorksheet('Expenses')
    ws.columns = [
      { key: 'date', width: 12 },
      { key: 'cat', width: 18 },
      { key: 'desc', width: 30 },
      { key: 'vendor', width: 20 },
      { key: 'native', width: 16 },
      { key: 'ccy', width: 8 },
      { key: 'fx', width: 10 },
      { key: 'usd', width: 14 },
      { key: 'rec', width: 10 },
      { key: 'paidBy', width: 18 },
      { key: 'notes', width: 28 },
    ]
    headerRow(ws, ['Date', 'Category', 'Description', 'Vendor', 'Amount (Native)', 'Currency', 'FX Rate', 'Amount (SGD)', 'Receipted', 'Paid By', 'Notes'])

    // Group by category
    const categories = [...new Set(expenses.map(e => e.category ?? 'Uncategorized'))]
    for (const cat of categories) {
      const catExpenses = expenses.filter(e => (e.category ?? 'Uncategorized') === cat)
      let catTotal = 0
      for (const e of catExpenses) {
        const row = ws.addRow([
          e.expense_date,
          e.category,
          e.description,
          e.vendor,
          e.amount_native,
          e.currency,
          e.fx_rate,
          e.amount_sgd,
          e.receipted ? 'Yes' : 'No',
          e.paid_by,
          e.notes,
        ])
        if (!e.receipted) row.fill = solidFill(AMBER_FILL)
        row.getCell(5).numFmt = '#,##0.00'
        row.getCell(7).numFmt = '0.0000'
        currencyFmt(row.getCell(8))
        catTotal += e.amount_sgd ?? 0
      }
      const subTot = ws.addRow(['', `${cat} Subtotal`, '', '', '', '', '', catTotal])
      subTot.font = { bold: true, italic: true }
      subTot.fill = solidFill(GREY_FILL)
      currencyFmt(subTot.getCell(8))
    }
  }

  // ── Sheet 6: Overhead ──────────────────────────────────────────────────────
  if (sections.overheadCalc) {
    const ws = wb.addWorksheet('Overhead')
    ws.columns = [{ key: 'a', width: 30 }, { key: 'b', width: 20 }]

    headerRow(ws, ['Overhead Calculation', ''])
    ws.mergeCells(`A1:B1`)

    const overheadComputed = labourCost * (overheadRatePct / 100)
    ws.addRow(['Method', settings.overhead_method ?? 'computed'])
    ws.addRow(['Rate Applied', `${overheadRatePct}%`])

    const labourRow = ws.addRow(['Labour Cost Base', labourCost])
    currencyFmt(labourRow.getCell(2))

    const computedRow = ws.addRow(['Computed Overhead (rate × labour)', overheadComputed])
    currencyFmt(computedRow.getCell(2))

    const loggedRow = ws.addRow(['Logged Overhead (from expenses)', overheadLogged])
    currencyFmt(loggedRow.getCell(2))

    const usedRow = ws.addRow(['Overhead Used (MAX of above)', overhead])
    usedRow.font = { bold: true }
    usedRow.getCell(2).fill = solidFill(LIGHT_TEAL)
    currencyFmt(usedRow.getCell(2))
  }

  // ── Sheet 7: Budget vs Actual ──────────────────────────────────────────────
  if (sections.budgetVsActual) {
    const ws = wb.addWorksheet('Budget vs Actual')
    ws.columns = [
      { key: 'phase', width: 20 },
      { key: 'budg', width: 16 },
      { key: 'act', width: 16 },
      { key: 'varD', width: 16 },
      { key: 'varP', width: 12 },
    ]
    headerRow(ws, ['Phase', 'Budgeted', 'Actual', 'Variance $', 'Variance %'])

    const actualCostMap: Record<string, number> = {}
    for (const e of timesheet) {
      const ph = e.phase ?? 'Unassigned'
      actualCostMap[ph] = (actualCostMap[ph] ?? 0) + (e.labour_cost_sgd ?? 0)
    }

    let totBudg = 0, totAct = 0
    for (const b of budget) {
      const act = actualCostMap[b.phase] ?? 0
      const varD = act - b.budgeted_cost
      const varP = b.budgeted_cost > 0 ? varD / b.budgeted_cost : 0
      const row = ws.addRow([b.phase, b.budgeted_cost, act, varD, varP])
      currencyFmt(row.getCell(2))
      currencyFmt(row.getCell(3))
      currencyFmt(row.getCell(4))
      row.getCell(5).numFmt = '0.0%'
      row.getCell(5).fill = solidFill(varianceArgb(varP * 100))
      totBudg += b.budgeted_cost; totAct += act
    }

    const tot = ws.addRow(['TOTAL', totBudg, totAct, totAct - totBudg, totBudg > 0 ? (totAct - totBudg) / totBudg : 0])
    tot.font = { bold: true }
    tot.fill = solidFill(GREY_FILL)
    currencyFmt(tot.getCell(2))
    currencyFmt(tot.getCell(3))
    currencyFmt(tot.getCell(4))
    tot.getCell(5).numFmt = '0.0%'
    applyBorder(tot, true)
  }

  // ── Sheet 8: Rate Card (optional) ─────────────────────────────────────────
  if (sections.rateCard) {
    const ws = wb.addWorksheet('Rate Card')
    ws.columns = [
      { key: 'name', width: 24 },
      { key: 'role', width: 16 },
      { key: 'cost', width: 14 },
      { key: 'bill', width: 14 },
      { key: 'from', width: 14 },
    ]
    headerRow(ws, ['Consultant', 'Role', 'Cost Rate SGD', 'Bill Rate SGD', 'Effective From'])

    const activeRates = rateCard.filter(r => r.active)
    for (const r of activeRates) {
      const row = ws.addRow([r.consultant_name, r.role, r.cost_rate_sgd, r.bill_rate_sgd, r.effective_from])
      currencyFmt(row.getCell(3))
      currencyFmt(row.getCell(4))
    }
  }

  return wb.xlsx.writeBuffer()
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { selectedProject } = useProject()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [reportType, setReportType] = useState<'summary' | 'full' | 'executive'>('full')
  const [currency, setCurrency] = useState<'sgd' | 'idr' | 'both'>('sgd')
  const [sections, setSections] = useState({
    labourByConsultant: true,
    labourByPhase: true,
    expenseBreakdown: true,
    overheadCalc: true,
    budgetVsActual: true,
    kpiSummary: true,
    rateCard: false,
  })
  const [generating, setGenerating] = useState(false)
  const [lastGenerated, setLastGenerated] = useState<string | null>(null)

  useEffect(() => {
    createClient().from('projects').select('*').order('name')
      .then(({ data }) => setProjects((data as Project[]) ?? []))
  }, [])

  useEffect(() => {
    if (selectedProject) setProjectId(selectedProject)
  }, [selectedProject])

  const selectedProj = projects.find(p => p.id === projectId)

  const sectionLabels: { key: keyof typeof sections; label: string }[] = [
    { key: 'labourByConsultant', label: 'Labour Cost by Consultant' },
    { key: 'labourByPhase', label: 'Labour Cost by Phase' },
    { key: 'expenseBreakdown', label: 'Expense Breakdown' },
    { key: 'overheadCalc', label: 'Overhead Calculation' },
    { key: 'budgetVsActual', label: 'Budget vs Actual' },
    { key: 'kpiSummary', label: 'KPI Summary' },
    { key: 'rateCard', label: 'Rate Card (optional)' },
  ]

  const sheetList = [
    '1. Summary',
    sections.labourByConsultant || sections.labourByPhase ? '2. Labour Detail' : null,
    sections.labourByConsultant ? '3. Labour by Consultant' : null,
    sections.labourByPhase ? '4. Labour by Phase' : null,
    sections.expenseBreakdown ? '5. Expenses' : null,
    sections.overheadCalc ? '6. Overhead' : null,
    sections.budgetVsActual ? '7. Budget vs Actual' : null,
    sections.rateCard ? '8. Rate Card' : null,
  ].filter(Boolean) as string[]

  const handleGenerate = useCallback(async () => {
    if (!projectId) return
    setGenerating(true)
    try {
      const sb = createClient()
      const [proj, ts, exp, bud, rc, settRaw] = await Promise.all([
        sb.from('projects').select('*').eq('id', projectId).single(),
        sb.from('timesheet_entries').select('*').eq('project_id', projectId),
        sb.from('expense_entries').select('*').eq('project_id', projectId),
        sb.from('project_budget').select('*').eq('project_id', projectId),
        sb.from('rate_card').select('*').eq('active', true),
        sb.from('user_settings').select('key, value'),
      ])
      const settings: Record<string, string> = {}
      ;((settRaw.data ?? []) as { key: string; value: string }[]).forEach(({ key, value }) => {
        settings[key] = value
      })
      const buffer = await generateReport({
        project: proj.data as Project,
        timesheet: (ts.data ?? []) as TimesheetEntry[],
        expenses: (exp.data ?? []) as ExpenseEntry[],
        budget: (bud.data ?? []) as BudgetLine[],
        rateCard: (rc.data ?? []) as RateCardEntry[],
        settings,
        sections,
        companyName: settings['company_name'] ?? 'PS Global Consulting',
        generatedAt: new Date().toLocaleString(),
      })
      const projectName = ((proj.data as Project)?.name ?? 'Report').replace(/[^a-z0-9]/gi, '-')
      const defaultName = `Profitability-${projectName}-Report.xlsx`
      // Browser download — replaces dialog:saveFile + fs:writeFile
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = defaultName; a.click()
      URL.revokeObjectURL(url)
      setLastGenerated(defaultName)
    } catch (err) {
      console.error('Report generation failed', err)
    } finally {
      setGenerating(false)
    }
  }, [projectId, sections])

  return (
    <div className="flex gap-6 h-full">
      {/* ── Left: Config panel ─────────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-5 overflow-y-auto">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <FileBarChart2 size={16} className="text-teal-600" />
            Report Configuration
          </h3>

          {/* Project selector */}
          <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">— Select a project —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Date Range</label>
          <div className="flex gap-2">
            <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg text-xs px-2 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
              className="flex-1 border border-slate-200 rounded-lg text-xs px-2 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        </div>

        {/* Report type */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">Report Type</label>
          <div className="space-y-1.5">
            {([['summary', 'Summary Only'], ['full', 'Full Detail'], ['executive', 'Executive Summary']] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input type="radio" name="reportType" value={v} checked={reportType === v}
                  onChange={() => setReportType(v)} className="accent-teal-600" />
                {l}
              </label>
            ))}
          </div>
        </div>

        {/* Currency */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">Reporting Currency</label>
          <div className="flex gap-3">
            {([['sgd', 'SGD'], ['idr', 'IDR'], ['both', 'Both']] as const).map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-700">
                <input type="radio" name="currency" value={v} checked={currency === v}
                  onChange={() => setCurrency(v)} className="accent-teal-600" />
                {l}
              </label>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-2">Include Sections</label>
          <div className="space-y-1.5">
            {sectionLabels.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={sections[key]}
                  onChange={e => setSections(s => ({ ...s, [key]: e.target.checked }))}
                  className="accent-teal-600"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!projectId || generating}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          {generating ? (
            <><Loader2 size={16} className="animate-spin" /> Generating…</>
          ) : (
            <><Download size={16} /> Generate Report</>
          )}
        </button>

        {lastGenerated && (
          <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
            <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
            <span>Downloaded: {lastGenerated}</span>
          </div>
        )}
      </div>

      {/* ── Right: Preview panel ───────────────────────────────────────────── */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 p-6 overflow-y-auto">
        {!selectedProj ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <FileBarChart2 className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm">Select a project to see the report preview</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Report Preview</h2>
              <p className="text-xs text-slate-400">What will be generated when you click Generate Report</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Project</p>
                <p className="text-sm font-semibold text-slate-800">{selectedProj.name}</p>
                <p className="text-xs text-slate-500">{selectedProj.client_name}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Period</p>
                <p className="text-sm text-slate-700">
                  {dateStart || selectedProj.start_date || '(all dates)'} → {dateEnd || selectedProj.end_date || '(all dates)'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Report Type</p>
                <p className="text-sm text-slate-700 capitalize">{reportType.replace('-', ' ')}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Currency</p>
                <p className="text-sm text-slate-700 uppercase">{currency}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Sheets to be generated ({sheetList.length})</p>
              <div className="space-y-1">
                {sheetList.map(sheet => (
                  <div key={sheet} className="flex items-center gap-2 text-sm text-slate-700 bg-teal-50 rounded px-3 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
                    {sheet}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
