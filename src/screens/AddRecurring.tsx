import { useState, useEffect, useMemo } from "react";
import { X, ArrowDownLeft, ArrowUpRight, Bell, Calendar, Tag as TagIcon, CreditCard, Clock } from "lucide-react";
import type { AppSettings, Category } from "@/types";
import { TransactionType, TagType, RecurringFrequency, TAGS, TAG_BG_COLORS } from "@/types";
import {
  createRecurringTransaction, updateRecurringTransaction,
  fetchCategories, fetchAccounts
} from "@/lib/data";
import { formatInputAmount, parseInputAmount, getTodayString } from "@/lib/format";
import { scheduleRecurringReminder, cancelRecurringReminder } from "@/lib/recurringReminders";
import { checkNotificationPermissions, requestNotificationPermissions } from "@/lib/notifications";
import { loadSettings, saveSettings } from "@/lib/settings";
import { db } from "@/lib/db";

interface AddRecurringProps {
  settings: AppSettings;
  editId: string | null;
  onDone: () => void;
  onCancel: () => void;
}

export function AddRecurring({ settings, editId, onDone, onCancel }: AddRecurringProps) {
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

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [cats, accs] = await Promise.all([
        fetchCategories(),
        fetchAccounts(),
      ]);
      setCategories(cats);
      setAccounts(accs.map(a => ({ id: a.id, name: a.name })));

      if (editId) {
        const item = await db.recurring_transactions.get(editId);
        if (item) {
          setType(item.type);
          setAmount(item.amount ? formatInputAmount(String(item.amount), settings.currency) : "");
          setCategoryId(item.category_id);
          setAccountId(item.account_id);
          setMerchant(item.merchant || "");
          setNotes(item.notes || "");
          setTag(item.tag);
          setFrequency(item.frequency);
          setStartDate(item.start_date);
          setNextDueDate(item.next_date || item.start_date);
          setNotificationsEnabled(item.notifications_enabled);
          setNotifyDaysBefore(item.notify_days_before ?? 1);
          setNotifyTime(item.notify_time || "09:00");
          setRepeatUntilDue(item.repeat_until_acknowledged ?? false);
        }
      } else {
        const firstCat = cats.find(c => c.type === "outflow");
        if (firstCat) {
          setCategoryId(firstCat.id);
          setTag(firstCat.tag);
        }
        if (accs.length > 0) {
          const def = accs.find(a => a.is_default);
          setAccountId(def ? def.id : accs[0].id);
        }
      }
      setLoading(false);
    }
    init();
  }, [editId, settings.currency]);

  const filteredCategories = useMemo(
    () => categories.filter(c => c.type === type),
    [categories, type]
  );

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    const firstCat = categories.find(c => c.type === newType);
    if (firstCat) {
      setCategoryId(firstCat.id);
      setTag(firstCat.tag);
    }
  };

  const handleCategoryChange = (catId: string) => {
    setCategoryId(catId);
    const cat = categories.find(c => c.id === catId);
    if (cat) setTag(cat.tag);
  };

  const handleToggleNotifications = async (val: boolean) => {
    if (val) {
      const perm = await checkNotificationPermissions();
      if (perm !== "granted") {
        const requested = await requestNotificationPermissions();
        if (requested === "denied") {
          alert("Notification permissions are blocked in your browser. Please allow notifications in site settings to receive reminders.");
          setNotificationsEnabled(false);
          return;
        }
      }
      const curSettings = await loadSettings();
      if (!curSettings.notificationsEnabled) {
        await saveSettings({ ...curSettings, notificationsEnabled: true });
      }
    }
    setNotificationsEnabled(val);
  };

  const handleSave = async () => {
    const amt = parseInputAmount(amount);
    if (!amt || amt <= 0 || !categoryId) return;
    setSaving(true);

    try {
      if (notificationsEnabled) {
        const perm = await checkNotificationPermissions();
        if (perm !== "granted") {
          const req = await requestNotificationPermissions();
          if (req === "granted") {
            const curSettings = await loadSettings();
            if (!curSettings.notificationsEnabled) {
              await saveSettings({ ...curSettings, notificationsEnabled: true });
            }
          }
        } else {
          const curSettings = await loadSettings();
          if (!curSettings.notificationsEnabled) {
            await saveSettings({ ...curSettings, notificationsEnabled: true });
          }
        }
      }

      const cat = categories.find(c => c.id === categoryId);

      if (editId) {
        await updateRecurringTransaction(editId, {
          type,
          amount: amt,
          category_id: categoryId,
          account_id: accountId,
          merchant: merchant.trim() || null,
          notes: notes.trim() || null,
          tag,
          frequency,
          start_date: startDate,
          next_date: nextDueDate || startDate,
          notifications_enabled: notificationsEnabled,
          notify_days_before: notifyDaysBefore,
          notify_time: notifyTime,
          repeat_until_acknowledged: repeatUntilDue,
        });

        const updated = await db.recurring_transactions.get(editId);
        if (updated) {
          if (updated.notifications_enabled && updated.is_active) {
            await scheduleRecurringReminder(updated, cat?.name);
          } else {
            await cancelRecurringReminder(editId);
          }
        }
      } else {
        const firstDueDate = startDate;
        const created = await createRecurringTransaction({
          type,
          amount: amt,
          category_id: categoryId,
          account_id: accountId,
          merchant: merchant.trim() || null,
          notes: notes.trim() || null,
          tag,
          frequency,
          start_date: startDate,
          next_date: firstDueDate,
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

      onDone();
    } catch (e) {
      console.error("Failed to save recurring transaction:", e);
      setSaving(false);
    }
  };

  const canSave = parseInputAmount(amount) > 0 && !!categoryId;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-20 min-h-screen flex flex-col">
      {/* Top App Bar */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Cancel"
        >
          <X size={18} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">
          {editId ? "Edit Recurring Item" : "New Recurring Item"}
        </h1>
        <div className="w-9" />
      </div>

      {/* Type Toggle */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => handleTypeChange(TransactionType.Outflow)}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
            type === TransactionType.Outflow
              ? "bg-red-500 text-white shadow-sm"
              : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          <ArrowDownLeft size={18} />
          Expense
        </button>
        <button
          onClick={() => handleTypeChange(TransactionType.Inflow)}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
            type === TransactionType.Inflow
              ? "bg-emerald-500 text-white shadow-sm"
              : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          <ArrowUpRight size={18} />
          Income
        </button>
      </div>

      <div className="space-y-4 flex-1">
        {/* Card 1: Amount */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <label className="text-xs text-gray-500 font-medium block mb-2">Amount</label>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-400">{settings.currencySymbol}</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(formatInputAmount(e.target.value, settings.currency))}
              placeholder="0"
              autoFocus={!editId}
              className="text-2xl font-bold text-gray-900 bg-transparent outline-none flex-1"
            />
          </div>
        </div>

        {/* Card 2: Payee & Category */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-4">
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-2">Payee / Description</label>
            <input
              type="text"
              value={merchant}
              onChange={e => setMerchant(e.target.value)}
              placeholder="e.g. Netflix, Rent, Salary, Gym"
              className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 focus:border-gray-300 font-medium"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 font-medium block mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {filteredCategories.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleCategoryChange(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    categoryId === c.id
                      ? "bg-gray-900 text-white shadow-xs"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {type === TransactionType.Outflow && (
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">Classification Tag</label>
              <div className="flex gap-2">
                {TAGS.map(t => (
                  <button
                    key={t}
                    onClick={() => setTag(t)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      tag === t
                        ? "bg-gray-900 text-white shadow-xs"
                        : `${TAG_BG_COLORS[t]} hover:opacity-80`
                    }`}
                  >
                    <TagIcon size={12} />
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card 3: Schedule & Billing */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">Frequency</label>
              <select
                value={frequency}
                onChange={e => setFrequency(e.target.value as RecurringFrequency)}
                className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 capitalize font-medium"
              >
                <option value={RecurringFrequency.Daily}>Daily</option>
                <option value={RecurringFrequency.Weekly}>Weekly</option>
                <option value={RecurringFrequency.Monthly}>Monthly</option>
                <option value={RecurringFrequency.Yearly}>Yearly</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 font-medium block mb-2">
                {editId ? "Next Due Date" : "Start Date"}
              </label>
              <input
                type="date"
                value={editId ? nextDueDate : startDate}
                onChange={e => {
                  if (editId) {
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
            <select
              value={accountId || ""}
              onChange={e => setAccountId(e.target.value || null)}
              className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 font-medium"
            >
              <option value="">Unspecified</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 font-medium block mb-2">Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Account number, contract info"
              className="w-full px-3.5 py-2.5 bg-gray-50 rounded-xl text-sm outline-none border border-gray-100 font-medium"
            />
          </div>
        </div>

        {/* Card 4: Reminders & Notifications */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Bell size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Notifications Reminder</p>
                <p className="text-xs text-gray-400">Push notification alerts before due date</p>
              </div>
            </div>
            <Toggle checked={notificationsEnabled} onChange={handleToggleNotifications} />
          </div>

          {notificationsEnabled && (
            <div className="space-y-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-600 font-medium">Advance Notice</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={notifyDaysBefore}
                    onChange={e => setNotifyDaysBefore(parseInt(e.target.value) || 0)}
                    className="w-14 px-2 py-1.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-200 text-center font-semibold"
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
                  className="px-2.5 py-1.5 bg-gray-50 rounded-lg text-xs outline-none border border-gray-200 font-semibold"
                />
              </div>

              {notifyDaysBefore > 0 && (
                <div className="pt-2 border-t border-gray-100">
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

        {/* Save Button */}
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm shadow-lg transition-all ${
              canSave && !saving
                ? "bg-gray-900 hover:bg-black text-white active:scale-95 shadow-gray-900/10"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving
              ? "Saving..."
              : editId
              ? "Save Changes"
              : "Create Recurring Item"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
        checked ? "bg-gray-900" : "bg-gray-300"
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
