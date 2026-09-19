import { db, ensureInitialized } from "./db";
import {
  type Category,
  type Account,
  type Transaction,
  type Budget,
  type RecurringTransaction,
  type PayeeRule,
  TagType,
  TransactionType,
  BudgetType,
  BudgetPeriod,
  RecurringFrequency,
} from "@/types";

export interface TransactionWithNames extends Transaction {
  category_name?: string | null;
  category_tag?: TagType | null;
  account_name?: string | null;
}

export async function fetchCategories(): Promise<Category[]> {
  await ensureInitialized();
  return db.categories.orderBy("sort_order").toArray();
}

export async function createCategory(cat: Partial<Category>): Promise<Category> {
  await ensureInitialized();
  const maxOrder = (await db.categories.count()) + 1;
  const newCat: Category = {
    id: cat.id || crypto.randomUUID(),
    name: cat.name || "",
    type: cat.type || TransactionType.Outflow,
    tag: cat.tag || TagType.Want,
    sort_order: cat.sort_order ?? maxOrder,
    is_default: cat.is_default ?? false,
    icon: cat.icon || null,
    color: cat.color || null,
    created_at: cat.created_at || new Date().toISOString(),
  };
  await db.categories.put(newCat);
  return newCat;
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<void> {
  await db.categories.update(id, updates);
}

export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id);
}

export async function reorderCategories(categories: Category[]): Promise<void> {
  await db.transaction("rw", db.categories, async () => {
    for (let i = 0; i < categories.length; i++) {
      await db.categories.update(categories[i].id, { sort_order: i + 1 });
    }
  });
}

export async function fetchAccounts(): Promise<Account[]> {
  await ensureInitialized();
  return db.accounts.orderBy("sort_order").toArray();
}

export async function createAccount(acc: Partial<Account>): Promise<Account> {
  await ensureInitialized();
  const maxOrder = (await db.accounts.count()) + 1;
  const newAcc: Account = {
    id: acc.id || crypto.randomUUID(),
    name: acc.name || "",
    type: acc.type || "bank",
    sort_order: acc.sort_order ?? maxOrder,
    is_default: acc.is_default ?? false,
    created_at: acc.created_at || new Date().toISOString(),
  };
  await db.accounts.put(newAcc);
  return newAcc;
}

export async function updateAccount(id: string, updates: Partial<Account>): Promise<void> {
  await db.accounts.update(id, updates);
}

export async function deleteAccount(id: string): Promise<void> {
  await db.accounts.delete(id);
}

export async function fetchTransactions(opts?: {
  startDate?: string;
  endDate?: string;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  search?: string;
  merchant?: string;
  tag?: TagType;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
  orderBy?: string;
  ascending?: boolean;
}): Promise<TransactionWithNames[]> {
  await ensureInitialized();
  const [allTx, categories, accounts] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray(),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const accMap = new Map(accounts.map((a) => [a.id, a]));

  let filtered = allTx.filter((t) => {
    if (opts?.startDate && t.date < opts.startDate) return false;
    if (opts?.endDate && t.date > opts.endDate) return false;
    if (opts?.type && t.type !== opts.type) return false;
    if (opts?.categoryId && t.category_id !== opts.categoryId) return false;
    if (opts?.accountId && t.account_id !== opts.accountId) return false;
    if (opts?.tag && t.tag !== opts.tag) return false;
    if (opts?.minAmount !== undefined && Number(t.amount) < opts.minAmount) return false;
    if (opts?.maxAmount !== undefined && Number(t.amount) > opts.maxAmount) return false;
    if (opts?.merchant && !(t.merchant || "").toLowerCase().includes(opts.merchant.toLowerCase())) return false;
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      const inMerchant = (t.merchant || "").toLowerCase().includes(q);
      const inNotes = (t.notes || "").toLowerCase().includes(q);
      const inCat = (catMap.get(t.category_id || "")?.name || "").toLowerCase().includes(q);
      if (!inMerchant && !inNotes && !inCat) return false;
    }
    return true;
  });

  const orderBy = opts?.orderBy || "date";
  const ascending = opts?.ascending ?? false;

  filtered.sort((a, b) => {
    let comp = 0;
    if (orderBy === "date") {
      comp = a.date.localeCompare(b.date);
      if (comp === 0) comp = (a.created_at || "").localeCompare(b.created_at || "");
    } else if (orderBy === "amount") {
      comp = Number(a.amount) - Number(b.amount);
    } else if (orderBy === "merchant") {
      comp = (a.merchant || "").localeCompare(b.merchant || "");
    } else {
      comp = a.date.localeCompare(b.date);
    }
    return ascending ? comp : -comp;
  });

  if (opts?.offset) {
    filtered = filtered.slice(opts.offset);
  }
  if (opts?.limit) {
    filtered = filtered.slice(0, opts.limit);
  }

  return filtered.map((t) => {
    const cat = t.category_id ? catMap.get(t.category_id) : undefined;
    const acc = t.account_id ? accMap.get(t.account_id) : undefined;
    return {
      ...t,
      category_name: cat?.name ?? null,
      category_tag: cat?.tag ?? null,
      account_name: acc?.name ?? null,
    };
  });
}

