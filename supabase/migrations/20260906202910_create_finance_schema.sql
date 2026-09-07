/*
# Personal Finance Tracker — Core Schema

1. New Tables
- `categories`: inflow/outflow categories with tag association and sort order
- `accounts`: payment method labels (cash, bank, card, UPI, wallet, etc.)
- `transactions`: individual inflow/outflow records with optional merchant, notes, tags, attachments
- `budgets`: overall and category-specific monthly budgets
- `recurring_transactions`: recurring inflow/outflow templates with notification settings
- `payee_rules`: auto-categorization rules based on merchant/payee name
- `app_settings`: key-value store for user preferences (currency, date format, theme, AI config)

2. Security
- Single-tenant app (no sign-in). RLS enabled on all tables.
- All policies use `TO anon, authenticated` with `USING (true)` — data is intentionally shared/local.
- This is a personal finance app where the data belongs to the single user.

3. Notes
- Categories carry a default tag (Need/Want/Invest/Transfer)
- Transactions can override the tag per-transaction
- Payee rules auto-assign category based on merchant name (toggleable, on by default)
- Settings stored as key-value for flexibility
*/

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_app_settings" ON app_settings;
CREATE POLICY "anon_select_app_settings" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_app_settings" ON app_settings;
CREATE POLICY "anon_insert_app_settings" ON app_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_app_settings" ON app_settings;
CREATE POLICY "anon_update_app_settings" ON app_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_app_settings" ON app_settings;
CREATE POLICY "anon_delete_app_settings" ON app_settings FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('inflow', 'outflow')),
  tag text NOT NULL DEFAULT 'Want' CHECK (tag IN ('Need', 'Want', 'Invest', 'Transfer')),
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  icon text,
  color text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('cash', 'bank', 'credit_card', 'debit_card', 'upi', 'wallet', 'other')),
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_accounts" ON accounts;
CREATE POLICY "anon_select_accounts" ON accounts FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_accounts" ON accounts;
CREATE POLICY "anon_insert_accounts" ON accounts FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_accounts" ON accounts;
CREATE POLICY "anon_update_accounts" ON accounts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_accounts" ON accounts;
CREATE POLICY "anon_delete_accounts" ON accounts FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('inflow', 'outflow')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  merchant text,
  notes text,
  tags text[] DEFAULT '{}',
  tag text NOT NULL DEFAULT 'Want' CHECK (tag IN ('Need', 'Want', 'Invest', 'Transfer')),
  attachment_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant);
CREATE INDEX IF NOT EXISTS idx_transactions_tags ON transactions USING GIN(tags);

CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('overall', 'category')),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('weekly', 'monthly', 'yearly')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_budgets" ON budgets;
CREATE POLICY "anon_select_budgets" ON budgets FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_budgets" ON budgets;
CREATE POLICY "anon_insert_budgets" ON budgets FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_budgets" ON budgets;
CREATE POLICY "anon_update_budgets" ON budgets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_budgets" ON budgets;
CREATE POLICY "anon_delete_budgets" ON budgets FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('inflow', 'outflow')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  merchant text,
  notes text,
  tag text NOT NULL DEFAULT 'Want' CHECK (tag IN ('Need', 'Want', 'Invest', 'Transfer')),
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  custom_days integer,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  next_date date NOT NULL DEFAULT CURRENT_DATE,
  notifications_enabled boolean NOT NULL DEFAULT false,
  notify_days_before integer NOT NULL DEFAULT 1,
  notify_time time NOT NULL DEFAULT '09:00:00',
  repeat_until_acknowledged boolean NOT NULL DEFAULT false,
  last_generated date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_recurring" ON recurring_transactions;
CREATE POLICY "anon_select_recurring" ON recurring_transactions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_recurring" ON recurring_transactions;
CREATE POLICY "anon_insert_recurring" ON recurring_transactions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_recurring" ON recurring_transactions;
CREATE POLICY "anon_update_recurring" ON recurring_transactions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_recurring" ON recurring_transactions;
CREATE POLICY "anon_delete_recurring" ON recurring_transactions FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS payee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('inflow', 'outflow')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(payee_name)
);

ALTER TABLE payee_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_payee_rules" ON payee_rules;
CREATE POLICY "anon_select_payee_rules" ON payee_rules FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_payee_rules" ON payee_rules;
CREATE POLICY "anon_insert_payee_rules" ON payee_rules FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_payee_rules" ON payee_rules;
CREATE POLICY "anon_update_payee_rules" ON payee_rules FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_payee_rules" ON payee_rules;
CREATE POLICY "anon_delete_payee_rules" ON payee_rules FOR DELETE
  TO anon, authenticated USING (true);
