import { useState, useEffect, useCallback } from "react";
import {
  Settings as SettingsIcon, ChevronRight, Tag, CreditCard, Bell, Lock, Database,
  Sparkles, Plus, X, Trash2, Check, GripVertical, ArrowUp, ArrowDown, Globe, Palette
} from "lucide-react";
import type { AppSettings, AIProvider, Category, TransactionType, TagType } from "@/types";
import { TAGS, TAG_BG_COLORS } from "@/types";
import { saveSettings, clearSettingsCache } from "@/lib/settings";
import {
  fetchCategories, createCategory, updateCategory, deleteCategory, reorderCategories,
  fetchAccounts, createAccount, updateAccount, deleteAccount, fetchPayeeRules, deletePayeeRule
} from "@/lib/data";

type SubPage = "menu" | "general" | "categories" | "accounts" | "notifications" | "security" | "data" | "ai" | "payee-rules";

interface SettingsScreenProps {
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
}

export function SettingsScreen({ settings, onSettingsChange }: SettingsScreenProps) {
  const [page, setPage] = useState<SubPage>("menu");
  const [local, setLocal] = useState<AppSettings>(settings);

  const update = useCallback((updates: Partial<AppSettings>) => {
    const next = { ...local, ...updates };
    setLocal(next);
    saveSettings(next);
    onSettingsChange(next);
  }, [local, onSettingsChange]);

  if (page !== "menu") {
    return (
      <SubPageRenderer
        page={page}
        settings={local}
        onUpdate={update}
        onBack={() => setPage("menu")}
      />
    );
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">Customize your finance tracker</p>

      <div className="space-y-2">
        <SectionTitle>General</SectionTitle>
        <NavRow icon={<Globe size={18} className="text-gray-600" />} title="Currency & Format" subtitle={`${local.currency} · ${local.dateFormat}`} onClick={() => setPage("general")} />
        <NavRow icon={<Tag size={18} className="text-gray-600" />} title="Categories" subtitle="Manage inflow & outflow" onClick={() => setPage("categories")} />
        <NavRow icon={<CreditCard size={18} className="text-gray-600" />} title="Payment Methods" subtitle="Accounts & cards" onClick={() => setPage("accounts")} />

        <SectionTitle>AI</SectionTitle>
        <NavRow
          icon={<Sparkles size={18} className={local.aiSettings?.apiKey ? "text-blue-500" : "text-gray-400"} />}
          title="AI Configuration"
          subtitle={local.aiSettings?.apiKey ? `${local.aiSettings.provider} configured` : "Not configured"}
          onClick={() => setPage("ai")}
        />
        <NavRow icon={<SettingsIcon size={18} className="text-gray-600" />} title="Payee Rules" subtitle="Auto-categorization rules" onClick={() => setPage("payee-rules")} />

        <SectionTitle>Preferences</SectionTitle>
        <NavRow icon={<Bell size={18} className="text-gray-600" />} title="Notifications" subtitle="Recurring reminders" onClick={() => setPage("notifications")} />
        <NavRow icon={<Lock size={18} className="text-gray-600" />} title="Security" subtitle={local.appLockEnabled ? "App lock enabled" : "No lock set"} onClick={() => setPage("security")} />
        <NavRow icon={<Database size={18} className="text-gray-600" />} title="Data" subtitle="Export, import, backup" onClick={() => setPage("data")} />
      </div>

      <p className="text-center text-xs text-gray-300 mt-8">Finance Tracker v1.0</p>
    </div>
  );
}

function SubPageRenderer({ page, settings, onUpdate, onBack }: {
  page: SubPage;
  settings: AppSettings;
  onUpdate: (u: Partial<AppSettings>) => void;
  onBack: () => void;
}) {
  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronRight size={18} className="text-gray-600 rotate-180" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 capitalize">
          {page === "payee-rules" ? "Payee Rules" : page}
        </h1>
      </div>
      {page === "general" && <GeneralSettings settings={settings} onUpdate={onUpdate} />}
      {page === "categories" && <CategoriesSettings />}
      {page === "accounts" && <AccountsSettings />}
      {page === "ai" && <AISettings settings={settings} onUpdate={onUpdate} />}
      {page === "payee-rules" && <PayeeRulesSettings />}
      {page === "notifications" && <NotificationsSettings settings={settings} onUpdate={onUpdate} />}
      {page === "security" && <SecuritySettings settings={settings} onUpdate={onUpdate} />}
      {page === "data" && <DataSettings />}
    </div>
  );
}

