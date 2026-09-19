import { useState, useEffect, useMemo } from "react";
import { FileBarChart, Download, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, ChevronRight, Check, Loader } from "lucide-react";
import type { AppSettings, Category, TagType } from "@/types";
import { TAGS, TAG_COLORS } from "@/types";
import { fetchTransactions, fetchCategories, fetchBudgets, type TransactionWithNames } from "@/lib/data";
import { formatCurrency, formatCurrencyWithSign, getMonthBounds, getYearBounds, getPeriodBounds, periodLabel, formatDate } from "@/lib/format";
import { exportFile } from "@/lib/exportUtils";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";

const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#0ea5e9",
];

type ReportTab = "summary" | "income" | "expense" | "category" | "payment" | "merchant" | "tag" | "budget";

const TABS: { id: ReportTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "income", label: "Income" },
  { id: "expense", label: "Expense" },
  { id: "category", label: "Category" },
  { id: "tag", label: "Tags" },
  { id: "payment", label: "Payment" },
  { id: "merchant", label: "Merchants" },
  { id: "budget", label: "Budget" },
];

export function Reports({ settings }: { settings: AppSettings }) {
  const [tab, setTab] = useState<ReportTab>("summary");
  const [period, setPeriod] = useState("month");
  const [transactions, setTransactions] = useState<TransactionWithNames[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories().then(setCategories);
  }, []);

  useEffect(() => {
    const { start, end } = getPeriodBounds(period);
    setLoading(true);
    fetchTransactions({ startDate: start, endDate: end, limit: 5000 }).then(data => {
      setTransactions(data);
      setLoading(false);
    });
  }, [period]);

  const stats = useMemo(() => {
    const inflow = transactions.filter(t => t.type === "inflow");
    const outflow = transactions.filter(t => t.type === "outflow");
    return {
      totalInflow: inflow.reduce((s, t) => s + Number(t.amount), 0),
      totalOutflow: outflow.reduce((s, t) => s + Number(t.amount), 0),
      inflowCount: inflow.length,
      outflowCount: outflow.length,
      avgInflow: inflow.length > 0 ? inflow.reduce((s, t) => s + Number(t.amount), 0) / inflow.length : 0,
      avgOutflow: outflow.length > 0 ? outflow.reduce((s, t) => s + Number(t.amount), 0) / outflow.length : 0,
    };
  }, [transactions]);

  const categoryData = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number; count: number }>();
    transactions.forEach(t => {
      const name = t.category_name || "Uncategorized";
      const existing = map.get(name) || { inflow: 0, outflow: 0, count: 0 };
      if (t.type === "inflow") existing.inflow += Number(t.amount);
      else existing.outflow += Number(t.amount);
      existing.count += 1;
      map.set(name, existing);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow));
  }, [transactions]);

  const tagData = useMemo(() => {
    const map = new Map<TagType, { inflow: number; outflow: number; count: number }>();
    TAGS.forEach(t => map.set(t, { inflow: 0, outflow: 0, count: 0 }));
    transactions.forEach(t => {
      const existing = map.get(t.tag) || { inflow: 0, outflow: 0, count: 0 };
      if (t.type === "inflow") existing.inflow += Number(t.amount);
      else existing.outflow += Number(t.amount);
      existing.count += 1;
      map.set(t.tag, existing);
    });
    return Array.from(map.entries()).map(([tag, data]) => ({ tag, ...data }));
  }, [transactions]);

  const paymentData = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number; count: number }>();
    transactions.forEach(t => {
      const name = t.account_name || "Unspecified";
      const existing = map.get(name) || { inflow: 0, outflow: 0, count: 0 };
      if (t.type === "inflow") existing.inflow += Number(t.amount);
      else existing.outflow += Number(t.amount);
      existing.count += 1;
      map.set(name, existing);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => (b.inflow + b.outflow) - (a.inflow + a.outflow));
  }, [transactions]);

  const merchantData = useMemo(() => {
    const map = new Map<string, { inflow: number; outflow: number; count: number; type: string }>();
    transactions.filter(t => t.merchant).forEach(t => {
      const name = t.merchant!;
      const existing = map.get(name) || { inflow: 0, outflow: 0, count: 0, type: t.type };
      if (t.type === "inflow") existing.inflow += Number(t.amount);
      else existing.outflow += Number(t.amount);
      existing.count += 1;
      map.set(name, existing);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [transactions]);

  const monthlyTrend = useMemo(() => {
    const months: { label: string; value: number; secondaryValue: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const bounds = getMonthBounds(d);
      const monthTx = transactions.filter(t => t.date >= bounds.start && t.date <= bounds.end);
      months.push({
        label: d.toLocaleDateString("en", { month: "short" }),
        value: monthTx.filter(t => t.type === "outflow").reduce((s, t) => s + Number(t.amount), 0),
        secondaryValue: monthTx.filter(t => t.type === "inflow").reduce((s, t) => s + Number(t.amount), 0),
      });
    }
    return months;
  }, [transactions]);

  const largestExpenses = useMemo(() =>
    transactions.filter(t => t.type === "outflow").sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 10),
  [transactions]);

  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const exportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const headers = ["Date", "Type", "Amount", "Category", "Merchant", "Account", "Tag", "Notes"];
      const rows = transactions.map(t => [
        t.date,
        t.type,
        t.amount,
        t.category_name || "",
        t.merchant || "",
        t.account_name || "",
        t.tag,
        (t.notes || "").replace(/"/g, '""'),
      ]);
      const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
      const filename = `report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
      const result = await exportFile({
        content: csv,
        filename,
        mimeType: "text/csv",
        dialogTitle: `Export ${periodLabel(period)} Report CSV`,
      });

      if (result.success) {
        setExportMsg(result.method === "shared" ? "Report shared successfully!" : "Report downloaded!");
        setTimeout(() => setExportMsg(null), 3000);
      }
    } catch (err) {
      console.error("Failed to export report:", err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Reports</h1>
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">{periodLabel(period)}</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-600 active:scale-95 transition-transform disabled:opacity-50"
        >
          {exporting ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
          Export
        </button>
      </div>

      {exportMsg && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-medium">
          <Check size={14} className="flex-shrink-0" />
          <span>{exportMsg}</span>
        </div>
      )}

      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar -mx-4 px-4">
        {["month", "last_month", "year"].map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${period === p ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
          >
            {periodLabel(p)}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar -mx-4 px-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${tab === t.id ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
            <FileBarChart size={24} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">No data for this period</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tab === "summary" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Inflow" value={formatCurrency(stats.totalInflow, settings)} icon={<TrendingUp size={16} className="text-emerald-600" />} bg="bg-emerald-50" />
                <StatCard label="Total Outflow" value={formatCurrency(stats.totalOutflow, settings)} icon={<TrendingDown size={16} className="text-red-500" />} bg="bg-red-50" />
                <StatCard label="Net Cash Flow" value={formatCurrencyWithSign(stats.totalInflow - stats.totalOutflow, settings)} icon={<ArrowUpRight size={16} className="text-gray-700" />} bg="bg-blue-50" />
                <StatCard label="Transactions" value={String(transactions.length)} icon={<FileBarChart size={16} className="text-gray-700" />} bg="bg-gray-100" />
              </div>
              <Card title="6-Month Trend" subtitle="Inflow vs Outflow">
                <BarChart
                  data={monthlyTrend}
                  height={180}
                  showSecondary
                  formatValue={(v) => formatCurrency(v, settings)}
                />
                <div className="flex items-center justify-center gap-4 mt-3 text-xs">
                  <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-gray-300" /> Inflow</span>
                  <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Outflow</span>
                </div>
              </Card>
              <Card title="Largest Expenses">
                <div className="space-y-2">
                  {largestExpenses.slice(0, 5).map((t, i) => (
                    <div key={t.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-gray-400 w-4">#{i + 1}</span>
                        <span className="text-sm text-gray-800 truncate">{t.merchant || t.category_name}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(t.amount, settings)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {tab === "income" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Income" value={formatCurrency(stats.totalInflow, settings)} icon={<TrendingUp size={16} className="text-emerald-600" />} bg="bg-emerald-50" />
                <StatCard label="Avg per Tx" value={formatCurrency(stats.avgInflow, settings)} icon={<ArrowUpRight size={16} className="text-gray-700" />} bg="bg-gray-100" />
              </div>
              <Card title="Income by Category">
                <div className="flex items-center justify-center mb-4">
                  <DonutChart
                    data={categoryData.filter(c => c.inflow > 0).map((c, i) => ({ label: c.name, value: c.inflow, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))}
                    centerValue={formatCurrency(stats.totalInflow, settings)}
                    centerLabel="Income"
                  />
                </div>
                <div className="space-y-2">
                  {categoryData.filter(c => c.inflow > 0).map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        <span className="text-sm text-gray-700">{c.name}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(c.inflow, settings)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {tab === "expense" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Expense" value={formatCurrency(stats.totalOutflow, settings)} icon={<TrendingDown size={16} className="text-red-500" />} bg="bg-red-50" />
                <StatCard label="Avg per Tx" value={formatCurrency(stats.avgOutflow, settings)} icon={<ArrowDownRight size={16} className="text-gray-700" />} bg="bg-gray-100" />
              </div>
              <Card title="Expense by Category">
                <div className="flex items-center justify-center mb-4">
                  <DonutChart
                    data={categoryData.filter(c => c.outflow > 0).map((c, i) => ({ label: c.name, value: c.outflow, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))}
                    centerValue={formatCurrency(stats.totalOutflow, settings)}
                    centerLabel="Expenses"
                  />
                </div>
                <div className="space-y-2">
                  {categoryData.filter(c => c.outflow > 0).sort((a, b) => b.outflow - a.outflow).map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        <span className="text-sm text-gray-700 truncate">{c.name}</span>
                        <span className="text-xs text-gray-400">({c.count})</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(c.outflow, settings)}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Daily Spending Trend">
                <LineChart data={monthlyTrend} height={160} color="#ef4444" formatValue={v => formatCurrency(v, settings)} />
              </Card>
            </>
          )}

          {tab === "category" && (
            <Card title="Category Analysis" subtitle="All categories with inflow/outflow">
              <div className="space-y-3">
                {categoryData.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 block">{c.name}</span>
                      <span className="text-xs text-gray-400">{c.count} transactions</span>
                    </div>
                    <div className="text-right">
                      {c.inflow > 0 && <span className="text-sm text-emerald-600 block">+{formatCurrency(c.inflow, settings)}</span>}
                      {c.outflow > 0 && <span className="text-sm text-red-500 block">-{formatCurrency(c.outflow, settings)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "tag" && (
            <Card title="Tag Analysis" subtitle="Need / Want / Invest / Transfer">
              <div className="space-y-3">
                {tagData.map(t => (
                  <div key={t.tag} className="p-3 rounded-xl border" style={{ borderColor: `${TAG_COLORS[t.tag]}30`, background: `${TAG_COLORS[t.tag]}08` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: TAG_COLORS[t.tag] }} />
                        <span className="text-sm font-semibold text-gray-900">{t.tag}</span>
                        <span className="text-xs text-gray-400">({t.count} tx)</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      {t.inflow > 0 && <span className="text-emerald-600">+{formatCurrency(t.inflow, settings)}</span>}
                      {t.outflow > 0 && <span className="text-red-500">-{formatCurrency(t.outflow, settings)}</span>}
                      <span className="text-gray-400 text-xs">Net: {formatCurrencyWithSign(t.inflow - t.outflow, settings)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "payment" && (
            <Card title="Payment Method Analysis" subtitle="Spending by account type">
              <div className="space-y-3">
                {paymentData.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 block">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.count} transactions</span>
                    </div>
                    <div className="text-right">
                      {p.inflow > 0 && <span className="text-sm text-emerald-600 block">+{formatCurrency(p.inflow, settings)}</span>}
                      {p.outflow > 0 && <span className="text-sm text-red-500 block">-{formatCurrency(p.outflow, settings)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "merchant" && (
            <Card title="Merchant Analysis" subtitle="Spending by payee">
              <div className="space-y-3">
                {merchantData.slice(0, 15).map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-gray-600">{m.name[0]?.toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900 block truncate">{m.name}</span>
                        <span className="text-xs text-gray-400">{m.count} transactions</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(m.inflow + m.outflow, settings)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "budget" && (
            <BudgetReport settings={settings} />
          )}
        </div>
      )}
    </div>
  );
}

function BudgetReport({ settings }: { settings: AppSettings }) {
  const [budgetData, setBudgetData] = useState<{ name: string; spent: number; budget: number; percentage: number }[]>([]);

  useEffect(() => {
    (async () => {
      const [budgets, cats, txs] = await Promise.all([
        fetchBudgets(),
        fetchCategories(),
        fetchTransactions({ ...getMonthBounds(), limit: 5000 }),
      ]);
      const data = budgets.map(b => {
        const spent = b.type === "overall"
          ? txs.filter(t => t.type === "outflow").reduce((s, t) => s + Number(t.amount), 0)
          : txs.filter(t => t.type === "outflow" && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
        const cat = cats.find(c => c.id === b.category_id);
        return {
          name: b.type === "overall" ? "Overall" : cat?.name || "Category",
          spent,
          budget: b.amount,
          percentage: b.amount > 0 ? (spent / b.amount) * 100 : 0,
        };
      });
      setBudgetData(data);
    })();
  }, []);

  if (budgetData.length === 0) {
    return (
      <Card title="Budget Performance">
        <p className="text-sm text-gray-400 text-center py-6">No budgets set. Create budgets in the Budgets tab.</p>
      </Card>
    );
  }

  return (
    <Card title="Budget Performance" subtitle="Current month">
      <div className="space-y-3">
        {budgetData.map((b, i) => {
          const isOver = b.percentage >= 100;
          const isWarning = b.percentage >= 80 && !isOver;
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-900">{b.name}</span>
                <span className="text-xs text-gray-500">{formatCurrency(b.spent, settings)} / {formatCurrency(b.budget, settings)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${isOver ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(b.percentage, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className={`text-xs font-medium ${isOver ? "text-red-500" : isWarning ? "text-amber-500" : "text-emerald-600"}`}>
                  {b.percentage.toFixed(0)}% used
                </span>
                <span className={`text-xs ${b.budget - b.spent < 0 ? "text-red-500" : "text-gray-400"}`}>
                  {b.budget - b.spent < 0 ? "Over by " : "Left "}{formatCurrency(Math.abs(b.budget - b.spent), settings)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StatCard({ label, value, icon, bg }: { label: string; value: string; icon: React.ReactNode; bg: string }) {
  return (
    <div className="bg-white rounded-2xl p-3.5 border border-gray-100">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>{icon}</div>
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
