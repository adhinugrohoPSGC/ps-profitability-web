-- Run this in the Supabase SQL editor for your project
-- dashboard: https://supabase.com/dashboard → SQL Editor

-- Rate Card
CREATE TABLE IF NOT EXISTS rate_card (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  consultant_name TEXT NOT NULL,
  email       TEXT,
  role        TEXT,
  cost_rate_sgd REAL DEFAULT 0,
  cost_rate_idr REAL DEFAULT 0,
  bill_rate_sgd REAL DEFAULT 0,
  bill_rate_idr REAL DEFAULT 0,
  effective_from DATE,
  effective_to   DATE,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Name Aliases (timesheet fuzzy-match memory)
CREATE TABLE IF NOT EXISTS name_aliases (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  alias       TEXT NOT NULL,
  rate_card_id BIGINT REFERENCES rate_card(id) ON DELETE SET NULL,
  UNIQUE(user_id, alias)
);

-- Projects (UUID primary key — no user-typed IDs)
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  name        TEXT NOT NULL,
  client_name TEXT,
  project_manager TEXT,
  start_date  DATE,
  end_date    DATE,
  contract_value  REAL DEFAULT 0,
  contract_currency TEXT DEFAULT 'SGD',
  billing_type TEXT DEFAULT 'Fixed Fee',
  phases      TEXT DEFAULT '[]',
  overhead_rate_pct REAL DEFAULT 12,
  status      TEXT DEFAULT 'active',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Project Budget Lines
CREATE TABLE IF NOT EXISTS project_budget (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase       TEXT,
  budgeted_hours  REAL DEFAULT 0,
  budgeted_cost   REAL DEFAULT 0,
  budgeted_revenue REAL DEFAULT 0
);

-- Timesheet Entries
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_date  DATE NOT NULL,
  consultant_name TEXT,
  rate_card_id BIGINT REFERENCES rate_card(id) ON DELETE SET NULL,
  task_description TEXT,
  phase       TEXT,
  hours       REAL DEFAULT 0,
  cost_rate_sgd   REAL DEFAULT 0,
  labour_cost_sgd REAL DEFAULT 0,
  bill_rate_sgd   REAL DEFAULT 0,
  billable_value_sgd REAL DEFAULT 0,
  import_batch_id TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Entries
CREATE TABLE IF NOT EXISTS expense_entries (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  category    TEXT,
  description TEXT,
  vendor      TEXT,
  amount_native REAL DEFAULT 0,
  currency    TEXT DEFAULT 'SGD',
  fx_rate     REAL DEFAULT 1,
  amount_sgd  REAL DEFAULT 0,
  paid_by     TEXT,
  receipted   BOOLEAN DEFAULT false,
  notes       TEXT,
  import_batch_id TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Import Log
CREATE TABLE IF NOT EXISTS import_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  batch_id    TEXT,
  project_id  UUID,
  template_type TEXT,
  filename    TEXT,
  rows_imported INTEGER DEFAULT 0,
  rows_skipped  INTEGER DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, batch_id)
);

-- User Settings (key-value per user)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  key         TEXT NOT NULL,
  value       TEXT,
  PRIMARY KEY (user_id, key)
);

-- Enable Row Level Security
ALTER TABLE rate_card        ENABLE ROW LEVEL SECURITY;
ALTER TABLE name_aliases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_budget   ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings    ENABLE ROW LEVEL SECURITY;

-- RLS: each user only sees/modifies their own rows
CREATE POLICY own_data ON rate_card        FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY own_data ON name_aliases     FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY own_data ON projects         FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY own_data ON project_budget   FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY own_data ON timesheet_entries FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY own_data ON expense_entries  FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY own_data ON import_log       FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY own_data ON user_settings    FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_project_budget_project_id    ON project_budget(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budget_user_id       ON project_budget(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_project_id ON timesheet_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_user_id    ON timesheet_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_entries_project_id   ON expense_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_expense_entries_user_id      ON expense_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id             ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_user_id            ON rate_card(user_id);