export async function createTransaction(tx: Partial<Transaction>): Promise<Transaction> {
  await ensureInitialized();
  const now = new Date().toISOString();
  const newTx: Transaction = {
    id: tx.id || crypto.randomUUID(),
    type: tx.type || TransactionType.Outflow,
    amount: Number(tx.amount) || 0,
    category_id: tx.category_id || null,
    date: tx.date || now.slice(0, 10),
    account_id: tx.account_id || null,
    merchant: tx.merchant || null,
    notes: tx.notes || null,
    tags: tx.tags || [],
    tag: tx.tag || TagType.Want,
    attachment_url: tx.attachment_url || null,
    created_at: tx.created_at || now,
    updated_at: now,
  };
  await db.transactions.put(newTx);
  return newTx;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, {
    ...updates,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
}

export async function bulkDeleteTransactions(ids: string[]): Promise<void> {
  await db.transactions.bulkDelete(ids);
}

export async function fetchBudgets(): Promise<Budget[]> {
  await ensureInitialized();
  return db.budgets.toArray();
}

export async function createBudget(b: Partial<Budget>): Promise<Budget> {
  await ensureInitialized();
  const newBudget: Budget = {
    id: b.id || crypto.randomUUID(),
    type: b.type || BudgetType.Overall,
    category_id: b.category_id || null,
    amount: Number(b.amount) || 0,
    period: b.period || BudgetPeriod.Monthly,
    created_at: b.created_at || new Date().toISOString(),
  };
  await db.budgets.put(newBudget);
  return newBudget;
}

export async function updateBudget(id: string, updates: Partial<Budget>): Promise<void> {
  await db.budgets.update(id, updates);
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id);
}

export async function fetchRecurringTransactions(): Promise<RecurringTransaction[]> {
  await ensureInitialized();
  return db.recurring_transactions.orderBy("next_date").toArray();
}

export async function createRecurringTransaction(r: Partial<RecurringTransaction>): Promise<RecurringTransaction> {
  await ensureInitialized();
  const newRec: RecurringTransaction = {
    id: r.id || crypto.randomUUID(),
    type: r.type || TransactionType.Outflow,
    amount: Number(r.amount) || 0,
    category_id: r.category_id || null,
    account_id: r.account_id || null,
    merchant: r.merchant || null,
    notes: r.notes || null,
    tag: r.tag || TagType.Need,
    frequency: r.frequency || RecurringFrequency.Monthly,
    custom_days: r.custom_days || null,
    start_date: r.start_date || new Date().toISOString().slice(0, 10),
    end_date: r.end_date || null,
    next_date: r.next_date || new Date().toISOString().slice(0, 10),
    notifications_enabled: r.notifications_enabled ?? false,
    notify_days_before: r.notify_days_before ?? 1,
    notify_time: r.notify_time || "09:00",
    repeat_until_acknowledged: r.repeat_until_acknowledged ?? false,
    last_generated: r.last_generated || null,
    is_active: r.is_active ?? true,
    created_at: r.created_at || new Date().toISOString(),
  };
  await db.recurring_transactions.put(newRec);
  return newRec;
}

export async function updateRecurringTransaction(
  id: string,
  updates: Partial<RecurringTransaction>
): Promise<void> {
  await db.recurring_transactions.update(id, updates);
}

export async function deleteRecurringTransaction(id: string): Promise<void> {
  await db.recurring_transactions.delete(id);
}

export async function fetchPayeeRules(): Promise<PayeeRule[]> {
  await ensureInitialized();
  return db.payee_rules.orderBy("payee_name").toArray();
}

export async function createPayeeRule(rule: Partial<PayeeRule>): Promise<PayeeRule> {
  await ensureInitialized();
  const newRule: PayeeRule = {
    id: rule.id || crypto.randomUUID(),
    payee_name: rule.payee_name || "",
    category_id: rule.category_id || null,
    type: rule.type || TransactionType.Outflow,
    is_active: rule.is_active ?? true,
    created_at: rule.created_at || new Date().toISOString(),
  };
  await db.payee_rules.put(newRule);
  return newRule;
}

export async function deletePayeeRule(id: string): Promise<void> {
  await db.payee_rules.delete(id);
}

export async function findPayeeRule(merchant: string): Promise<PayeeRule | null> {
  if (!merchant) return null;
  await ensureInitialized();
  const normalized = merchant.trim().toLowerCase();
  const rule = await db.payee_rules
    .filter((r) => r.is_active && r.payee_name.trim().toLowerCase() === normalized)
    .first();
  return rule || null;
}
