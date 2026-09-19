import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Trash2, Repeat, Bell, BellOff, Calendar, Check, ArrowDownLeft, ArrowUpRight, Edit2 } from "lucide-react";
import type { AppSettings, Category, RecurringTransaction } from "@/types";
import { TransactionType, TagType, RecurringFrequency, TAGS, TAG_BG_COLORS } from "@/types";
import {
  fetchRecurringTransactions, createRecurringTransaction, updateRecurringTransaction,
  deleteRecurringTransaction, fetchCategories, fetchAccounts, createTransaction
} from "@/lib/data";
import { formatCurrency, formatDate, getTodayString, relativeDate, formatInputAmount, parseInputAmount } from "@/lib/format";
import { scheduleRecurringReminder, cancelRecurringReminder } from "@/lib/recurringReminders";
import { db } from "@/lib/db";

export function Recurring({
  settings,
  targetRecurringId,
}: {
  settings: AppSettings;
  targetRecurringId?: string | null;
}) {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  // form state
  const [type, setType] = useState<TransactionType>(TransactionType.Outflow);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState<TagType>(TagType.Need);
  const [frequency, setFrequency] = useState<RecurringFrequency>(RecurringFrequency.Monthly);
  const [startDate, setStartDate] = useState(getTodayString());
  const [nextDueDate, setNextDueDate] = useState(getTodayString());
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifyDaysBefore, setNotifyDaysBefore] = useState(1);
  const [notifyTime, setNotifyTime] = useState("09:00");
  const [repeatUntilDue, setRepeatUntilDue] = useState(false);

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
    setEditingId(null);
    setType(TransactionType.Outflow); setAmount(""); setCategoryId(null); setAccountId(null);
    setMerchant(""); setNotes(""); setTag(TagType.Need); setFrequency(RecurringFrequency.Monthly);
    setStartDate(getTodayString()); setNextDueDate(getTodayString()); setNotificationsEnabled(false);
    setNotifyDaysBefore(1); setNotifyTime("09:00"); setRepeatUntilDue(false);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (r: RecurringTransaction) => {
    setEditingId(r.id);
    setType(r.type);
    setAmount(r.amount ? formatInputAmount(String(r.amount), settings.currency) : "");
    setCategoryId(r.category_id);
    setAccountId(r.account_id);
    setMerchant(r.merchant || "");
    setNotes(r.notes || "");
    setTag(r.tag);
    setFrequency(r.frequency);
    setStartDate(r.start_date);
    setNextDueDate(r.next_date || r.start_date);
    setNotificationsEnabled(r.notifications_enabled);
    setNotifyDaysBefore(r.notify_days_before ?? 1);
    setNotifyTime(r.notify_time || "09:00");
    setRepeatUntilDue(r.repeat_until_acknowledged ?? false);
    setShowModal(true);
  };

  const handleSave = async () => {
    const amt = parseInputAmount(amount);
    if (!amt || !categoryId) return;

    const cat = categories.find(c => c.id === categoryId);

    if (editingId) {
      await updateRecurringTransaction(editingId, {
        type,
        amount: amt,
        category_id: categoryId,
        account_id: accountId,
        merchant: merchant || null,
        notes: notes || null,
        tag,
        frequency,
        start_date: startDate,
        next_date: nextDueDate || startDate,
        notifications_enabled: notificationsEnabled,
        notify_days_before: notifyDaysBefore,
        notify_time: notifyTime,
        repeat_until_acknowledged: repeatUntilDue,
      });

      const updated = await db.recurring_transactions.get(editingId);
      if (updated) {
        if (updated.notifications_enabled && updated.is_active) {
          await scheduleRecurringReminder(updated, cat?.name);
        } else {
          await cancelRecurringReminder(editingId);
        }
      }
    } else {
      // The first due date of a newly created recurring transaction is its startDate!
      const firstDueDate = startDate;
      const created = await createRecurringTransaction({
        type, amount: amt, category_id: categoryId, account_id: accountId,
        merchant: merchant || null, notes: notes || null, tag,
        frequency, start_date: startDate, next_date: firstDueDate,
        notifications_enabled: notificationsEnabled,
        notify_days_before: notifyDaysBefore,
        notify_time: notifyTime,
        repeat_until_acknowledged: repeatUntilDue,
        is_active: true,
      });

      if (created.notifications_enabled) {
        await scheduleRecurringReminder(created, cat?.name);
      }
    }

    setShowModal(false);
    resetForm();
    load();
  };

  const handleToggleNotifications = async (r: RecurringTransaction, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextVal = !r.notifications_enabled;
    await updateRecurringTransaction(r.id, { notifications_enabled: nextVal });
    const cat = categories.find(c => c.id === r.category_id);
    if (nextVal && r.is_active) {
      await scheduleRecurringReminder({ ...r, notifications_enabled: true }, cat?.name);
    } else {
      await cancelRecurringReminder(r.id);
    }
    load();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await cancelRecurringReminder(id);
    await deleteRecurringTransaction(id);
    load();
  };

  const handleLogNow = async (r: RecurringTransaction, e: React.MouseEvent) => {
    e.stopPropagation();
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
    const nextDate = calculateNextDate(getTodayString(), r.frequency, r.custom_days || undefined);
    await updateRecurringTransaction(r.id, {
      last_generated: getTodayString(),
      next_date: nextDate,
    });
    // Immediately reschedule notifications for the new period!
    const cat = categories.find(c => c.id === r.category_id);
    if (r.notifications_enabled && r.is_active) {
      await scheduleRecurringReminder({ ...r, next_date: nextDate, last_generated: getTodayString() }, cat?.name);
    }
    load();
  };

  useEffect(() => {
    if (targetRecurringId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [targetRecurringId, recurring]);

  const filteredCategories = categories.filter(c => c.type === type);

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Recurring</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automated transactions & bills</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Add Recurring"
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
          <p className="text-xs text-gray-400 mb-4">Set up salary, rent, subscriptions, bills, etc.</p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl"
          >
            Add Recurring
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {targetRecurringId && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-center justify-between text-xs text-blue-700 animate-in fade-in">
              <span>🔔 Reminder opened: Tap <strong>Log Now</strong> below to record this transaction.</span>
            </div>
          )}
          {recurring.map(r => {
            const cat = categories.find(c => c.id === r.category_id);
            const isOverdue = r.next_date < getTodayString() && r.is_active;
            const isTarget = targetRecurringId === r.id;
            return (
              <div
                key={r.id}
                ref={isTarget ? highlightedRef : undefined}
                onClick={() => handleOpenEdit(r)}
                className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm ${
                  isTarget
                    ? "border-blue-500 ring-2 ring-blue-500/30 shadow-md"
                    : isOverdue
                    ? "border-amber-200 hover:border-gray-300"
                    : "border-gray-100 hover:border-gray-300"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${r.type === "inflow" ? "bg-emerald-50" : "bg-red-50"}`}>
                      {r.type === "inflow" ? <ArrowUpRight size={18} className="text-emerald-600" /> : <ArrowDownLeft size={18} className="text-red-500" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{r.merchant || cat?.name || "Recurring"}</h3>
                      <p className="text-xs text-gray-400">{cat?.name || "Uncategorized"} · <span className="capitalize">{r.frequency}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-gray-900 flex-shrink-0">{formatCurrency(r.amount, settings)}</span>
                    <Edit2 size={14} className="text-gray-300" />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    <span>Next: {relativeDate(r.next_date)} ({formatDate(r.next_date, settings)})</span>
                  </div>
                  {isOverdue && <span className="text-amber-500 font-medium">Overdue</span>}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
                  <button
                    onClick={(e) => handleLogNow(r, e)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg active:scale-95 transition-transform"
                  >
                    <Check size={13} /> Log Now
                  </button>
                  <button
                    onClick={(e) => handleToggleNotifications(r, e)}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg ${r.notifications_enabled ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-500"}`}
                  >
                    {r.notifications_enabled ? <Bell size={13} /> : <BellOff size={13} />}
                    {r.notifications_enabled ? "On" : "Off"}
                  </button>
                  <button
                    onClick={(e) => handleDelete(r.id, e)}
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

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-md p-5 pb-8 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? "Edit Recurring" : "New Recurring"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-600" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={() => { setType(TransactionType.Outflow); setCategoryId(null); }} className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${type === TransactionType.Outflow ? "bg-red-500 text-white" : "bg-gray-50 text-gray-600"}`}>Expense</button>
                <button onClick={() => { setType(TransactionType.Inflow); setCategoryId(null); }} className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all ${type === TransactionType.Inflow ? "bg-emerald-500 text-white" : "bg-gray-50 text-gray-600"}`}>Income</button>
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Amount</label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="text-lg font-bold text-gray-400">{settings.currencySymbol}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(formatInputAmount(e.target.value, settings.currency))}
                    placeholder="0"
                    autoFocus
                    className="text-lg font-bold text-gray-900 bg-transparent outline-none flex-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Payee / Description</label>
                <input
                  type="text"
                  value={merchant}
                  onChange={e => setMerchant(e.target.value)}
                  placeholder="e.g. Netflix, Rent, Salary"
                  className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {filteredCategories.map(c => (
                    <button key={c.id} onClick={() => { setCategoryId(c.id); setTag(c.tag); }} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${categoryId === c.id ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>{c.name}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-2">Frequency</label>
                  <select value={frequency} onChange={e => setFrequency(e.target.value as RecurringFrequency)} className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 capitalize font-medium">
                    <option value={RecurringFrequency.Weekly}>Weekly</option>
                    <option value={RecurringFrequency.Monthly}>Monthly</option>
                    <option value={RecurringFrequency.Yearly}>Yearly</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-2">
                    {editingId ? "Next Due Date" : "Start Date"}
                  </label>
                  <input
                    type="date"
                    value={editingId ? nextDueDate : startDate}
                    onChange={e => {
                      if (editingId) {
                        setNextDueDate(e.target.value);
                      } else {
                        setStartDate(e.target.value);
                        setNextDueDate(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Payment Account</label>
                <select value={accountId || ""} onChange={e => setAccountId(e.target.value || null)} className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 font-medium">
                  <option value="">Unspecified</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Notifications Reminder</span>
                  </div>
                  <Toggle checked={notificationsEnabled} onChange={setNotificationsEnabled} />
                </div>
                {notificationsEnabled && (
                  <div className="space-y-3 bg-gray-50/70 rounded-2xl p-3.5 border border-gray-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-600 font-medium">Advance Notice</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={notifyDaysBefore}
                          onChange={e => setNotifyDaysBefore(parseInt(e.target.value) || 0)}
                          className="w-14 px-2 py-1.5 bg-white rounded-lg text-sm outline-none border border-gray-200 text-center font-semibold"
                        />
                        <span className="text-xs text-gray-500">
                          {notifyDaysBefore === 0 ? "days (Due date only)" : notifyDaysBefore === 1 ? "day before" : "days before"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-600 font-medium">Reminder Time</span>
                      <input
                        type="time"
                        value={notifyTime}
                        onChange={e => setNotifyTime(e.target.value)}
                        className="px-2.5 py-1.5 bg-white rounded-lg text-xs outline-none border border-gray-200 font-semibold"
                      />
                    </div>

                    {notifyDaysBefore > 0 && (
                      <div className="pt-2 border-t border-gray-200/60">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-gray-700">Daily Countdown</p>
                            <p className="text-[10px] text-gray-400">
                              {repeatUntilDue
                                ? `Remind daily starting ${notifyDaysBefore}d before up to due date`
                                : `Remind once on advance day and on due date`}
                            </p>
                          </div>
                          <Toggle checked={repeatUntilDue} onChange={setRepeatUntilDue} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={!parseFloat(amount) || !categoryId}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm shadow-lg transition-all ${parseFloat(amount) && categoryId ? "bg-gray-900 text-white active:scale-95" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
              >
                {editingId ? "Update Recurring Item" : "Create Recurring Item"}
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
