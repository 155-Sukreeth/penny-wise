import { useState, useEffect, useCallback } from "react";
import { Plus, X, Trash2, Repeat, Bell, BellOff, Calendar, Check, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { AppSettings, TransactionType, TagType, Category, RecurringTransaction } from "@/types";
import { TAGS, TAG_BG_COLORS } from "@/types";
import {
  fetchRecurringTransactions, createRecurringTransaction, updateRecurringTransaction,
  deleteRecurringTransaction, fetchCategories, fetchAccounts, createTransaction
} from "@/lib/data";
import { formatCurrency, formatDate, getTodayString, relativeDate } from "@/lib/format";

export function Recurring({ settings }: { settings: AppSettings }) {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  // form state
  const [type, setType] = useState<TransactionType>("outflow");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState<TagType>("Need");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [startDate, setStartDate] = useState(getTodayString());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifyDaysBefore, setNotifyDaysBefore] = useState(1);
  const [notifyTime, setNotifyTime] = useState("09:00");

  const load = useCallback(async () => {
    setLoading(true);
    const [rec, cats, accs] = await Promise.all([
      fetchRecurringTransactions(),
      fetchCategories(),
      fetchAccounts(),
    ]);
    setRecurring(rec);
    setCategories(cats);
    setAccounts(accs.map(a => ({ id: a.id, name: a.name })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setType("outflow"); setAmount(""); setCategoryId(null); setAccountId(null);
    setMerchant(""); setNotes(""); setTag("Need"); setFrequency("monthly");
    setStartDate(getTodayString()); setNotificationsEnabled(false);
    setNotifyDaysBefore(1); setNotifyTime("09:00");
  };

  const handleAdd = async () => {
    const amt = parseFloat(amount);
    if (!amt || !categoryId) return;

    const nextDate = calculateNextDate(startDate, frequency);
    await createRecurringTransaction({
      type, amount: amt, category_id: categoryId, account_id: accountId,
      merchant: merchant || null, notes: notes || null, tag,
      frequency, start_date: startDate, next_date: nextDate,
      notifications_enabled: notificationsEnabled,
      notify_days_before: notifyDaysBefore,
      notify_time: notifyTime,
      is_active: true,
    });
    setShowAdd(false);
    resetForm();
    load();
  };

  const handleToggleNotifications = async (r: RecurringTransaction) => {
    await updateRecurringTransaction(r.id, { notifications_enabled: !r.notifications_enabled });
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteRecurringTransaction(id);
    load();
  };

  const handleLogNow = async (r: RecurringTransaction) => {
    await createTransaction({
      type: r.type,
      amount: r.amount,
      category_id: r.category_id,
      date: getTodayString(),
      account_id: r.account_id,
      merchant: r.merchant || null,
      notes: r.notes || null,
      tag: r.tag,
      tags: [],
    });
    await updateRecurringTransaction(r.id, {
      last_generated: getTodayString(),
      next_date: calculateNextDate(getTodayString(), r.frequency, r.custom_days || undefined),
    });
    load();
  };

  const filteredCategories = categories.filter(c => c.type === type);

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Recurring</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automated transactions</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAdd(true); }}
          className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center active:scale-90 transition-transform"
        >
          <Plus size={20} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
        </div>
      ) : recurring.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
            <Repeat size={24} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 mb-1">No recurring transactions</p>
          <p className="text-xs text-gray-400 mb-4">Set up salary, rent, subscriptions, etc.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl"
          >
            Add Recurring
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {recurring.map(r => {
            const cat = categories.find(c => c.id === r.category_id);
            const isOverdue = r.next_date < getTodayString() && r.is_active;
            return (
              <div key={r.id} className={`bg-white rounded-2xl p-4 border ${isOverdue ? "border-amber-200" : "border-gray-100"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${r.type === "inflow" ? "bg-emerald-50" : "bg-red-50"}`}>
                      {r.type === "inflow" ? <ArrowUpRight size={18} className="text-emerald-600" /> : <ArrowDownLeft size={18} className="text-red-500" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{r.merchant || cat?.name || "Recurring"}</h3>
                      <p className="text-xs text-gray-400">{cat?.name} · {r.frequency}</p>
                    </div>
                  </div>
                  <span className="text-base font-bold text-gray-900 flex-shrink-0">{formatCurrency(r.amount, settings)}</span>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    <span>Next: {relativeDate(r.next_date)}</span>
                  </div>
                  {isOverdue && <span className="text-amber-500 font-medium">Overdue</span>}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
                  <button
                    onClick={() => handleLogNow(r)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg active:scale-95 transition-transform"
                  >
                    <Check size={13} /> Log Now
                  </button>
                  <button
                    onClick={() => handleToggleNotifications(r)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg ${r.notifications_enabled ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-500"}`}
                  >
                    {r.notifications_enabled ? <Bell size={13} /> : <BellOff size={13} />}
                    {r.notifications_enabled ? "On" : "Off"}
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="ml-auto w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 rounded-lg"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5 pb-8 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">New Recurring</h2>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => { setType("outflow"); setCategoryId(null); }} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${type === "outflow" ? "bg-red-500 text-white" : "bg-gray-50 text-gray-600"}`}>Outflow</button>
                <button onClick={() => { setType("inflow"); setCategoryId(null); }} className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${type === "inflow" ? "bg-emerald-500 text-white" : "bg-gray-50 text-gray-600"}`}>Inflow</button>
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Amount</label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-lg font-bold text-gray-400">{settings.currencySymbol}</span>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" autoFocus className="text-lg font-bold text-gray-900 bg-transparent outline-none flex-1" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {filteredCategories.map(c => (
                    <button key={c.id} onClick={() => { setCategoryId(c.id); setTag(c.tag); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${categoryId === c.id ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}>{c.name}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Frequency</label>
                <div className="flex gap-2">
                  {(["weekly", "monthly", "yearly"] as const).map(f => (
                    <button key={f} onClick={() => setFrequency(f)} className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${frequency === f ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}>{f}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100" />
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Merchant (optional)</label>
                <input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="e.g. Netflix" className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100" />
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Tag</label>
                <div className="flex gap-2">
                  {TAGS.map(t => (
                    <button key={t} onClick={() => setTag(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tag === t ? TAG_BG_COLORS[t] : "bg-white text-gray-500 border-gray-200"}`}>{t}</button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Notifications</span>
                  </div>
                  <Toggle checked={notificationsEnabled} onChange={setNotificationsEnabled} />
                </div>
                {notificationsEnabled && (
                  <div className="space-y-3 pl-6">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Remind</span>
                      <input type="number" min={0} max={30} value={notifyDaysBefore} onChange={e => setNotifyDaysBefore(parseInt(e.target.value) || 0)} className="w-16 px-2 py-1.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100 text-center" />
                      <span className="text-xs text-gray-500">day(s) before at</span>
                      <input type="time" value={notifyTime} onChange={e => setNotifyTime(e.target.value)} className="px-2 py-1.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100" />
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleAdd}
                disabled={!parseFloat(amount) || !categoryId}
                className={`w-full py-3.5 rounded-xl font-semibold text-sm ${parseFloat(amount) && categoryId ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-400"}`}
              >
                Create Recurring Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function calculateNextDate(from: string, frequency: string, customDays?: number): string {
  const d = new Date(from + "T00:00:00");
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  else if (frequency === "custom" && customDays) d.setDate(d.getDate() + customDays);
  return d.toISOString().slice(0, 10);
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`w-10 h-6 rounded-full transition-colors relative ${checked ? "bg-gray-900" : "bg-gray-300"}`}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}
