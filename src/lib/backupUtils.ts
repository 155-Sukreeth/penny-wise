import { db, ensureInitialized } from "./db";
import { fetchCategories, fetchAccounts } from "./data";
import { saveSettings } from "./settings";
import type { AppSettings, Transaction, TransactionType } from "@/types";

export interface DatabaseBackupPayload {
  version: string;
  exportedAt: string;
  transactions: any[];
  categories: any[];
  accounts: any[];
  budgets: any[];
  recurringTransactions: any[];
  payeeRules: any[];
  settings?: AppSettings;
}

/**
 * Creates a complete snapshot of all PennyWise data.
 */
export async function createFullDatabaseSnapshot(): Promise<DatabaseBackupPayload> {
  await ensureInitialized();

  const [txs, cats, accs, budgets, recurring, rules, settingsVal] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.accounts.toArray(),
    db.budgets.toArray(),
    db.recurring_transactions.toArray(),
    db.payee_rules.toArray(),
    db.app_settings.get("app_settings"),
  ]);

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    transactions: txs,
    categories: cats,
    accounts: accs,
    budgets,
    recurringTransactions: recurring,
    payeeRules: rules,
    settings: settingsVal?.value,
  };
}

/**
 * Restores a full backup snapshot into Dexie IndexedDB.
 */
export async function restoreFullDatabaseSnapshot(backup: DatabaseBackupPayload): Promise<{ restoredCount: number }> {
  await ensureInitialized();

  if (!backup.transactions || !Array.isArray(backup.transactions)) {
    throw new Error("Invalid backup payload format");
  }

  if (backup.categories && Array.isArray(backup.categories)) {
    for (const cat of backup.categories) {
      await db.categories.put(cat);
    }
  }

  if (backup.accounts && Array.isArray(backup.accounts)) {
    for (const acc of backup.accounts) {
      await db.accounts.put(acc);
    }
  }

  if (backup.budgets && Array.isArray(backup.budgets)) {
    for (const b of backup.budgets) {
      await db.budgets.put(b);
    }
  }

  if (backup.recurringTransactions && Array.isArray(backup.recurringTransactions)) {
    for (const r of backup.recurringTransactions) {
      await db.recurring_transactions.put(r);
    }
  }

  if (backup.payeeRules && Array.isArray(backup.payeeRules)) {
    for (const rule of backup.payeeRules) {
      await db.payee_rules.put(rule);
    }
  }

  if (backup.settings) {
    await saveSettings(backup.settings);
  }

  const cats = await fetchCategories();
  const accs = await fetchAccounts();

  let restoredCount = 0;
  for (const tx of backup.transactions) {
    const cat = cats.find(c => c.name === tx.category_name) || cats.find(c => c.id === tx.category_id);
    const acc = accs.find(a => a.name === tx.account_name) || accs.find(a => a.id === tx.account_id);
    const restoredTx: Transaction = {
      id: tx.id || crypto.randomUUID(),
      type: (tx.type as TransactionType) || "outflow",
      amount: Number(tx.amount) || 0,
      category_id: cat ? cat.id : tx.category_id || null,
      date: tx.date || new Date().toISOString().slice(0, 10),
      account_id: acc ? acc.id : tx.account_id || null,
      merchant: tx.merchant || null,
      notes: tx.notes || null,
      tags: tx.tags || [],
      tag: tx.tag || "Want",
      attachment_url: tx.attachment_url || null,
      created_at: tx.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.transactions.put(restoredTx);
    restoredCount++;
  }

  return { restoredCount };
}
