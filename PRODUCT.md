# Product

<!-- impeccable:product-schema 1 -->

App-specific record for the profitability dashboard. PSGC-wide facts (team,
client-data confidentiality, accessibility baseline) live in the workspace root
`PRODUCT.md`; only what is unique to this app is recorded here.

## Platform

web

## Users

Adhi Nugroho, Senior Delivery Team Lead at PS Global Consulting (PSGC), is the
primary and currently the only confirmed user. He reviews delivery profitability
across the APAC NetSuite portfolio (~88 active engagements in Indonesia,
Singapore, Malaysia and Thailand), moving between a portfolio-level view and
individual projects. The app ships an RBAC model (admin / manager / user /
guest) and other audiences are technically provisioned, but no second audience
is confirmed as an actual user — do not design for PMs, finance or leadership
as primary readers without asking.

## Product Purpose

Tracks profitability per project and across the portfolio: revenue from billing
milestones set against manpower, expense and third-party vendor cost, resolving
to gross and net profit. It exists so a margin problem is visible while the
project is still running rather than at close. Success = the delivery lead can
see which engagements are losing money, and why, without assembling
spreadsheets by hand.

## Operating Context

The app aggregates data it does not own. Sources and nightly cadence (UTC):

| Source | Feeds | Sync |
|---|---|---|
| ClickUp time entries | Manpower cost | 02:00, all-time window |
| PMO ERP Billing Milestone Sheet (via the PSGC Dashboard's hourly `data_cache`) | Revenue | 02:30 |
| PSGC Project Tracker (`psgc_legacy_projects`) | PM, status, kick-off, go-live | 03:00 |
| Company expenses Google Sheet | Expense entries | 03:30 |
| 3rd Party Vendor Google Sheet | Vendor contracts | 04:00 |

Every sync also has a manual trigger in the UI. The Sheets and the Tracker are
the systems of record: the app reads and does not write back, so manual-entry
paths have been deliberately removed rather than maintained. `master_project` is
the canonical link hub joining these sources to projects by name.

## Capabilities and Constraints

- Profitability formulas, as specified by the user: Gross Profit = Revenue −
  SG&A; Total Cost = Manpower + Expenses + 3rd Party Vendor (SG&A deliberately
  excluded from Total Cost); Net Profit = Gross Profit − Total Cost. SG&A
  defaults to 30% of revenue and is configurable in Preferences.
- **Per-person cost is never displayed.** Individual rates and labour cost are
  confidential. Any per-person view — chart, table or drill-down — shows hours
  only; cost appears solely as an aggregate. Binding on all future work.
- 88 projects: 46 implementations plus 42 CSM support contracts merged in from
  the CSM monitoring data.
- The Postgres database (Supabase `dhgowqjfpvbbqrltjifz`) is shared with the
  sibling PSGC Dashboard app. `master_project`, `master_person`, `csm_projects`,
  `billing_milestones` and `data_cache` are read by both, so schema changes must
  not break the sibling.
- Long project names are a structural fact, not an edge case: names routinely
  exceed 80 characters and the billing sheet truncates at exactly 80, which the
  name matcher compensates for. Any layout showing a project name must handle
  this.
- Vendor `service` classification (Standard Services Delivery / Custom
  Services) is the one field this app owns rather than a sheet; the nightly sync
  carries it across the replace.

## Brand Commitments

Name in product: **PS Global — Profitability**. One of the PSGC internal tool
family, alongside the PSGC Dashboard and the manday calculator.

## Evidence on Hand

Live production data, not fixtures: 877 billing milestones, ~1,890 expense rows,
35 vendor contracts, ~39,000 tracked hours across 88 projects. Deployed to
Vercel project `ps-profitability-web-tzs2`. **Login is required**, so rendered
screenshots need the user — automated visual verification is not available to
future sessions; verify via type-check, build, and the deployed CSS/JS bundles.

## Product Principles

1. **Aggregate truth, never author it.** The Sheets and Tracker own the data.
   When a number looks wrong the fix belongs upstream or in the matcher, not in
   a manual override field.
2. **A margin problem should be visible in passing.** The reader is scanning,
   not investigating. Losses and outliers must surface without a query.
3. **Individual cost stays private.** Aggregate freely; never expose a person's
   rate or labour cost, directly or by arithmetic.
4. **Scanning many rows is the core motion.** Dense, consistent, sortable
   tables outrank expressive composition on every surface.

## Accessibility & Inclusion

Inherits the PSGC baseline from the root record: WCAG AA minimum,
keyboard-navigable controls, and contrast sufficient for laptop screens under
office lighting.
