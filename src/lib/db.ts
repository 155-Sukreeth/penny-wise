import Dexie, { type Table } from "dexie";
import {
  type Category,
  type Account,
  type Transaction,
  type Budget,
  type RecurringTransaction,
  type PayeeRule,
  type AppSettings,
  type ImportDraft,
  TransactionType,
  TagType,
  DEFAULT_SETTINGS,
} from "@/types";

export interface DBSetting {
  key: string;
  value: AppSettings;
  updated_at: string;
}

export class PennyWiseDatabase extends Dexie {
  categories!: Table<Category, string>;
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  budgets!: Table<Budget, string>;
  recurring_transactions!: Table<RecurringTransaction, string>;
  payee_rules!: Table<PayeeRule, string>;
  app_settings!: Table<DBSetting, string>;
  import_drafts!: Table<ImportDraft, string>;

  constructor() {
    super("PennyWiseDB");

    this.version(1).stores({
      categories: "id, name, type, tag, sort_order, is_default",
      accounts: "id, name, type, sort_order, is_default",
      transactions: "id, type, amount, category_id, date, account_id, merchant, tag, created_at",
      budgets: "id, type, category_id, period",
      recurring_transactions: "id, type, frequency, next_date, is_active",
      payee_rules: "id, payee_name, category_id, is_active",
      app_settings: "key",
    });

    this.version(2).stores({
      import_drafts: "id, updated_at",
    });

    this.on("populate", () => this.seedInitialData());
  }

  async seedInitialData() {
    const defaultInflowCategories: Category[] = [
      { id: crypto.randomUUID(), name: "Salary", type: TransactionType.Inflow, tag: TagType.Invest, sort_order: 1, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Freelance", type: TransactionType.Inflow, tag: TagType.Invest, sort_order: 2, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Interest", type: TransactionType.Inflow, tag: TagType.Invest, sort_order: 3, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Cashback", type: TransactionType.Inflow, tag: TagType.Want, sort_order: 4, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Refund", type: TransactionType.Inflow, tag: TagType.Transfer, sort_order: 5, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Gift", type: TransactionType.Inflow, tag: TagType.Want, sort_order: 6, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Other income", type: TransactionType.Inflow, tag: TagType.Want, sort_order: 7, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
    ];

    const defaultOutflowCategories: Category[] = [
      { id: crypto.randomUUID(), name: "Food", type: TransactionType.Outflow, tag: TagType.Need, sort_order: 1, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Groceries", type: TransactionType.Outflow, tag: TagType.Need, sort_order: 2, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Transport", type: TransactionType.Outflow, tag: TagType.Need, sort_order: 3, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Shopping", type: TransactionType.Outflow, tag: TagType.Want, sort_order: 4, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Bills & utilities", type: TransactionType.Outflow, tag: TagType.Need, sort_order: 5, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Rent", type: TransactionType.Outflow, tag: TagType.Need, sort_order: 6, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Entertainment", type: TransactionType.Outflow, tag: TagType.Want, sort_order: 7, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Healthcare", type: TransactionType.Outflow, tag: TagType.Need, sort_order: 8, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Travel", type: TransactionType.Outflow, tag: TagType.Want, sort_order: 9, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Subscriptions", type: TransactionType.Outflow, tag: TagType.Want, sort_order: 10, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Education", type: TransactionType.Outflow, tag: TagType.Invest, sort_order: 11, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Personal care", type: TransactionType.Outflow, tag: TagType.Want, sort_order: 12, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Miscellaneous", type: TransactionType.Outflow, tag: TagType.Want, sort_order: 13, is_default: true, icon: null, color: null, created_at: new Date().toISOString() },
    ];

    const defaultAccounts: Account[] = [
      { id: crypto.randomUUID(), name: "Cash", type: "cash", sort_order: 1, is_default: true, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Bank account", type: "bank", sort_order: 2, is_default: true, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Credit card", type: "credit_card", sort_order: 3, is_default: true, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Debit card", type: "debit_card", sort_order: 4, is_default: true, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "UPI", type: "upi", sort_order: 5, is_default: true, created_at: new Date().toISOString() },
      { id: crypto.randomUUID(), name: "Wallet", type: "wallet", sort_order: 6, is_default: true, created_at: new Date().toISOString() },
    ];

    await this.categories.bulkAdd([...defaultInflowCategories, ...defaultOutflowCategories]);
    await this.accounts.bulkAdd(defaultAccounts);
    await this.app_settings.put({
      key: "app_settings",
      value: DEFAULT_SETTINGS,
      updated_at: new Date().toISOString(),
    });
  }
}

export const db = new PennyWiseDatabase();

// Ensure seeds exist even if populate hook already passed on an existing empty db
export async function ensureInitialized() {
  const catCount = await db.categories.count();
  if (catCount === 0) {
    await db.seedInitialData();
  }
}
