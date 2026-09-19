import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Trash2, Repeat, Bell, BellOff, Calendar, Check, ArrowDownLeft, ArrowUpRight, Edit2, AlertCircle, FastForward } from "lucide-react";
import type { AppSettings, Category, RecurringTransaction } from "@/types";
import {
  fetchRecurringTransactions, updateRecurringTransaction,
  deleteRecurringTransaction, fetchCategories, createTransaction,
  skipRecurringTransaction
} from "@/lib/data";
import { formatCurrency, formatDate, getTodayString, relativeDate, calculateNextDate } from "@/lib/format";
import { scheduleRecurringReminder, cancelRecurringReminder } from "@/lib/recurringReminders";
import { checkNotificationPermissions, requestNotificationPermissions } from "@/lib/notifications";
import { loadSettings, saveSettings } from "@/lib/settings";

interface RecurringProps {
  settings: AppSettings;
  targetRecurringId?: string | null;
  onOpenAdd: () => void;
  onOpenEdit: (id: string) => void;
}

export function Recurring({
  settings,
  targetRecurringId,
  onOpenAdd,
  onOpenEdit,
}: RecurringProps) {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const highlightedRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [rec, cats] = await Promise.all([
      fetchRecurringTransactions(),
      fetchCategories(),
    ]);
    setRecurring(rec);
    setCategories(cats);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleNotifications = async (r: RecurringTransaction, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextVal = !r.notifications_enabled;
    if (nextVal) {
      const perm = await checkNotificationPermissions();
      if (perm !== "granted") {
        const requested = await requestNotificationPermissions();
        if (requested === "denied") {
          alert("Notification permissions are blocked in your browser. Please allow notifications in site settings to receive reminders.");
          return;
        }
      }
      const curSettings = await loadSettings();
      if (!curSettings.notificationsEnabled) {
        await saveSettings({ ...curSettings, notificationsEnabled: true });
      }
    }

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
    const nextDate = calculateNextDate(r.next_date, r.frequency, r.custom_days || undefined);
    await updateRecurringTransaction(r.id, {
      last_generated: getTodayString(),
      next_date: nextDate,
    });
    // Cancel old triggers (including overdue slots) and reschedule for the new period
    await cancelRecurringReminder(r.id);
    const cat = categories.find(c => c.id === r.category_id);
    if (r.notifications_enabled && r.is_active) {
      await scheduleRecurringReminder({ ...r, next_date: nextDate, last_generated: getTodayString() }, cat?.name);
    }
    load();
  };

  const handleSkip = async (r: RecurringTransaction, e: React.MouseEvent) => {
    e.stopPropagation();
    await skipRecurringTransaction(r.id);
    load();
  };

  const [batchLoading, setBatchLoading] = useState(false);

  const handleLogAllOverdue = async () => {
    if (overdueItems.length === 0) return;
    if (!confirm(`Record payment for all ${overdueItems.length} overdue bills today?`)) return;
    setBatchLoading(true);
    try {
      for (const r of overdueItems) {
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
        const nextDate = calculateNextDate(r.next_date, r.frequency, r.custom_days || undefined);
        await updateRecurringTransaction(r.id, {
          last_generated: getTodayString(),
          next_date: nextDate,
        });
        await cancelRecurringReminder(r.id);
        const cat = categories.find(c => c.id === r.category_id);
        if (r.notifications_enabled && r.is_active) {
          await scheduleRecurringReminder({ ...r, next_date: nextDate, last_generated: getTodayString() }, cat?.name);
        }
      }
    } finally {
      setBatchLoading(false);
      load();
    }
  };

  const handleSkipAllOverdue = async () => {
    if (overdueItems.length === 0) return;
    if (!confirm(`Skip the current period for all ${overdueItems.length} overdue bills without recording transactions?`)) return;
    setBatchLoading(true);
    try {
      for (const r of overdueItems) {
        await skipRecurringTransaction(r.id);
      }
    } finally {
      setBatchLoading(false);
      load();
    }
  };

  const todayStr = getTodayString();

  const getDaysOverdue = (nextDateStr: string) => {
    const next = new Date(nextDateStr + "T00:00:00").getTime();
    const today = new Date(todayStr + "T00:00:00").getTime();
    return Math.max(1, Math.round((today - next) / (1000 * 60 * 60 * 24)));
  };

  const overdueItems = useMemo(() => {
    return recurring
      .filter(r => r.is_active && r.next_date < todayStr)
      .sort((a, b) => a.next_date.localeCompare(b.next_date));
  }, [recurring, todayStr]);

  const upcomingItems = useMemo(() => {
    return recurring
      .filter(r => !(r.is_active && r.next_date < todayStr))
      .sort((a, b) => a.next_date.localeCompare(b.next_date));
  }, [recurring, todayStr]);

  useEffect(() => {
    if (targetRecurringId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [targetRecurringId, recurring]);

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Recurring</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automated transactions & bills</p>
        </div>
        <button
          onClick={onOpenAdd}
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
            onClick={onOpenAdd}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl"
          >
            Add Recurring
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {targetRecurringId && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-center justify-between text-xs text-blue-700 animate-in fade-in">
              <span>🔔 Reminder opened: Tap <strong>Log Paid</strong> below to record this transaction.</span>
            </div>
          )}

          {/* Overdue Queue */}
          {overdueItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Overdue Bills ({overdueItems.length})
                  </h2>
                </div>
                {overdueItems.length >= 2 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleLogAllOverdue}
                      disabled={batchLoading}
                      className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-[11px] font-semibold rounded-lg shadow-xs transition-all disabled:opacity-50"
                    >
                      <Check size={12} /> Log All
                    </button>
                    <button
                      onClick={handleSkipAllOverdue}
                      disabled={batchLoading}
                      className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-50 active:scale-95 text-amber-800 border border-amber-200 text-[11px] font-semibold rounded-lg shadow-xs transition-all disabled:opacity-50"
                    >
                      <FastForward size={12} /> Skip All
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {overdueItems.map(r => {
                  const cat = categories.find(c => c.id === r.category_id);
                  const isTarget = targetRecurringId === r.id;
                  const daysOverdue = getDaysOverdue(r.next_date);

                  return (
                    <div
                      key={r.id}
                      ref={isTarget ? highlightedRef : undefined}
                      onClick={() => onOpenEdit(r.id)}
                      className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm ${
                        isTarget
                          ? "border-amber-500 ring-2 ring-amber-500/30 shadow-md"
                          : "border-amber-200/90 hover:border-amber-300"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2.5">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                            {r.type === "inflow" ? (
                              <ArrowUpRight size={18} className="text-emerald-600" />
                            ) : (
                              <ArrowDownLeft size={18} className="text-amber-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">
                              {r.merchant || cat?.name || "Recurring"}
                            </h3>
                            <p className="text-xs text-gray-400">
                              {cat?.name || "Uncategorized"} · <span className="capitalize">{r.frequency}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-gray-900 flex-shrink-0">
                            {formatCurrency(r.amount, settings)}
                          </span>
                          <Edit2 size={14} className="text-gray-300" />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs mb-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800 font-semibold text-[11px]">
                          <AlertCircle size={11} />
                          {daysOverdue === 1 ? "1 day overdue" : `${daysOverdue} days overdue`}
                        </span>
                        <span className="text-gray-400 text-xs">Due {formatDate(r.next_date, settings)}</span>
                      </div>

                      <div className="flex items-center gap-2 pt-2.5 border-t border-gray-100">
                        <button
                          onClick={(e) => handleLogNow(r, e)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-lg active:scale-95 transition-transform shadow-xs"
                        >
                          <Check size={13} /> Log Paid
                        </button>
                        <button
                          onClick={(e) => handleSkip(r, e)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium rounded-lg border border-gray-200/80 active:scale-95 transition-transform"
                        >
                          <FastForward size={13} /> Skip
                        </button>
                        <button
                          onClick={(e) => handleToggleNotifications(r, e)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg ${r.notifications_enabled ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-400"}`}
                          title={r.notifications_enabled ? "Notifications active" : "Notifications muted"}
                        >
                          {r.notifications_enabled ? <Bell size={13} /> : <BellOff size={13} />}
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
            </div>
          )}

          {/* Upcoming / Normal Queue */}
          <div>
            {overdueItems.length > 0 && (
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1 mb-2.5 mt-2">
                Upcoming & Active ({upcomingItems.length})
              </h2>
            )}
            {upcomingItems.length === 0 && overdueItems.length > 0 ? (
              <div className="bg-gray-50 rounded-2xl p-4 text-center text-xs text-gray-400">
                All active recurring items are currently in the overdue queue.
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingItems.map(r => {
                  const cat = categories.find(c => c.id === r.category_id);
                  const isTarget = targetRecurringId === r.id;
                  return (
                    <div
                      key={r.id}
                      ref={isTarget ? highlightedRef : undefined}
                      onClick={() => onOpenEdit(r.id)}
                      className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm ${
                        isTarget
                          ? "border-blue-500 ring-2 ring-blue-500/30 shadow-md"
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
          </div>
        </div>
      )}
    </div>
  );
}