function GeneralSettings({ settings, onUpdate }: { settings: AppSettings; onUpdate: (u: Partial<AppSettings>) => void }) {
  const currencies = [
    { code: "INR", symbol: "₹", name: "Indian Rupee" },
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "EUR", symbol: "€", name: "Euro" },
    { code: "GBP", symbol: "£", name: "British Pound" },
    { code: "JPY", symbol: "¥", name: "Japanese Yen" },
    { code: "AUD", symbol: "A$", name: "Australian Dollar" },
    { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <label className="text-xs text-gray-500 font-medium block mb-2">Currency</label>
        <div className="flex flex-wrap gap-2">
          {currencies.map(c => (
            <button
              key={c.code}
              onClick={() => onUpdate({ currency: c.code, currencySymbol: c.symbol })}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${settings.currency === c.code ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}
            >
              {c.symbol} {c.code}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <label className="text-xs text-gray-500 font-medium block mb-2">Date Format</label>
        <div className="flex gap-2">
          {["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map(f => (
            <button
              key={f}
              onClick={() => onUpdate({ dateFormat: f })}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${settings.dateFormat === f ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <label className="text-xs text-gray-500 font-medium block mb-2 flex items-center gap-1.5"><Palette size={13} /> Theme</label>
        <div className="flex gap-2">
          {["light", "dark"].map(t => (
            <button
              key={t}
              onClick={() => onUpdate({ theme: t as "light" | "dark" })}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${settings.theme === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoriesSettings() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [activeType, setActiveType] = useState<TransactionType>("outflow");
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState<TagType>("Want");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const load = async () => {
    const cats = await fetchCategories();
    setCategories(cats);
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const maxOrder = Math.max(0, ...categories.filter(c => c.type === activeType).map(c => c.sort_order));
    await createCategory({ name: newName.trim(), type: activeType, tag: newTag, sort_order: maxOrder + 1, is_default: false });
    setNewName(""); setShowAdd(false);
    load();
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await updateCategory(id, { name: editName.trim() });
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteCategory(id);
    load();
  };

  const handleMove = async (id: string, dir: "up" | "down") => {
    const sorted = categories.filter(c => c.type === activeType).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(c => c.id === id);
    if (dir === "up" && idx > 0) {
      const tmp = sorted[idx];
      sorted[idx] = sorted[idx - 1];
      sorted[idx - 1] = tmp;
    } else if (dir === "down" && idx < sorted.length - 1) {
      const tmp = sorted[idx];
      sorted[idx] = sorted[idx + 1];
      sorted[idx + 1] = tmp;
    } else return;
    await reorderCategories(sorted);
    load();
  };

  const filtered = categories.filter(c => c.type === activeType).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setActiveType("outflow")} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${activeType === "outflow" ? "bg-red-500 text-white" : "bg-white text-gray-600 border border-gray-100"}`}>Outflow</button>
        <button onClick={() => setActiveType("inflow")} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${activeType === "inflow" ? "bg-emerald-500 text-white" : "bg-white text-gray-600 border border-gray-100"}`}>Inflow</button>
      </div>

      <div className="space-y-2">
        {filtered.map((cat, i) => (
          <div key={cat.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-2">
            <div className="flex flex-col">
              <button onClick={() => handleMove(cat.id, "up")} disabled={i === 0} className="text-gray-300 disabled:opacity-30"><ArrowUp size={14} /></button>
              <button onClick={() => handleMove(cat.id, "down")} disabled={i === filtered.length - 1} className="text-gray-300 disabled:opacity-30"><ArrowDown size={14} /></button>
            </div>
            {editing === cat.id ? (
              <>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 px-2 py-1 bg-gray-50 rounded text-sm outline-none" autoFocus />
                <button onClick={() => handleRename(cat.id)} className="w-7 h-7 bg-gray-900 text-white rounded-lg flex items-center justify-center"><Check size={14} /></button>
                <button onClick={() => setEditing(null)} className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center"><X size={14} /></button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ml-2 ${TAG_BG_COLORS[cat.tag]}`}>{cat.tag}</span>
                  {cat.is_default && <span className="text-[9px] text-gray-400 ml-1">default</span>}
                </div>
                <button onClick={() => { setEditing(cat.id); setEditName(cat.name); }} className="text-xs text-gray-500 px-2">Edit</button>
                <button onClick={() => handleDelete(cat.id)} className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 font-medium">
        <Plus size={16} /> Add Category
      </button>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5 pb-8" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New {activeType} Category</h2>
            <div className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Category name" className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100" autoFocus />
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Default Tag</label>
                <div className="flex gap-2">
                  {TAGS.map(t => (
                    <button key={t} onClick={() => setNewTag(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${newTag === t ? TAG_BG_COLORS[t] : "bg-white text-gray-500 border-gray-200"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleAdd} disabled={!newName.trim()} className={`w-full py-3 rounded-xl font-semibold text-sm ${newName.trim() ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-400"}`}>Add Category</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountsSettings() {
  const [accounts, setAccounts] = useState<{ id: string; name: string; type: string; sort_order: number }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("cash");

  const load = async () => {
    const accs = await fetchAccounts();
    setAccounts(accs);
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const maxOrder = Math.max(0, ...accounts.map(a => a.sort_order));
    await createAccount({ name: newName.trim(), type: newType, sort_order: maxOrder + 1, is_default: false });
    setNewName(""); setShowAdd(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteAccount(id);
    load();
  };

  const handleRename = async (id: string, name: string) => {
    await updateAccount(id, { name });
    load();
  };

  const types = [
    { value: "cash", label: "Cash" },
    { value: "bank", label: "Bank" },
    { value: "credit_card", label: "Credit Card" },
    { value: "debit_card", label: "Debit Card" },
    { value: "upi", label: "UPI" },
    { value: "wallet", label: "Wallet" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-3">
      {accounts.map(acc => (
        <div key={acc.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-2">
          <CreditCard size={16} className="text-gray-400 flex-shrink-0" />
          <input
            defaultValue={acc.name}
            onBlur={e => e.target.value !== acc.name && handleRename(acc.id, e.target.value)}
            className="flex-1 text-sm font-medium text-gray-900 bg-transparent outline-none"
          />
          <span className="text-xs text-gray-400">{types.find(t => t.value === acc.type)?.label}</span>
          <button onClick={() => handleDelete(acc.id)} className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
        </div>
      ))}

      <button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 font-medium">
        <Plus size={16} /> Add Account
      </button>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5 pb-8" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Account</h2>
            <div className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Account name" className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100" autoFocus />
              <div className="flex flex-wrap gap-2">
                {types.map(t => (
                  <button key={t.value} onClick={() => setNewType(t.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${newType === t.value ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}>{t.label}</button>
                ))}
              </div>
              <button onClick={handleAdd} disabled={!newName.trim()} className={`w-full py-3 rounded-xl font-semibold text-sm ${newName.trim() ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-400"}`}>Add Account</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AISettings({ settings, onUpdate }: { settings: AppSettings; onUpdate: (u: Partial<AppSettings>) => void }) {
  const [apiKey, setApiKey] = useState(settings.aiSettings?.apiKey || "");
  const [provider, setProvider] = useState<AIProvider>(settings.aiSettings?.provider || "gemini");
  const [model, setModel] = useState(settings.aiSettings?.model || "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onUpdate({ aiSettings: { provider, apiKey, model: model || undefined } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const defaultModels: Record<AIProvider, string> = {
    gemini: "gemini-1.5-flash",
    groq: "llama-3.3-70b-versatile",
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-sonnet-20241022",
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700">
          AI is optional. Your API key is stored locally and only sent to the AI provider through our secure proxy. Normal transactions never use AI.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <label className="text-xs text-gray-500 font-medium block mb-2">AI Provider</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "gemini", label: "Google Gemini" },
            { id: "groq", label: "Groq" },
            { id: "openai", label: "OpenAI" },
            { id: "anthropic", label: "Anthropic" },
          ] as { id: AIProvider; label: string }[]).map(p => (
            <button
              key={p.id}
              onClick={() => { setProvider(p.id); setModel(""); }}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium ${provider === p.id ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <label className="text-xs text-gray-500 font-medium block mb-2">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="Enter your API key"
          className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100"
        />
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <label className="text-xs text-gray-500 font-medium block mb-2">Model (optional)</label>
        <input
          type="text"
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder={`Default: ${defaultModels[provider]}`}
          className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100"
        />
      </div>

      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Status</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${apiKey ? "bg-emerald-500" : "bg-gray-300"}`} />
          <span className="text-sm text-gray-600">{apiKey ? "AI configured and ready" : "Not configured"}</span>
        </div>
      </div>

      <button
        onClick={handleSave}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${saved ? "bg-emerald-500 text-white" : "bg-gray-900 text-white"}`}
      >
        {saved ? <><Check size={16} /> Saved</> : "Save AI Settings"}
      </button>
    </div>
  );
}

function PayeeRulesSettings() {
  const [rules, setRules] = useState<{ id: string; payee_name: string; type: string; category_id: string | null }[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = async () => {
    const [r, c] = await Promise.all([fetchPayeeRules(), fetchCategories()]);
    setRules(r);
    setCategories(c);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    await deletePayeeRule(id);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-xs text-gray-500">
          These rules are created automatically when you add a transaction with a merchant and auto-categorize enabled. Future transactions to the same payee will use the same category.
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No payee rules yet. They'll be created automatically as you add transactions.</p>
      ) : (
        rules.map(r => {
          const cat = categories.find(c => c.id === r.category_id);
          return (
            <div key={r.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-2">
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900 block">{r.payee_name}</span>
                <span className="text-xs text-gray-400">{cat?.name || "Uncategorized"} · {r.type}</span>
              </div>
              <button onClick={() => handleDelete(r.id)} className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          );
        })
      )}
    </div>
  );
}

function NotificationsSettings({ settings, onUpdate }: { settings: AppSettings; onUpdate: (u: Partial<AppSettings>) => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Enable Notifications</h3>
            <p className="text-xs text-gray-400 mt-0.5">Get reminded about recurring transactions</p>
          </div>
          <Toggle checked={settings.notificationsEnabled} onChange={v => onUpdate({ notificationsEnabled: v })} />
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700">
          Notification timing and repetition are configured per recurring transaction in the Recurring tab.
        </p>
      </div>
    </div>
  );
}

function SecuritySettings({ settings, onUpdate }: { settings: AppSettings; onUpdate: (u: Partial<AppSettings>) => void }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const handleEnable = () => {
    if (pin.length < 4) { setError("PIN must be at least 4 digits"); return; }
    if (pin !== confirmPin) { setError("PINs don't match"); return; }
    setError("");
    onUpdate({ appLockEnabled: true, appLockPin: pin });
  };

  const handleDisable = () => {
    onUpdate({ appLockEnabled: false, appLockPin: null });
    setPin(""); setConfirmPin("");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">App Lock</h3>
            <p className="text-xs text-gray-400 mt-0.5">Require PIN to open the app</p>
          </div>
          <Toggle checked={settings.appLockEnabled} onChange={v => v ? null : handleDisable()} />
        </div>
      </div>

      {!settings.appLockEnabled && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-2">Set PIN</label>
            <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter PIN" className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100 tracking-widest" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-2">Confirm PIN</label>
            <input type="password" inputMode="numeric" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Confirm PIN" className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100 tracking-widest" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button onClick={handleEnable} className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm">Enable App Lock</button>
        </div>
      )}
    </div>
  );
}

function DataSettings() {
  return (
    <div className="space-y-3">
      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-xs text-gray-500">
          Data export, import, backup, and restore are available in the Data section of the app. Use the bottom navigation to access "Data" for all these features.
        </p>
      </div>
    </div>
  );
}

function NavRow({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-3.5 bg-white rounded-xl border border-gray-100 text-left active:scale-[0.98] transition-transform">
      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
      </div>
      <ChevronRight size={18} className="text-gray-300" />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2 px-1">{children}</h2>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`w-10 h-6 rounded-full transition-colors relative ${checked ? "bg-gray-900" : "bg-gray-300"}`}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}
