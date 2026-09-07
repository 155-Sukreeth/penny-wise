/*
# Seed Default Categories and Accounts

1. Inserts
- Default inflow categories (Salary, Freelance, Interest, Cashback, Refund, Gift, Other income)
- Default outflow categories (Food, Groceries, Transport, Shopping, Bills & utilities, Rent, Entertainment, Healthcare, Travel, Subscriptions, Education, Personal care, Miscellaneous)
- Default accounts (Cash, Bank account, Credit card, Debit card, UPI, Wallet)

2. Notes
- Each category has a sensible default tag (Need/Want/Invest/Transfer)
- Sort order starts at 1 and increments
*/

INSERT INTO categories (name, type, tag, sort_order, is_default)
SELECT * FROM (VALUES
  ('Salary', 'inflow', 'Invest', 1, true),
  ('Freelance', 'inflow', 'Invest', 2, true),
  ('Interest', 'inflow', 'Invest', 3, true),
  ('Cashback', 'inflow', 'Want', 4, true),
  ('Refund', 'inflow', 'Transfer', 5, true),
  ('Gift', 'inflow', 'Want', 6, true),
  ('Other income', 'inflow', 'Want', 7, true)
) AS t(name, type, tag, sort_order, is_default)
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE is_default = true AND type = 'inflow');

INSERT INTO categories (name, type, tag, sort_order, is_default)
SELECT * FROM (VALUES
  ('Food', 'outflow', 'Need', 1, true),
  ('Groceries', 'outflow', 'Need', 2, true),
  ('Transport', 'outflow', 'Need', 3, true),
  ('Shopping', 'outflow', 'Want', 4, true),
  ('Bills & utilities', 'outflow', 'Need', 5, true),
  ('Rent', 'outflow', 'Need', 6, true),
  ('Entertainment', 'outflow', 'Want', 7, true),
  ('Healthcare', 'outflow', 'Need', 8, true),
  ('Travel', 'outflow', 'Want', 9, true),
  ('Subscriptions', 'outflow', 'Want', 10, true),
  ('Education', 'outflow', 'Invest', 11, true),
  ('Personal care', 'outflow', 'Want', 12, true),
  ('Miscellaneous', 'outflow', 'Want', 13, true)
) AS t(name, type, tag, sort_order, is_default)
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE is_default = true AND type = 'outflow');

INSERT INTO accounts (name, type, sort_order, is_default)
SELECT * FROM (VALUES
  ('Cash', 'cash', 1, true),
  ('Bank account', 'bank', 2, true),
  ('Credit card', 'credit_card', 3, true),
  ('Debit card', 'debit_card', 4, true),
  ('UPI', 'upi', 5, true),
  ('Wallet', 'wallet', 6, true)
) AS t(name, type, sort_order, is_default)
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE is_default = true);
