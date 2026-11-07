/* eslint-disable @typescript-eslint/no-explicit-any */
import { db, ensureInitialized } from "./db";
import { loadSettings } from "./settings";
import { cancelAllNotifications, checkNotificationPermissions } from "./notifications";
import { syncAllRecurringReminders } from "./recurringReminders";
import { syncDailyNudge } from "./dailyNudge";
import {
  type AppSettings,
  type Transaction,
  type Category,
  type Account,
  type Budget,
  type RecurringTransaction,
  type PayeeRule,
  TransactionType,
  TagType,
  AIProvider,
} from "@/types";

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

export interface RestoreResult {
  restoredCount: number;
  categoriesCount: number;
  accountsCount: number;
  budgetsCount: number;
  recurringCount: number;
  payeeRulesCount: number;
}

/**
 * Creates a complete snapshot of all PennyWise data with denormalized
 * category and account names on transactions for resilient cross-device restoring.
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

  const catMap = new Map(cats.map((c) => [c.id, c.name]));
  const accMap = new Map(accs.map((a) => [a.id, a.name]));

  const enrichedTxs = txs.map((tx) => ({
    ...tx,
    category_name: tx.category_id ? catMap.get(tx.category_id) ?? null : null,
    account_name: tx.account_id ? accMap.get(tx.account_id) ?? null : null,
  }));

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    transactions: enrichedTxs,
    categories: cats,
    accounts: accs,
    budgets,
    recurringTransactions: recurring,
    payeeRules: rules,
    settings: settingsVal?.value,
  };
}

/**
 * Validates basic backup payload structure before attempting restore.
 */
export function validateBackupPayload(backup: unknown): { valid: boolean; error?: string } {
  if (!backup || typeof backup !== "object") {
    return { valid: false, error: "Backup file is empty or not a valid JSON object." };
  }
  const payload = backup as Record<string, unknown>;
  if (!Array.isArray(payload.transactions)) {
    return { valid: false, error: "Backup payload is missing required 'transactions' array." };
  }
  if (payload.categories && !Array.isArray(payload.categories)) {
    return { valid: false, error: "Invalid 'categories' format in backup file." };
  }
  if (payload.accounts && !Array.isArray(payload.accounts)) {
    return { valid: false, error: "Invalid 'accounts' format in backup file." };
  }
  if (payload.budgets && !Array.isArray(payload.budgets)) {
    return { valid: false, error: "Invalid 'budgets' format in backup file." };
  }
  if (payload.recurringTransactions && !Array.isArray(payload.recurringTransactions)) {
    return { valid: false, error: "Invalid 'recurringTransactions' format in backup file." };
  }
  if (payload.payeeRules && !Array.isArray(payload.payeeRules)) {
    return { valid: false, error: "Invalid 'payeeRules' format in backup file." };
  }
  return { valid: true };
}

/**
 * Merges backup settings into current settings safely:
 * - Preserves existing App Lock PIN if already set locally.
 * - Re-checks native notification permissions before turning notifications on.
 * - Retains active AI keys or Google Sync Client ID if backup lacks them.
 */
async function mergeSettingsForRestore(backupSettings?: AppSettings): Promise<AppSettings> {
  const currentSettings = await loadSettings();
  if (!backupSettings) return currentSettings;

  let notificationsEnabled = backupSettings.notificationsEnabled ?? false;
  if (notificationsEnabled) {
    const perm = await checkNotificationPermissions();
    if (perm !== "granted") {
      notificationsEnabled = false;
    }
  }

  // Preserve local App Lock if active to avoid inadvertent lockout
  const appLockEnabled =
    currentSettings.appLockEnabled && currentSettings.appLockPin
      ? currentSettings.appLockEnabled
      : backupSettings.appLockEnabled ?? false;
  const appLockPin =
    currentSettings.appLockEnabled && currentSettings.appLockPin
      ? currentSettings.appLockPin
      : backupSettings.appLockPin ?? null;

  // Preserve local AI API key if local has one and backup is blank
  const aiApiKey = backupSettings.aiSettings?.apiKey?.trim()
    ? backupSettings.aiSettings.apiKey
    : currentSettings.aiSettings?.apiKey ?? "";

  // Preserve local Google Drive client configuration
  const googleSync = {
    enabled: backupSettings.googleSync?.enabled ?? currentSettings.googleSync?.enabled ?? false,
    clientId: backupSettings.googleSync?.clientId || currentSettings.googleSync?.clientId || "",
    userEmail: backupSettings.googleSync?.userEmail ?? currentSettings.googleSync?.userEmail ?? null,
    lastSyncedAt: backupSettings.googleSync?.lastSyncedAt ?? currentSettings.googleSync?.lastSyncedAt ?? null,
    autoSync: backupSettings.googleSync?.autoSync ?? currentSettings.googleSync?.autoSync ?? true,
  };

  return {
    ...currentSettings,
    ...backupSettings,
    appLockEnabled,
    appLockPin,
    notificationsEnabled,
    aiSettings: {
      provider: backupSettings.aiSettings?.provider || currentSettings.aiSettings?.provider || AIProvider.Gemini,
      apiKey: aiApiKey,
      model: backupSettings.aiSettings?.model || currentSettings.aiSettings?.model,
    },
    googleSync,
  };
}

