const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, TableOfContents, LevelFormat,
  ExternalHyperlink, VerticalAlign,
} = require('docx');
const fs = require('fs');

const TEAL = '0d9488';
const TEAL_LIGHT = 'e6f7f6';
const SLATE = '1e293b';
const GRAY = '64748b';
const WHITE = 'FFFFFF';
const BORDER_COLOR = 'e2e8f0';

const border = (color = BORDER_COLOR) => ({ style: BorderStyle.SINGLE, size: 1, color });
const cellBorders = { top: border(), bottom: border(), left: border(), right: border() };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, color: TEAL, font: 'Arial' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TEAL, space: 6 } },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 100 },
    children: [new TextRun({ text, bold: true, size: 28, color: SLATE, font: 'Arial' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: TEAL, font: 'Arial' })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, size: 22, color: SLATE, font: 'Arial', ...opts })],
  });
}

function bold(text) {
  return new TextRun({ text, bold: true, size: 22, color: SLATE, font: 'Arial' });
}

function normal(text) {
  return new TextRun({ text, size: 22, color: SLATE, font: 'Arial' });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 22, color: SLATE, font: 'Arial' })],
  });
}

function numbered(children, level = 0) {
  return new Paragraph({
    numbering: { reference: 'numbered', level },
    spacing: { before: 60, after: 60 },
    children,
  });
}

function tip(text) {
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [440, 8586],
    margins: { top: 100, bottom: 100 },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: { top: border(TEAL), bottom: border(TEAL), left: border(TEAL), right: noBorder },
            width: { size: 440, type: WidthType.DXA },
            shading: { fill: TEAL_LIGHT, type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 120, right: 80 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'TIP', bold: true, size: 18, color: TEAL, font: 'Arial' })],
            })],
          }),
          new TableCell({
            borders: { top: border(TEAL), bottom: border(TEAL), left: noBorder, right: border(TEAL) },
            width: { size: 8586, type: WidthType.DXA },
            shading: { fill: TEAL_LIGHT, type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text, size: 20, color: SLATE, font: 'Arial' })],
            })],
          }),
        ],
      }),
    ],
  });
}

function spacer(pts = 120) {
  return new Paragraph({ spacing: { before: pts, after: 0 }, children: [] });
}

function infoTable(rows) {
  const COL1 = 2200, COL2 = 6826;
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [COL1, COL2],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            width: { size: COL1, type: WidthType.DXA },
            shading: { fill: 'f8fafc', type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Field', bold: true, size: 20, color: TEAL, font: 'Arial' })] })],
          }),
          new TableCell({
            borders: cellBorders,
            width: { size: COL2, type: WidthType.DXA },
            shading: { fill: 'f8fafc', type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true, size: 20, color: TEAL, font: 'Arial' })] })],
          }),
        ],
      }),
      ...rows.map(([field, desc]) => new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            width: { size: COL1, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: field, bold: true, size: 20, color: SLATE, font: 'Arial' })] })],
          }),
          new TableCell({
            borders: cellBorders,
            width: { size: COL2, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: desc, size: 20, color: GRAY, font: 'Arial' })] })],
          }),
        ],
      })),
    ],
  });
}

