import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, Calendar, Sparkles, ChevronRight } from "lucide-react";
import type { AppSettings } from "@/types";
import { TAG_COLORS, TAGS, type TagType } from "@/types";
import { fetchTransactions, fetchCategories, type TransactionWithNames } from "@/lib/data";
import { formatCurrency, formatCurrencyWithSign, getPeriodBounds, periodLabel, relativeDate, getMonthBounds, getLastMonthBounds, formatDate } from "@/lib/format";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import type { ScreenName } from "@/App";

interface DashboardProps {
  settings: AppSettings;
  onNavigate: (s: ScreenName) => void;
  onEditTransaction: (id: string) => void;
}

const PERIODS = ["today", "week", "month", "last_month", "year", "custom"] as const;

const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#0ea5e9",
];

export function Dashboard({ settings, onNavigate, onEditTransaction }: DashboardProps) {
  const [period, setPeriod] = useState<string>("month");
  const [customStart, setCustomStart] = useState<string>(getMonthBounds().start);
  const [customEnd, setCustomEnd] = useState<string>(getMonthBounds().end);
  const [transactions, setTransactions] = useState<TransactionWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAIButton, setShowAIButton] = useState(false);

  useEffect(() => {
    if (settings.aiSettings?.apiKey) {
      setShowAIButton(true);
    }
  }, [settings.aiSettings]);

  const load = async () => {
    setLoading(true);
    let start: string;
    let end: string;
    if (period === "custom") {
      start = customStart;
      end = customEnd;
    } else {
      const bounds = getPeriodBounds(period);
      start = bounds.start;
      end = bounds.end;
    }
    const data = await fetchTransactions({ startDate: start, endDate: end, limit: 2000 });
    setTransactions(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [period, customStart, customEnd]);

  const stats = useMemo(() => {
    const inflow = transactions.filter(t => t.type === "inflow");
    const outflow = transactions.filter(t => t.type === "outflow");
    const totalInflow = inflow.reduce((s, t) => s + Number(t.amount), 0);
    const totalOutflow = outflow.reduce((s, t) => s + Number(t.amount), 0);
    const netCashFlow = totalInflow - totalOutflow;

    let start: string;
    let end: string;
    if (period === "custom") {
      start = customStart;
      end = customEnd;
    } else {
      const bounds = getPeriodBounds(period);
      start = bounds.start;
      end = bounds.end;
    }
    const days = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const avgDailySpending = totalOutflow / days;

    const largest = outflow.length > 0 ? outflow.reduce((max, t) => Number(t.amount) > Number(max.amount) ? t : max) : null;

    return {
      totalInflow,
      totalOutflow,
      netCashFlow,
      avgDailySpending,
      largest,
      count: transactions.length,
    };
  }, [transactions, period]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    transactions.filter(t => t.type === "outflow").forEach(t => {
      const name = t.category_name || "Uncategorized";
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [transactions]);

  const inflowBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    transactions.filter(t => t.type === "inflow").forEach(t => {
      const name = t.category_name || "Uncategorized";
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [transactions]);

  const tagBreakdown = useMemo(() => {
    const map = new Map<TagType, number>();
    transactions.filter(t => t.type === "outflow").forEach(t => {
      map.set(t.tag, (map.get(t.tag) || 0) + Number(t.amount));
    });
    return TAGS.map(tag => ({
      label: tag,
      value: map.get(tag) || 0,
      color: TAG_COLORS[tag],
    })).filter(t => t.value > 0);
  }, [transactions]);

  const dailyTrend = useMemo(() => {
    const { start, end } = getPeriodBounds(period);
    const days = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const map = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    transactions.filter(t => t.type === "outflow").forEach(t => {
      map.set(t.date, (map.get(t.date) || 0) + Number(t.amount));
    });
    const entries = Array.from(map.entries());
    if (period === "year" || days > 31) {
      const weekly: { label: string; value: number }[] = [];
      for (let i = 0; i < entries.length; i += 7) {
        const week = entries.slice(i, i + 7);
        const sum = week.reduce((s, [, v]) => s + v, 0);
        weekly.push({ label: `W${Math.floor(i / 7) + 1}`, value: sum });
      }
      return weekly;
    }
    return entries.map(([date, value]) => ({
      label: new Date(date + "T00:00:00").getDate().toString(),
      value,
    }));
  }, [transactions, period]);

  const monthComparison = useMemo(() => {
    const thisMonth = getMonthBounds();
    const lastMonth = getLastMonthBounds();
    const thisOutflow = transactions
      .filter(t => t.type === "outflow" && t.date >= thisMonth.start && t.date <= thisMonth.end)
      .reduce((s, t) => s + Number(t.amount), 0);
    const lastOutflow = transactions
      .filter(t => t.type === "outflow" && t.date >= lastMonth.start && t.date <= lastMonth.end)
      .reduce((s, t) => s + Number(t.amount), 0);
    return [
      { label: "Last", value: lastOutflow, color: "#cbd5e1" },
      { label: "This", value: thisOutflow, color: "#3b82f6" },
    ];
  }, [transactions]);

  const topMerchants = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    transactions.filter(t => t.type === "outflow" && t.merchant).forEach(t => {
      const name = t.merchant!;
      const existing = map.get(name) || { count: 0, total: 0 };
      map.set(name, { count: existing.count + 1, total: existing.total + Number(t.amount) });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, info]) => ({ name, ...info }));
  }, [transactions]);

  const recentTransactions = useMemo(() =>
    [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 5),
  [transactions]);

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="PennyWise Logo" className="w-10 h-10 rounded-full border border-gray-100 shadow-sm" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">PennyWise</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {period === "custom" ? `${formatDate(customStart, settings)} – ${formatDate(customEnd, settings)}` : periodLabel(period)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showAIButton && (
            <button
              onClick={() => onNavigate("add-ai")}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform"
            >
              <Sparkles size={15} />
              AI
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar -mx-4 px-4">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              period === p
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {p === "custom" ? "Custom Range" : periodLabel(p)}
          </button>
        ))}
      </div>

      {period === "custom" && (
        <div className="bg-white rounded-2xl p-3 border border-gray-100 shadow-sm mb-5 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">From</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full bg-gray-50 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none border border-gray-100 font-medium"
            />
          </div>
          <div className="text-gray-300 self-end pb-2 font-medium">→</div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">To</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full bg-gray-50 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 outline-none border border-gray-100 font-medium"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState onAdd={() => onNavigate("add-transaction")} />
      ) : (
        <div className="space-y-4">
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Inflow"
              value={formatCurrency(stats.totalInflow, settings)}
              icon={<TrendingUp size={16} className="text-emerald-600" />}
              bg="bg-emerald-50"
            />
            <MetricCard
              label="Outflow"
              value={formatCurrency(stats.totalOutflow, settings)}
              icon={<TrendingDown size={16} className="text-red-500" />}
              bg="bg-red-50"
            />
            <MetricCard
              label="Net Cash Flow"
              value={formatCurrencyWithSign(stats.netCashFlow, settings)}
              icon={<Wallet size={16} className="text-gray-700" />}
              bg={stats.netCashFlow >= 0 ? "bg-blue-50" : "bg-orange-50"}
            />
            <MetricCard
              label="Avg Daily Spend"
              value={formatCurrency(stats.avgDailySpending, settings)}
              icon={<Calendar size={16} className="text-gray-700" />}
              bg="bg-gray-100"
            />
          </div>

          {/* Net flow card */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Cash Flow Summary</h3>
              <span className="text-xs text-gray-400">{stats.count} transactions</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-gray-600">Inflow</span>
              </div>
              <span className="text-sm font-semibold text-emerald-600">{formatCurrency(stats.totalInflow, settings)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${stats.totalInflow + stats.totalOutflow > 0 ? (stats.totalInflow / (stats.totalInflow + stats.totalOutflow)) * 100 : 0}%` }} />
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="text-xs text-gray-600">Outflow</span>
              </div>
              <span className="text-sm font-semibold text-red-500">{formatCurrency(stats.totalOutflow, settings)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all duration-700"
                style={{ width: `${stats.totalInflow + stats.totalOutflow > 0 ? (stats.totalOutflow / (stats.totalInflow + stats.totalOutflow)) * 100 : 0}%` }} />
            </div>
          </div>

          {/* Daily spending trend */}
          {dailyTrend.length > 1 && (
            <Card title="Spending Trend" subtitle={period === "year" ? "Weekly breakdown" : "Daily breakdown"}>
              <LineChart
                data={dailyTrend}
                height={160}
                color="#3b82f6"
                formatValue={(v) => formatCurrency(v, settings)}
              />
            </Card>
          )}

          {/* Month comparison */}
          {period === "month" && monthComparison[0].value > 0 && (
            <Card title="Month-over-Month" subtitle="Outflow comparison">
              <BarChart
                data={monthComparison}
                height={140}
                formatValue={(v) => formatCurrency(v, settings)}
              />
              <div className="mt-3 flex items-center justify-center gap-4 text-xs">
                {(() => {
                  const diff = monthComparison[1].value - monthComparison[0].value;
                  const pct = monthComparison[0].value > 0 ? (diff / monthComparison[0].value) * 100 : 0;
                  const isUp = diff > 0;
                  return (
                    <div className={`flex items-center gap-1 ${isUp ? "text-red-500" : "text-emerald-600"}`}>
                      {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      <span className="font-medium">{Math.abs(pct).toFixed(0)}% vs last month</span>
                    </div>
                  );
                })()}
              </div>
            </Card>
          )}

          {/* Category breakdown */}
          {categoryBreakdown.length > 0 && (
            <Card title="Spending by Category" subtitle="Outflow distribution">
              <div className="flex items-center justify-center mb-4">
                <DonutChart
                  data={categoryBreakdown}
                  size={160}
                  thickness={24}
                  centerValue={formatCurrency(stats.totalOutflow, settings)}
                  centerLabel="Total"
                />
              </div>
              <div className="space-y-2">
                {categoryBreakdown.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                      <span className="text-sm text-gray-700 truncate">{c.label}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(c.value, settings)}</span>
                      <span className="text-xs text-gray-400 w-10 text-right">
                        {stats.totalOutflow > 0 ? ((c.value / stats.totalOutflow) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Tag breakdown */}
          {tagBreakdown.length > 0 && (
            <Card title="Spending by Tag" subtitle="Need / Want / Invest / Transfer">
              <div className="grid grid-cols-2 gap-3">
                {tagBreakdown.map(t => (
                  <div key={t.label} className="rounded-xl p-3 border" style={{ borderColor: `${t.color}30`, background: `${t.color}08` }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                      <span className="text-xs font-medium text-gray-700">{t.label}</span>
                    </div>
                    <span className="text-base font-bold text-gray-900">{formatCurrency(t.value, settings)}</span>
                    <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${stats.totalOutflow > 0 ? (t.value / stats.totalOutflow) * 100 : 0}%`, background: t.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Inflow breakdown */}
          {inflowBreakdown.length > 0 && (
            <Card title="Inflow by Category" subtitle="Income sources">
              <div className="space-y-2">
                {inflowBreakdown.map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                      <span className="text-sm text-gray-700 truncate">{c.label}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(c.value, settings)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Top merchants */}
          {topMerchants.length > 0 && (
            <Card title="Frequent Merchants" subtitle="Most visited">
              <div className="space-y-2.5">
                {topMerchants.map((m, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-gray-600">{m.name[0]?.toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm text-gray-800 block truncate">{m.name}</span>
                        <span className="text-xs text-gray-400">{m.count} transactions</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(m.total, settings)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Largest transaction */}
          {stats.largest && (
            <Card title="Largest Transaction" subtitle="Biggest outflow this period">
              <button
                onClick={() => onEditTransaction(stats.largest!.id)}
                className="w-full flex items-center justify-between p-3 -m-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <ArrowDownRight size={18} className="text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900 block truncate">
                      {stats.largest.notes?.trim() || stats.largest.category_name || "Transaction"}
                    </span>
                    <span className="text-xs text-gray-400 block truncate">
                      {stats.largest.notes?.trim()
                        ? `${stats.largest.category_name || "Uncategorized"}${stats.largest.merchant ? ` · ${stats.largest.merchant}` : ""}`
                        : `${stats.largest.merchant ? `${stats.largest.merchant} · ` : ""}${stats.largest.category_name || "Uncategorized"}`} · {relativeDate(stats.largest.date)}
                    </span>
                  </div>
                </div>
                <span className="text-base font-bold text-red-500">{formatCurrency(stats.largest.amount, settings)}</span>
              </button>
            </Card>
          )}

          {/* Recent transactions */}
          <Card title="Recent Activity" subtitle="Latest transactions">
            <div className="space-y-1">
              {recentTransactions.map(t => (
                <button
                  key={t.id}
                  onClick={() => onEditTransaction(t.id)}
                  className="w-full flex items-center justify-between p-2 -m-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      t.type === "inflow" ? "bg-emerald-50" : "bg-red-50"
                    }`}>
                      {t.type === "inflow" ? <ArrowUpRight size={15} className="text-emerald-600" /> : <ArrowDownRight size={15} className="text-red-500" />}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm text-gray-800 block truncate">
                        {t.notes?.trim() || t.category_name || "Transaction"}
                      </span>
                      <span className="text-xs text-gray-400 block truncate">
                        {t.notes?.trim()
                          ? `${t.category_name || "Uncategorized"}${t.merchant ? ` · ${t.merchant}` : ""}`
                          : `${t.merchant ? `${t.merchant} · ` : ""}${t.category_name || "Uncategorized"}`} · {relativeDate(t.date)}
                      </span>
                    </div>
                  </div>
                  <span className={`text-sm font-medium flex-shrink-0 ${t.type === "inflow" ? "text-emerald-600" : "text-gray-900"}`}>
                    {t.type === "inflow" ? "+" : "-"}{formatCurrency(t.amount, settings)}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => onNavigate("transactions")}
              className="w-full mt-3 flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors py-2"
            >
              View all transactions
              <ChevronRight size={15} />
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, bg }: { label: string; value: string; icon: React.ReactNode; bg: string }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 border border-gray-100">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-base font-bold text-gray-900 truncate">{value}</p>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <Wallet size={28} className="text-gray-400" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">No transactions yet</h3>
      <p className="text-sm text-gray-500 mb-6">Add your first transaction to start tracking your finances</p>
      <button
        onClick={onAdd}
        className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl active:scale-95 transition-transform"
      >
        Add Transaction
      </button>
    </div>
  );
}