/**
 * Restores a full backup snapshot into Dexie IndexedDB.
 *
 * Guarantees:
 * 1. Atomic Dexie transaction: wipes existing tables and inserts backup data cleanly.
 * 2. Zero duplicates: solves randomized UUID collision on default categories and accounts.
 * 3. Self-healing: deduplicates categories/accounts/payees even if the backup file itself had duplicates.
 * 4. Alarm Resync: cancels stale native alarms and schedules all recurring items & daily nudge.
 * 5. Safe Settings: protects against lockout and preserves native permissions.
 */
export async function restoreFullDatabaseSnapshot(
  backup: DatabaseBackupPayload
): Promise<RestoreResult> {
  await ensureInitialized();

  const validation = validateBackupPayload(backup);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid backup payload format");
  }

  // 1. Prepare Settings Merge
  const mergedSettings = await mergeSettingsForRestore(backup.settings);

  // 2. Deduplicate Categories and build ID alias map
  const catIdAliasMap = new Map<string, string>(); // duplicate ID -> primary ID
  const primaryCats: Category[] = [];
  const seenCatKey = new Map<string, Category>(); // "name:::type" -> Category

  if (Array.isArray(backup.categories)) {
    for (const rawCat of backup.categories) {
      if (!rawCat || !rawCat.name) continue;
      const key = `${rawCat.name.trim().toLowerCase()}:::${rawCat.type || TransactionType.Outflow}`;
      const existing = seenCatKey.get(key);
      if (existing) {
        if (rawCat.id) {
          catIdAliasMap.set(rawCat.id, existing.id);
        }
      } else {
        const catId = rawCat.id || crypto.randomUUID();
        const cleanCat: Category = {
          id: catId,
          name: rawCat.name.trim(),
          type: (rawCat.type as TransactionType) || TransactionType.Outflow,
          tag: (rawCat.tag as TagType) || TagType.Want,
          sort_order: Number(rawCat.sort_order) || 0,
          is_default: Boolean(rawCat.is_default),
          icon: rawCat.icon ?? null,
          color: rawCat.color ?? null,
          created_at: rawCat.created_at || new Date().toISOString(),
        };
        seenCatKey.set(key, cleanCat);
        primaryCats.push(cleanCat);
        if (rawCat.id && rawCat.id !== catId) {
          catIdAliasMap.set(rawCat.id, catId);
        }
      }
    }
  }

  const primaryCatById = new Map(primaryCats.map((c) => [c.id, c]));
  const catByName = new Map(primaryCats.map((c) => [c.name.trim().toLowerCase(), c]));

  // 3. Deduplicate Accounts and build ID alias map
  const accIdAliasMap = new Map<string, string>(); // duplicate ID -> primary ID
  const primaryAccs: Account[] = [];
  const seenAccKey = new Map<string, Account>(); // "name" -> Account

  if (Array.isArray(backup.accounts)) {
    for (const rawAcc of backup.accounts) {
      if (!rawAcc || !rawAcc.name) continue;
      const key = rawAcc.name.trim().toLowerCase();
      const existing = seenAccKey.get(key);
      if (existing) {
        if (rawAcc.id) {
          accIdAliasMap.set(rawAcc.id, existing.id);
        }
      } else {
        const accId = rawAcc.id || crypto.randomUUID();
        const cleanAcc: Account = {
          id: accId,
          name: rawAcc.name.trim(),
          type: rawAcc.type || "bank",
          sort_order: Number(rawAcc.sort_order) || 0,
          is_default: Boolean(rawAcc.is_default),
          created_at: rawAcc.created_at || new Date().toISOString(),
        };
        seenAccKey.set(key, cleanAcc);
        primaryAccs.push(cleanAcc);
        if (rawAcc.id && rawAcc.id !== accId) {
          accIdAliasMap.set(rawAcc.id, accId);
        }
      }
    }
  }

  const primaryAccById = new Map(primaryAccs.map((a) => [a.id, a]));
  const accByName = new Map(primaryAccs.map((a) => [a.name.trim().toLowerCase(), a]));

  // 4. Deduplicate Payee Rules
  const primaryRules: PayeeRule[] = [];
  const seenPayeeKey = new Map<string, PayeeRule>();

  if (Array.isArray(backup.payeeRules)) {
    for (const rawRule of backup.payeeRules) {
      if (!rawRule || !rawRule.payee_name) continue;
      const key = rawRule.payee_name.trim().toLowerCase();
      if (seenPayeeKey.has(key)) continue;

      let catId = rawRule.category_id || null;
      if (catId && catIdAliasMap.has(catId)) {
        catId = catIdAliasMap.get(catId) || null;
      }

      const cleanRule: PayeeRule = {
        id: rawRule.id || crypto.randomUUID(),
        payee_name: rawRule.payee_name.trim(),
        category_id: catId,
        type: (rawRule.type as TransactionType) || TransactionType.Outflow,
        is_active: rawRule.is_active ?? true,
        created_at: rawRule.created_at || new Date().toISOString(),
      };
      seenPayeeKey.set(key, cleanRule);
      primaryRules.push(cleanRule);
    }
  }

  // 5. Deduplicate Budgets
  const primaryBudgets: Budget[] = [];
  const seenBudgetKey = new Set<string>();

  if (Array.isArray(backup.budgets)) {
    for (const rawB of backup.budgets) {
      if (!rawB) continue;
      let catId = rawB.category_id || null;
      if (catId && catIdAliasMap.has(catId)) {
        catId = catIdAliasMap.get(catId) || null;
      }
      const key = `${rawB.type}:::${rawB.period}:::${catId || "none"}`;
      if (seenBudgetKey.has(key)) continue;
      seenBudgetKey.add(key);

      primaryBudgets.push({
        id: rawB.id || crypto.randomUUID(),
        type: rawB.type,
        category_id: catId,
        amount: Number(rawB.amount) || 0,
        period: rawB.period,
        created_at: rawB.created_at || new Date().toISOString(),
      });
    }
  }

  // 6. Deduplicate & Re-align Recurring Transactions
  const primaryRecurring: RecurringTransaction[] = [];
  const seenRecurringIds = new Set<string>();

  if (Array.isArray(backup.recurringTransactions)) {
    for (const rawR of backup.recurringTransactions) {
      if (!rawR) continue;
      let rId = rawR.id || crypto.randomUUID();
      if (seenRecurringIds.has(rId)) {
        rId = crypto.randomUUID();
      }
      seenRecurringIds.add(rId);

      let catId = rawR.category_id || null;
      if (catId && catIdAliasMap.has(catId)) {
        catId = catIdAliasMap.get(catId) || null;
      }

      let accId = rawR.account_id || null;
      if (accId && accIdAliasMap.has(accId)) {
        accId = accIdAliasMap.get(accId) || null;
      }

      primaryRecurring.push({
        ...rawR,
        id: rId,
        category_id: catId,
        account_id: accId,
        amount: Number(rawR.amount) || 0,
        sub_type: rawR.sub_type || "subscription",
        is_active: rawR.is_active ?? true,
        notifications_enabled: Boolean(rawR.notifications_enabled),
      });
    }
  }

  // 7. Reconcile Transactions with Aliased and Denormalized Fallbacks
  const seenTxIds = new Set<string>();
  const restoredTxs: Transaction[] = [];

  for (const tx of backup.transactions) {
    if (!tx) continue;
    let txId = tx.id || crypto.randomUUID();
    if (seenTxIds.has(txId)) {
      txId = crypto.randomUUID();
    }
    seenTxIds.add(txId);

    // Resolve Category ID
    let resolvedCatId: string | null = null;
    let incomingCatId = tx.category_id || null;
    if (incomingCatId && catIdAliasMap.has(incomingCatId)) {
      incomingCatId = catIdAliasMap.get(incomingCatId) || null;
    }
    if (incomingCatId && primaryCatById.has(incomingCatId)) {
      resolvedCatId = incomingCatId;
    } else if (tx.category_name && catByName.has(tx.category_name.trim().toLowerCase())) {
      resolvedCatId = catByName.get(tx.category_name.trim().toLowerCase())!.id;
    }

    // Resolve Account ID
    let resolvedAccId: string | null = null;
    let incomingAccId = tx.account_id || null;
    if (incomingAccId && accIdAliasMap.has(incomingAccId)) {
      incomingAccId = accIdAliasMap.get(incomingAccId) || null;
    }
    if (incomingAccId && primaryAccById.has(incomingAccId)) {
      resolvedAccId = incomingAccId;
    } else if (tx.account_name && accByName.has(tx.account_name.trim().toLowerCase())) {
      resolvedAccId = accByName.get(tx.account_name.trim().toLowerCase())!.id;
    }

    restoredTxs.push({
      id: txId,
      type: (tx.type as TransactionType) || TransactionType.Outflow,
      amount: Number(tx.amount) || 0,
      category_id: resolvedCatId,
      date: tx.date || new Date().toISOString().slice(0, 10),
      account_id: resolvedAccId,
      merchant: tx.merchant || null,
      notes: tx.notes || null,
      tags: Array.isArray(tx.tags) ? tx.tags : [],
      tag: (tx.tag as TagType) || TagType.Want,
      attachment_url: tx.attachment_url || null,
      created_at: tx.created_at || new Date().toISOString(),
      updated_at: tx.updated_at || new Date().toISOString(),
    });
  }

  // 8. Cancel all currently scheduled OS notifications before table wipe
  try {
    await cancelAllNotifications();
  } catch (err) {
    console.error("Non-fatal error clearing existing notifications:", err);
  }

  // 9. Atomic Wipe and Bulk Insert via Dexie Transaction
  await db.transaction(
    "rw",
    [
      db.transactions,
      db.categories,
      db.accounts,
      db.budgets,
      db.recurring_transactions,
      db.payee_rules,
      db.import_drafts,
      db.app_settings,
    ],
    async () => {
      // Clear existing records completely
      await Promise.all([
        db.transactions.clear(),
        db.categories.clear(),
        db.accounts.clear(),
        db.budgets.clear(),
        db.recurring_transactions.clear(),
        db.payee_rules.clear(),
        db.import_drafts.clear(),
      ]);

      // Bulk Add all validated and deduplicated collections
      if (primaryCats.length > 0) await db.categories.bulkAdd(primaryCats);
      if (primaryAccs.length > 0) await db.accounts.bulkAdd(primaryAccs);
      if (primaryBudgets.length > 0) await db.budgets.bulkAdd(primaryBudgets);
      if (primaryRecurring.length > 0) await db.recurring_transactions.bulkAdd(primaryRecurring);
      if (primaryRules.length > 0) await db.payee_rules.bulkAdd(primaryRules);
      if (restoredTxs.length > 0) await db.transactions.bulkAdd(restoredTxs);

      // Save Merged Settings
      await db.app_settings.put({
        key: "app_settings",
        value: mergedSettings,
        updated_at: new Date().toISOString(),
      });
    }
  );

  // 10. Reschedule Alarms and Daily Nudges if notifications are active
  if (mergedSettings.notificationsEnabled) {
    try {
      await syncAllRecurringReminders();
      if (mergedSettings.dailyNudgeEnabled) {
        await syncDailyNudge();
      }
    } catch (err) {
      console.error("Non-fatal error rescheduling notifications after restore:", err);
    }
  }

  return {
    restoredCount: restoredTxs.length,
    categoriesCount: primaryCats.length,
    accountsCount: primaryAccs.length,
    budgetsCount: primaryBudgets.length,
    recurringCount: primaryRecurring.length,
    payeeRulesCount: primaryRules.length,
  };
}