// ─── Document ─────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ],
      },
      {
        reference: 'numbered',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: SLATE } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: TEAL },
        paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: SLATE },
        paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: TEAL },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ],
  },
  sections: [
    // ── Cover Page ──────────────────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        spacer(2400),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 120 },
          children: [new TextRun({ text: 'PS GLOBAL CONSULTING', bold: true, size: 28, color: GRAY, font: 'Arial', allCaps: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 8 } },
          spacing: { before: 0, after: 200 },
          children: [],
        }),
        spacer(240),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 160 },
          children: [new TextRun({ text: 'Profitability Dashboard', bold: true, size: 64, color: TEAL, font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 400 },
          children: [new TextRun({ text: 'User Manual', size: 40, color: GRAY, font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 8 } },
          spacing: { before: 200, after: 120 },
          children: [],
        }),
        spacer(400),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'Version 1.0', size: 22, color: GRAY, font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: 'June 2026', size: 22, color: GRAY, font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new ExternalHyperlink({
            link: 'https://ps-profitability-web-tzs2.vercel.app',
            children: [new TextRun({ text: 'ps-profitability-web-tzs2.vercel.app', size: 22, color: TEAL, font: 'Arial' })],
          })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },

    // ── TOC + Body ──────────────────────────────────────────────────────────
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: TEAL, space: 4 } },
              children: [
                new TextRun({ text: 'PS Global Consulting  |  Profitability Dashboard User Manual', size: 18, color: GRAY, font: 'Arial' }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR, space: 4 } },
              children: [
                new TextRun({ text: 'Page ', size: 18, color: GRAY, font: 'Arial' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: TEAL, font: 'Arial' }),
                new TextRun({ text: ' of ', size: 18, color: GRAY, font: 'Arial' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: GRAY, font: 'Arial' }),
              ],
            }),
          ],
        }),
      },
      children: [
        // ── Table of Contents ──
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: false,
          children: [new TextRun({ text: 'Table of Contents', bold: true, size: 36, color: TEAL, font: 'Arial' })],
        }),
        new TableOfContents('Table of Contents', {
          hyperlink: true,
          headingStyleRange: '1-3',
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        // 1. INTRODUCTION
        // ══════════════════════════════════════════════════════════════════════
        h1('1. Introduction'),
        para('The PS Global Profitability Dashboard is an internal web application designed for PS Global Consulting team leads and project managers. It provides a centralised platform to track and analyse the financial performance of consulting projects — covering labour costs, expenses, billing, and overall profitability.'),
        spacer(),
        h2('1.1 What the Application Does'),
        bullet('Tracks consultant time and billing rates per project'),
        bullet('Records and categorises project expenses'),
        bullet('Calculates revenue, total cost, gross profit, and gross margin'),
        bullet('Generates detailed profitability reports in Excel format'),
        bullet('Compares actual spend against budgeted amounts by phase'),
        spacer(),
        h2('1.2 Who It Is For'),
        para('This application is intended for:'),
        bullet('Project Managers responsible for tracking project financial performance'),
        bullet('Team Leads who need visibility into consultant utilisation and costs'),
        bullet('Finance team members who prepare profitability reports'),
        spacer(),
        h2('1.3 How to Access'),
        para('The application is available at:'),
        spacer(80),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
          border: {
            top: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR },
            left: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR },
            right: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR },
          },
          children: [new ExternalHyperlink({
            link: 'https://ps-profitability-web-tzs2.vercel.app',
            children: [new TextRun({ text: 'https://ps-profitability-web-tzs2.vercel.app', bold: true, size: 24, color: TEAL, font: 'Arial' })],
          })],
        }),
        spacer(80),
        para('No login is required. The application opens directly to the Dashboard.'),
        spacer(),
        tip('Bookmark the URL in your browser for quick access. The app works in any modern browser — Chrome, Edge, Firefox, or Safari.'),

        // ══════════════════════════════════════════════════════════════════════
        // 2. NAVIGATION
        // ══════════════════════════════════════════════════════════════════════
        h1('2. Navigation Overview'),
        h2('2.1 Sidebar'),
        para('The left sidebar is always visible and provides navigation to all six sections of the application:'),
        spacer(),
        infoTable([
          ['Dashboard', 'View KPI cards, cost breakdown charts, and budget vs actual analysis for the selected project.'],
          ['Upload Templates', 'Import timesheet (.xlsx) and expense (.xlsx) data files into the system.'],
          ['Projects', 'Create, view, edit, and delete consulting projects.'],
          ['Rate Card Manager', 'Manage consultant billing and cost rates used for financial calculations.'],
          ['Reports', 'Generate and download multi-sheet Excel profitability reports.'],
          ['Settings', 'Configure company branding, currency rates, overhead method, and data management.'],
        ]),
        spacer(),
        h2('2.2 Top Bar'),
        para('The top bar appears on every page and shows:'),
        bullet('The current page title on the left'),
        bullet('A Project selector dropdown on the right — visible on Dashboard, Upload Templates, and Reports pages'),
        spacer(),
        para('Use the Project selector to switch between projects. The selected project determines which data is shown on those pages.'),
        spacer(),
        tip('The Project selector only appears on pages where data is project-specific. On other pages (Projects, Rate Card, Settings), it is hidden.'),

        // ══════════════════════════════════════════════════════════════════════
        // 3. GETTING STARTED
        // ══════════════════════════════════════════════════════════════════════
        h1('3. Getting Started'),
        para('Follow these four steps to set up your first project and start tracking profitability:'),
        spacer(120),
        h2('Step 1 — Create a Project'),
        numbered([bold('Go to '), normal('Projects'), bold(' in the sidebar.')]),
        numbered([normal('Click the '), bold('"New Project"'), normal(' button.')]),
        numbered([normal('Fill in the project details and click '), bold('Save'), normal('.')]),
        spacer(),
        h2('Step 2 — Add Consultant Rates'),
        numbered([bold('Go to '), normal('Rate Card Manager'), bold(' in the sidebar.')]),
        numbered([normal('Click '), bold('"Add Consultant"'), normal(' and enter billing and cost rates.')]),
        numbered([normal('Mark each consultant as '), bold('Active'), normal('.')]),
        spacer(),
        h2('Step 3 — Upload Timesheet and Expense Data'),
        numbered([bold('Go to '), normal('Upload Templates'), bold(' in the sidebar.')]),
        numbered([normal('Select your project from the '), bold('top bar dropdown'), normal('.')]),
        numbered([normal('Upload a timesheet .xlsx file and review the preview.')]),
        numbered([normal('Upload an expense .xlsx file and review the preview.')]),
        numbered([normal('Click '), bold('"Import"'), normal(' for each file to save the data.')]),
        spacer(),
        h2('Step 4 — View the Dashboard'),
        numbered([bold('Go to '), normal('Dashboard'), bold(' in the sidebar.')]),
        numbered([normal('Select your project from the '), bold('top bar dropdown'), normal('.')]),
        numbered([normal('Review KPI cards, charts, and the budget vs actual table.')]),
        spacer(),
        tip('Complete Steps 1 and 2 before uploading data. The fuzzy-matching algorithm in Upload Templates uses the Rate Card to automatically link consultant names in your timesheets.'),

        // ══════════════════════════════════════════════════════════════════════
        // 4. PROJECTS
        // ══════════════════════════════════════════════════════════════════════
        h1('4. Projects'),
        para('The Projects page is where you create and manage all consulting projects. Each project holds its own timesheet entries, expenses, and budget data.'),
        spacer(),
        h2('4.1 Creating a New Project'),
        numbered([normal('Click the '), bold('"New Project"'), normal(' button at the top right of the page.')]),
        numbered([normal('A form panel will appear. Fill in the project fields (see table below).')]),
        numbered([normal('Click '), bold('Save'), normal(' to create the project.')]),
        spacer(),
        infoTable([
          ['Project Name *', 'A descriptive name for the project (e.g., "Digital Transformation – Borneo Energy").'],
          ['Client Name', 'The name of the client organisation.'],
          ['Project Manager', 'The name of the project manager responsible.'],
          ['Start Date', 'Project kick-off date.'],
          ['End Date', 'Expected project completion date.'],
          ['Contract Value', 'Total value of the contract in the selected currency.'],
          ['Currency', 'SGD (Singapore Dollar) or USD (US Dollar).'],
          ['Billing Type', 'Fixed Fee — revenue is the contract value. T&M (Time & Materials) — revenue is calculated from billable hours.'],
          ['Overhead Rate %', 'Default overhead percentage applied to labour cost for profitability calculations.'],
          ['Notes', 'Any additional notes or context for the project.'],
        ]),
        spacer(80),
        para('* Required field'),
        spacer(),
        h2('4.2 Editing a Project'),
        para('Click the edit icon (pencil) on any project row to open the edit form. Make your changes and click Save.'),
        spacer(),
        h2('4.3 Deleting a Project'),
        para('Click the delete icon (trash) on a project row. A confirmation prompt will appear. Confirm to permanently delete the project and all associated data (timesheets, expenses, and budgets).'),
        spacer(),
        tip('Deleted projects cannot be recovered. Use Settings > Export JSON Backup regularly to save a copy of your data before making deletions.'),

        // ══════════════════════════════════════════════════════════════════════
        // 5. RATE CARD MANAGER
        // ══════════════════════════════════════════════════════════════════════
        h1('5. Rate Card Manager'),
        para('The Rate Card Manager stores billing and cost rates for all consultants. These rates are used to calculate labour costs and billable values when timesheet data is imported.'),
        spacer(),
        h2('5.1 Adding a Consultant'),
        numbered([normal('Click the '), bold('"Add Consultant"'), normal(' button.')]),
        numbered([normal('Fill in the consultant details (see table below).')]),
        numbered([normal('Toggle '), bold('Active'), normal(' to ON if the consultant is currently working on projects.')]),
        numbered([normal('Click '), bold('Save'), normal('.')]),
        spacer(),
        infoTable([
          ['Consultant Name *', 'Full name of the consultant. Must match (or closely match) the name used in timesheet files.'],
          ['Email', 'Consultant email address (optional, for reference).'],
          ['Role', 'Job title or role (e.g., Consultant, Senior Consultant, Manager).'],
          ['Cost Rate SGD', 'Internal cost per hour in Singapore Dollars.'],
          ['Cost Rate IDR', 'Internal cost per hour in Indonesian Rupiah.'],
          ['Bill Rate SGD', 'Billing rate to the client per hour in SGD.'],
          ['Bill Rate IDR', 'Billing rate to the client per hour in IDR.'],
          ['Effective From', 'Date from which these rates apply.'],
          ['Effective To', 'Date until which these rates apply (leave blank if ongoing).'],
          ['Active', 'Only active consultants are matched when importing timesheet data.'],
        ]),
        spacer(),
        h2('5.2 Editing and Deleting Consultants'),
        bullet('Click the edit icon on a consultant row to update their details.'),
        bullet('Click the delete icon to remove a consultant. This does not delete historical timesheet records that reference this consultant.'),
        spacer(),
        h2('5.3 Import from Excel'),
        numbered([normal('Click '), bold('"Import Excel"'), normal('.')]),
        numbered([normal('Select a .xlsx file with consultant data. The file should have columns matching the rate card fields.')]),
        numbered([normal('Review the imported entries and save.')]),
        spacer(),
        h2('5.4 Export to Excel'),
        para('Click "Export Excel" to download the current rate card as a .xlsx file. Useful for maintaining an offline backup or sharing with stakeholders.'),
        spacer(),
        tip('Consultant names in the Rate Card are used for fuzzy matching when uploading timesheets. If a name in a timesheet file is slightly different (e.g., "John Smith" vs "J. Smith"), the app will attempt to match it automatically. However, exact or very close matches produce the most reliable results.'),

        // ══════════════════════════════════════════════════════════════════════
        // 6. UPLOAD TEMPLATES
        // ══════════════════════════════════════════════════════════════════════
        h1('6. Upload Templates'),
        para('The Upload Templates page is used to import timesheet and expense data from Excel files. All financial calculations on the Dashboard are driven by this imported data.'),
        spacer(),
        h2('6.1 Before You Upload'),
        bullet('Select the correct project from the top bar Project dropdown.'),
        bullet('Ensure the Rate Card contains the consultants referenced in your timesheet file.'),
        bullet('Prepare your Excel files in .xlsx format.'),
        spacer(),
        h2('6.2 Uploading a Timesheet File'),
        numbered([normal('Select '), bold('Timesheet'), normal(' as the template type.')]),
        numbered([normal('Click the upload area or drag and drop your .xlsx file.')]),
        numbered([normal('The app will parse the file and display a preview table.')]),
        numbered([normal('Review the preview — consultant names highlighted in '), bold('orange'), normal(' indicate unmatched names (not found in the Rate Card).')]),
        numbered([normal('If all rows look correct, click '), bold('"Import"'), normal(' to save the data.')]),
        spacer(),
        h2('6.3 Uploading an Expense File'),
        numbered([normal('Select '), bold('Expenses'), normal(' as the template type.')]),
        numbered([normal('Click the upload area or drag and drop your .xlsx file.')]),
        numbered([normal('Review the preview table.')]),
        numbered([normal('Click '), bold('"Import"'), normal(' to save the data.')]),
        spacer(),
        h2('6.4 Import History'),
        para('Scroll to the bottom of the Upload Templates page to see a log of all previous imports, including filename, date, rows imported, and rows skipped.'),
        spacer(),
        tip('If you see many unmatched (orange) names in the preview, go to the Rate Card Manager and verify the consultant names. After updating the Rate Card, re-upload the file — the matching will be re-evaluated.'),

        // ══════════════════════════════════════════════════════════════════════
        // 7. DASHBOARD
        // ══════════════════════════════════════════════════════════════════════
        h1('7. Dashboard'),
        para('The Dashboard provides a real-time financial overview of the selected project, combining imported timesheet data, expense records, and project settings to calculate profitability metrics.'),
        spacer(),
        h2('7.1 Selecting a Project'),
        para('Use the Project dropdown in the top bar to select the project you want to analyse. All charts and tables update immediately.'),
        spacer(),
        h2('7.2 KPI Cards'),
        para('Four key performance indicator cards appear at the top of the Dashboard:'),
        spacer(),
        infoTable([
          ['Total Revenue', 'For Fixed Fee projects: the contract value. For T&M projects: total billable value from timesheet hours.'],
          ['Total Cost', 'Labour cost + direct expenses + overhead (calculated per the overhead method in Settings).'],
          ['Gross Profit', 'Total Revenue minus Total Cost. Shown in green if positive, red if negative.'],
          ['Gross Margin %', 'Gross Profit as a percentage of Revenue. Green = 30%+, Amber = 15–30%, Red = below 15%.'],
        ]),
        spacer(),
        h2('7.3 Cost Breakdown Chart'),
        para('A donut chart showing the proportion of costs split across three categories:'),
        bullet('Labour Cost — total cost of consultant hours'),
        bullet('Direct Expenses — non-overhead expense entries'),
        bullet('Overhead — calculated or logged overhead costs'),
        spacer(),
        h2('7.4 Labour Cost by Consultant'),
        para('A bar chart showing the labour cost contributed by each consultant on the project. Hover over a bar to see the consultant\'s total hours and cost.'),
        spacer(),
        h2('7.5 Budget vs Actual Table'),
        para('A detailed table comparing planned (budgeted) figures against actual figures, broken down by project phase:'),
        spacer(),
        infoTable([
          ['Phase', 'Project phase name (e.g., Design, Development, Testing).'],
          ['Budg. Hrs', 'Budgeted hours for this phase.'],
          ['Act. Hrs', 'Actual hours recorded in imported timesheets.'],
          ['Hrs Var', 'Variance (Actual - Budget). Positive = over budget (red), Negative = under budget (green).'],
          ['Budg. Cost', 'Budgeted labour cost for the phase (SGD).'],
          ['Act. Cost', 'Actual labour cost from imported timesheets (SGD).'],
          ['Cost Var', 'Cost variance (Actual - Budget) in SGD.'],
          ['Var %', 'Cost variance as a percentage of budgeted cost. Colour-coded: green (0–0%), amber (0–25% over), red (25%+ over).'],
        ]),
        spacer(),
        tip('Budget figures come from the Project Budget setup. If the Budget vs Actual table is empty, budget lines have not been added to the project yet.'),

        // ══════════════════════════════════════════════════════════════════════
        // 8. REPORTS
        // ══════════════════════════════════════════════════════════════════════
        h1('8. Reports'),
        para('The Reports page allows you to generate and download comprehensive profitability reports as multi-sheet Excel (.xlsx) files.'),
        spacer(),
        h2('8.1 Generating a Report'),
        numbered([normal('Select the project from the '), bold('top bar dropdown'), normal('.')]),
        numbered([normal('Configure report options such as date range and which sections to include.')]),
        numbered([normal('Click '), bold('"Generate Report"'), normal('.')]),
        numbered([normal('The report will download automatically as a .xlsx file.')]),
        spacer(),
        h2('8.2 Report Contents'),
        para('The generated Excel report includes multiple worksheets:'),
        bullet('Summary — overall KPIs, revenue, cost, margin'),
        bullet('Timesheet Detail — full list of timesheet entries with consultant, date, hours, and cost'),
        bullet('Expense Detail — all expense entries by category'),
        bullet('Budget vs Actual — phase-level comparison of budgeted and actual costs'),
        bullet('Additional analysis sheets depending on project configuration'),
        spacer(),
        tip('Open the downloaded .xlsx file in Microsoft Excel or Google Sheets. For best formatting results, use Microsoft Excel 2016 or later.'),

        // ══════════════════════════════════════════════════════════════════════
        // 9. SETTINGS
        // ══════════════════════════════════════════════════════════════════════
        h1('9. Settings'),
        para('The Settings page lets you configure application-wide preferences that affect how data is displayed and calculated across all projects.'),
        spacer(),
        h2('9.1 Company Branding'),
        infoTable([
          ['Company Name', 'Appears in the header of generated reports. Default: PS Global Consulting.'],
          ['Primary Colour', 'Accent colour used in reports. Enter a hex code (e.g., #0d9488) or use the colour picker.'],
        ]),
        spacer(),
        h2('9.2 Currency & FX'),
        infoTable([
          ['Default Currency', 'SGD (Singapore Dollar) or USD. Sets the display currency for the application.'],
          ['SGD to IDR Rate', 'Manual exchange rate used for IDR currency conversions in reports. Update this periodically to reflect current rates.'],
        ]),
        spacer(),
        h2('9.3 Overhead'),
        infoTable([
          ['Logged Expenses', 'Overhead is taken directly from expense entries categorised as "Overhead".'],
          ['Computed %', 'Overhead is calculated as a percentage of total labour cost (using the Default Rate % below).'],
          ['Both', 'Takes the higher of the logged overhead expenses and the computed percentage. Recommended for most projects.'],
          ['Default Rate %', 'The overhead percentage applied when using Computed % or Both methods. Applied per-project unless overridden in the project settings.'],
        ]),
        spacer(),
        h2('9.4 Data Management'),
        spacer(60),
        h3('Export JSON Backup'),
        para('Downloads all projects, rate cards, timesheets, and expenses as a single JSON file. Use this regularly as a data backup.'),
        spacer(60),
        h3('Import JSON Backup'),
        para('Restores data from a previously exported JSON backup file.'),
        spacer(60),
        h3('Clear All Data'),
        para('Permanently deletes all project data from the database — projects, timesheet entries, expense entries, and import history. Settings and rate card data are preserved.'),
        spacer(),
        new Paragraph({
          spacing: { before: 80, after: 80 },
          children: [
            new TextRun({ text: 'Warning: ', bold: true, size: 22, color: 'dc2626', font: 'Arial' }),
            new TextRun({ text: 'This action cannot be undone. You must type ', size: 22, color: SLATE, font: 'Arial' }),
            new TextRun({ text: 'DELETE', bold: true, size: 22, color: 'dc2626', font: 'Arial' }),
            new TextRun({ text: ' (all caps) in the confirmation box before the button becomes active.', size: 22, color: SLATE, font: 'Arial' }),
          ],
        }),

        // ══════════════════════════════════════════════════════════════════════
        // 10. TROUBLESHOOTING
        // ══════════════════════════════════════════════════════════════════════
        h1('10. Tips & Troubleshooting'),
        spacer(),
        infoTable([
          [
            'Timesheet names not matching',
            'Go to Rate Card Manager and verify consultant name spelling. The fuzzy matcher handles minor variations, but significantly different names (e.g., full name vs initials) may need to be corrected. After updating the Rate Card, re-upload the file.',
          ],
          [
            'Dashboard shows no data',
            'Ensure (1) a project is selected in the top bar, and (2) timesheet or expense data has been imported for that project via Upload Templates.',
          ],
          [
            'Data appears empty on first load',
            'The database may take 2–3 seconds to respond on the first request (especially after periods of inactivity on the free Supabase tier). Wait a few seconds and refresh the page.',
          ],
          [
            'Reports file won\'t open',
            'Reports are downloaded as .xlsx files. Open them with Microsoft Excel 2016+ or Google Sheets. If the file appears blank, check that the correct project was selected before generating.',
          ],
          [
            'Budget vs Actual table is empty',
            'Budget lines need to be added to the project. Go to the Projects page, edit the project, and add budget entries per phase.',
          ],
          [
            'Changes not saving in Settings',
            'Settings are auto-saved after a short delay (debounced). Wait 1–2 seconds after changing a setting before navigating away. A green "Saved" confirmation will appear next to each field.',
          ],
          [
            'Overhead calculation looks wrong',
            'Check Settings > Overhead to verify the method (Logged / Computed % / Both) and the default overhead rate percentage. Also check the per-project overhead rate in the Projects page.',
          ],
        ]),
        spacer(240),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: BORDER_COLOR, space: 8 } },
          spacing: { before: 240, after: 80 },
          children: [new TextRun({ text: 'PS Global Consulting  •  Profitability Dashboard  •  Internal Use Only', size: 18, color: GRAY, font: 'Arial' })],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  const out = 'PS-Global-Profitability-Dashboard-User-Manual.docx';
  fs.writeFileSync(out, buffer);
  console.log('Created: ' + out + ' (' + Math.round(buffer.length / 1024) + ' KB)');
});
