import { supabase } from "./supabase";
import type { Category, Account, Transaction, Budget, RecurringTransaction, PayeeRule, TagType, TransactionType } from "@/types";

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createCategory(cat: Partial<Category>): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert(cat)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, updates: Partial<Category>): Promise<void> {
  const { error } = await supabase.from("categories").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderCategories(categories: Category[]): Promise<void> {
  const updates = categories.map((c, i) => ({ id: c.id, sort_order: i + 1 }));
  for (const u of updates) {
    await supabase.from("categories").update({ sort_order: u.sort_order }).eq("id", u.id);
  }
}

export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createAccount(acc: Partial<Account>): Promise<Account> {
  const { data, error } = await supabase
    .from("accounts")
    .insert(acc)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAccount(id: string, updates: Partial<Account>): Promise<void> {
  const { error } = await supabase.from("accounts").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
}

export interface TransactionWithNames extends Transaction {
  category_name?: string | null;
  category_tag?: TagType | null;
  account_name?: string | null;
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
  let q = supabase
    .from("transactions")
    .select(`
      *,
      category:categories(name, tag),
      account:accounts(name)
    `);

  if (opts?.startDate) q = q.gte("date", opts.startDate);
  if (opts?.endDate) q = q.lte("date", opts.endDate);
  if (opts?.type) q = q.eq("type", opts.type);
  if (opts?.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts?.accountId) q = q.eq("account_id", opts.accountId);
  if (opts?.tag) q = q.eq("tag", opts.tag);
  if (opts?.merchant) q = q.ilike("merchant", `%${opts.merchant}%`);
  if (opts?.minAmount !== undefined) q = q.gte("amount", opts.minAmount);
  if (opts?.maxAmount !== undefined) q = q.lte("amount", opts.maxAmount);
  if (opts?.search) {
    q = q.or(`merchant.ilike.%${opts.search}%,notes.ilike.%${opts.search}%`);
  }

  q = q.order(opts?.orderBy || "date", { ascending: opts?.ascending ?? false });
  if (opts?.orderBy === "date" && (opts?.ascending ?? false) === false) {
    q = q.order("created_at", { ascending: false });
  }

  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.offset) q = q.range(opts.offset, opts.offset + (opts.limit || 1000) - 1);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((t) => {
    const row = t as Record<string, unknown>;
    const category = row.category as { name?: string; tag?: TagType } | null;
    const account = row.account as { name?: string } | null;
    return {
      ...t,
      category_name: category?.name ?? null,
      category_tag: category?.tag ?? null,
      account_name: account?.name ?? null,
    };
  });
}

export async function createTransaction(tx: Partial<Transaction>): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      type: tx.type,
      amount: tx.amount,
      category_id: tx.category_id,
      date: tx.date,
      account_id: tx.account_id,
      merchant: tx.merchant || null,
      notes: tx.notes || null,
      tags: tx.tags || [],
      tag: tx.tag || "Want",
      attachment_url: tx.attachment_url || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
  const { error } = await supabase.from("transactions").update({
    ...updates,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkDeleteTransactions(ids: string[]): Promise<void> {
  const { error } = await supabase.from("transactions").delete().in("id", ids);
  if (error) throw error;
}

export async function fetchBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase.from("budgets").select("*");
  if (error) throw error;
  return data || [];
}

export async function createBudget(b: Partial<Budget>): Promise<Budget> {
  const { data, error } = await supabase
    .from("budgets")
    .insert(b)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBudget(id: string, updates: Partial<Budget>): Promise<void> {
  const { error } = await supabase.from("budgets").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from("budgets").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchRecurringTransactions(): Promise<RecurringTransaction[]> {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("*")
    .order("next_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createRecurringTransaction(r: Partial<RecurringTransaction>): Promise<RecurringTransaction> {
  const { data, error } = await supabase
    .from("recurring_transactions")
    .insert(r)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecurringTransaction(id: string, updates: Partial<RecurringTransaction>): Promise<void> {
  const { error } = await supabase.from("recurring_transactions").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteRecurringTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("recurring_transactions").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPayeeRules(): Promise<PayeeRule[]> {
  const { data, error } = await supabase
    .from("payee_rules")
    .select("*")
    .order("payee_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createPayeeRule(rule: Partial<PayeeRule>): Promise<PayeeRule> {
  const { data, error } = await supabase
    .from("payee_rules")
    .insert(rule)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePayeeRule(id: string): Promise<void> {
  const { error } = await supabase.from("payee_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function findPayeeRule(merchant: string): Promise<PayeeRule | null> {
  if (!merchant) return null;
  const { data, error } = await supabase
    .from("payee_rules")
    .select("*")
    .ilike("payee_name", merchant.trim())
    .eq("is_active", true)
    .maybeSingle();
  if (error) return null;
  return data;
}
