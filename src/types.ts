export enum TransactionType {
  Inflow = "inflow",
  Outflow = "outflow",
}

export enum TagType {
  Need = "Need",
  Want = "Want",
  Invest = "Invest",
  Transfer = "Transfer",
}

export enum AIProvider {
  Gemini = "gemini",
  Groq = "groq",
  OpenAI = "openai",
  Anthropic = "anthropic",
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  tag: TagType;
  sort_order: number;
  is_default: boolean;
  icon: string | null;
  color: string | null;
  created_at: string;
}

export enum AccountType {
  Cash = "cash",
  Bank = "bank",
  CreditCard = "credit_card",
  Other = "other",
}

export interface Account {
  id: string;
  name: string;
  type: AccountType | string;
  sort_order: number;
  is_default: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
  date: string;
  account_id: string | null;
  merchant: string | null;
  notes: string | null;
  tags: string[];
  tag: TagType;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export enum BudgetType {
  Overall = "overall",
  Category = "category",
}

export enum BudgetPeriod {
  Weekly = "weekly",
  Monthly = "monthly",
  Yearly = "yearly",
}

export interface Budget {
  id: string;
  type: BudgetType;
  category_id: string | null;
  amount: number;
  period: BudgetPeriod;
  created_at: string;
}

export enum RecurringFrequency {
  Weekly = "weekly",
  Monthly = "monthly",
  Yearly = "yearly",
}

export interface RecurringTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
  account_id: string | null;
  merchant: string | null;
  notes: string | null;
  tag: TagType;
  frequency: RecurringFrequency;
  custom_days: number | null;
  start_date: string;
  end_date: string | null;
  next_date: string;
  notifications_enabled: boolean;
  notify_days_before: number;
  notify_time: string;
  repeat_until_acknowledged: boolean;
  last_generated: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PayeeRule {
  id: string;
  payee_name: string;
  category_id: string | null;
  type: TransactionType;
  is_active: boolean;
  created_at: string;
}

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  model?: string;
}

export enum AppTheme {
  Light = "light",
  Dark = "dark",
}

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  theme: AppTheme;
  startScreen: string;
  aiSettings: AISettings;
  notificationsEnabled: boolean;
  appLockEnabled: boolean;
  appLockPin: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: "INR",
  currencySymbol: "₹",
  dateFormat: "DD/MM/YYYY",
  theme: AppTheme.Light,
  startScreen: "dashboard",
  aiSettings: {
    provider: AIProvider.Gemini,
    apiKey: "",
  },
  notificationsEnabled: false,
  appLockEnabled: false,
  appLockPin: null,
};

export const TAG_COLORS: Record<TagType, string> = {
  Need: "#3b82f6",
  Want: "#f59e0b",
  Invest: "#10b981",
  Transfer: "#8b5cf6",
};

export const TAG_BG_COLORS: Record<TagType, string> = {
  Need: "bg-blue-100 text-blue-700 border-blue-200",
  Want: "bg-amber-100 text-amber-700 border-amber-200",
  Invest: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Transfer: "bg-violet-100 text-violet-700 border-violet-200",
};

export const TAGS: TagType[] = [TagType.Need, TagType.Want, TagType.Invest, TagType.Transfer];

export enum ImportSource {
  CSV = "csv",
  AI = "ai",
}

export enum ImportDraftMode {
  Preview = "preview",
  AIPreview = "ai-preview",
}

export interface StagedTransactionRow {
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  merchant: string;
  notes: string;
  tag: TagType;
  account: string;
  isDuplicate?: boolean;
  selected: boolean;
}

export interface ImportDraft {
  id: string;
  fileName: string;
  source: ImportSource;
  mode: ImportDraftMode;
  rows: StagedTransactionRow[];
  created_at: string;
  updated_at: string;
}

