import { useState, useEffect, useMemo } from "react";
import { FileBarChart, Download, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Check, Loader, AlertTriangle, FileText, X } from "lucide-react";
import type { AppSettings, TagType, RecurringTransaction } from "@/types";
import { TAGS, TAG_COLORS, RecurringSubType } from "@/types";
import { fetchTransactions, fetchCategories, fetchBudgets, fetchRecurringTransactions, type TransactionWithNames } from "@/lib/data";
import { formatCurrency, formatCurrencyWithSign, getMonthBounds, getPeriodBounds, periodLabel, formatDate } from "@/lib/format";
import { exportFile } from "@/lib/exportUtils";
import { detectPriceHikes, computeSafeToSpend, type PriceHikeAlert, type SafeToSpendBreakdown } from "@/lib/insights";
import { CategorySpendBreakdown } from "@/components/CategorySpendBreakdown";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";

type ReportTab = "summary" | "subscriptions" | "investments" | "income" | "expense" | "category" | "tag" | "payment" | "merchant" | "budget";

const TABS: { id: ReportTab; label: string }[] = [
  { id: "summary", label: "Overview" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "investments", label: "Investments" },
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
  const [loading, setLoading] = useState(true);
  const [priceHikes, setPriceHikes] = useState<PriceHikeAlert[]>([]);
  const [safeToSpend, setSafeToSpend] = useState<SafeToSpendBreakdown | null>(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState<RecurringTransaction[]>([]);
  const [activeInvestments, setActiveInvestments] = useState<RecurringTransaction[]>([]);
  const [selectedSubForHistory, setSelectedSubForHistory] = useState<PriceHikeAlert | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [reportModules, setReportModules] = useState({
    executiveSummary: true,
    categoryBreakdown: true,
    subscriptions: true,
    investments: true,
    transactionsLedger: false,
  });

  useEffect(() => {
    const { start, end } = getPeriodBounds(period);
    setLoading(true);
    Promise.all([
      fetchTransactions({ startDate: start, endDate: end, limit: 5000 }),
      detectPriceHikes(),
      computeSafeToSpend(),
      fetchRecurringTransactions(),
    ]).then(([txs, hikes, s2s, recs]) => {
      setTransactions(txs);
      setPriceHikes(hikes);
      setSafeToSpend(s2s);
      setActiveSubscriptions(recs.filter(r => r.is_active && (!r.sub_type || r.sub_type === RecurringSubType.Subscription)));
      setActiveInvestments(recs.filter(r => r.is_active && r.sub_type === RecurringSubType.Investment));
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

  const generateCustomReport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const lines: string[] = [];
      lines.push(`================================================================`);
      lines.push(`PENNYWISE FINANCIAL INSIGHTS REPORT`);
      lines.push(`Generated On: ${new Date().toLocaleString()}`);
      lines.push(`Period: ${periodLabel(period)}`);
      lines.push(`================================================================\n`);

      if (reportModules.executiveSummary) {
        lines.push(`-- EXECUTIVE CASH FLOW SUMMARY --`);
        lines.push(`Total Inflow:      ${formatCurrency(stats.totalInflow, settings)}`);
        lines.push(`Total Outflow:     ${formatCurrency(stats.totalOutflow, settings)}`);
        lines.push(`Net Cash Flow:     ${formatCurrencyWithSign(stats.totalInflow - stats.totalOutflow, settings)}`);
        if (safeToSpend) {
          lines.push(`Safe to Spend:     ${formatCurrency(safeToSpend.safeToSpend, settings)} (Next ${safeToSpend.daysRemainingInMonth}d)`);
          lines.push(`Pending Commitments: ${formatCurrency(safeToSpend.upcomingCommitments, settings)}`);
        }
        lines.push(`\n`);
      }

      if (reportModules.subscriptions) {
        lines.push(`-- SUBSCRIPTIONS & FIXED SERVICES --`);
        const subTotal = activeSubscriptions.reduce((s, r) => s + Number(r.amount), 0);
        lines.push(`Active Subscriptions: ${activeSubscriptions.length} items`);
        lines.push(`Monthly Commitment:   ${formatCurrency(subTotal, settings)}`);
        activeSubscriptions.forEach((sub, i) => {
          lines.push(`  ${i + 1}. ${sub.merchant || "Subscription"} - ${formatCurrency(sub.amount, settings)}`);
        });
        if (priceHikes.length > 0) {
          lines.push(`\nPrice Increases Detected:`);
          priceHikes.forEach(h => {
            lines.push(`  * ${h.merchant}: ${formatCurrency(h.previousAmount, settings)} -> ${formatCurrency(h.currentAmount, settings)} (+${h.changePercent}%)`);
          });
        }
        lines.push(`\n`);
      }

      if (reportModules.investments) {
        lines.push(`-- WEALTH & INVESTMENTS (SIPs) --`);
        const invTotal = activeInvestments.reduce((s, r) => s + Number(r.amount), 0);
        const savingsRate = stats.totalInflow > 0 ? Math.round((invTotal / stats.totalInflow) * 100) : 0;
        lines.push(`Active SIPs:      ${activeInvestments.length} items`);
        lines.push(`Monthly Deployed: ${formatCurrency(invTotal, settings)}`);
        lines.push(`Savings Rate:     ${savingsRate}% of inflow`);
        activeInvestments.forEach((inv, i) => {
          lines.push(`  ${i + 1}. ${inv.merchant || "Investment"} - ${formatCurrency(inv.amount, settings)}`);
        });
        lines.push(`\n`);
      }

      if (reportModules.categoryBreakdown) {
        lines.push(`-- CATEGORY BREAKDOWN --`);
        categoryData.slice(0, 10).forEach((cat, i) => {
          lines.push(`  #${i + 1} ${cat.name}: Outflow ${formatCurrency(cat.outflow, settings)} (${cat.count} txns)`);
        });
        lines.push(`\n`);
      }

      if (reportModules.transactionsLedger) {
        lines.push(`-- ITEMISED TRANSACTIONS LEDGER --`);
        lines.push(`Date | Type | Amount | Category | Merchant | Tag`);
        transactions.forEach(t => {
          lines.push(`${t.date} | ${t.type} | ${t.amount} | ${t.category_name || "Uncategorized"} | ${t.merchant || ""} | ${t.tag}`);
        });
        lines.push(`\n`);
      }

      const content = lines.join("\n");
      const filename = `PennyWise-Report-${period}-${new Date().toISOString().slice(0, 10)}.txt`;
      const result = await exportFile({
        content,
        filename,
        mimeType: "text/plain",
        dialogTitle: `Export ${periodLabel(period)} Insights Report`,
      });

      if (result.success) {
        setExportMsg(result.method === "shared" ? "Report generated and shared!" : "Report generated and saved!");
        setTimeout(() => setExportMsg(null), 3000);
        setShowGenerateModal(false);
      }
    } catch (err) {
      console.error("Failed to generate report:", err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Insights</h1>
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
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            Insights
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{periodLabel(period)}</p>
        </div>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-xl text-xs font-semibold shadow-xs hover:bg-black active:scale-95 transition-all"
        >
          <FileText size={14} />
          Generate Report
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
          {tab === "subscriptions" && (
            <div className="space-y-4">
              {/* Subscriptions Overview card */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Active Subscriptions</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Recurring lifestyle & service charges</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                    {activeSubscriptions.length} active
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-gray-50">
                    <span className="text-[11px] text-gray-400 font-medium block">Monthly Burn</span>
                    <span className="text-base font-bold text-gray-900">
                      {formatCurrency(activeSubscriptions.reduce((s, r) => s + Number(r.amount), 0), settings)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50">
                    <span className="text-[11px] text-gray-400 font-medium block">Annualized Cost</span>
                    <span className="text-base font-bold text-gray-900">
                      {formatCurrency(activeSubscriptions.reduce((s, r) => s + Number(r.amount), 0) * 12, settings)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Increases Section */}
              {priceHikes.length > 0 ? (
                <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-amber-700 flex-shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                        Price Increases Detected ({priceHikes.length})
                      </h4>
                      <p className="text-[11px] text-amber-800">
                        Subscriptions with higher rates compared to initial logs
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {priceHikes.map(hike => (
                      <div
                        key={hike.recurringId}
                        onClick={() => setSelectedSubForHistory(hike)}
                        className="bg-white/90 hover:bg-white rounded-xl p-3 border border-amber-200/60 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-xs text-gray-900 block truncate">{hike.merchant}</span>
                          <span className="text-[11px] text-gray-500">
                            Was {formatCurrency(hike.previousAmount, settings)} → Now {formatCurrency(hike.currentAmount, settings)}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="inline-block text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                            +{hike.changePercent}%
                          </span>
                          <span className="text-[10px] text-gray-400 block mt-0.5">tap for history</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center py-6">
                  <p className="text-xs text-gray-500 font-medium">No price increases detected on active subscriptions.</p>
                  <p className="text-[11px] text-gray-400 mt-1">Rates are consistent with past ledger entries.</p>
                </div>
              )}

              {/* Subscriptions List */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">
                  All Active Subscriptions
                </h4>
                {activeSubscriptions.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No subscriptions configured yet in Recurring.</p>
                ) : (
                  <div className="space-y-2 divide-y divide-gray-100">
                    {activeSubscriptions.map(sub => (
                      <div key={sub.id} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                        <div className="min-w-0 flex-1 pr-2">
                          <span className="font-semibold text-gray-900 block truncate">{sub.merchant || "Subscription"}</span>
                          <span className="text-gray-400 text-[11px]">Due {formatDate(sub.next_date, settings)}</span>
                        </div>
                        <span className="font-bold text-gray-900 flex-shrink-0">{formatCurrency(sub.amount, settings)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "investments" && (
            <div className="space-y-4">
              {/* Investments Summary */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Capital Deployed</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Recurring SIPs & wealth allocations</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                    {activeInvestments.length} SIPs
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[11px] text-gray-500 font-medium block">Monthly Investment</span>
                    <span className="text-base font-bold text-gray-900">
                      {formatCurrency(activeInvestments.reduce((s, r) => s + Number(r.amount), 0), settings)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[11px] text-gray-500 font-medium block">Savings / Investment Rate</span>
                    <span className="text-base font-bold text-gray-900">
                      {stats.totalInflow > 0
                        ? `${Math.round((activeInvestments.reduce((s, r) => s + Number(r.amount), 0) / stats.totalInflow) * 100)}%`
                        : "0%"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active SIPs list */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-3">
                  Recurring Investment Commitments
                </h4>
                {activeInvestments.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No recurring investments set up yet.</p>
                ) : (
                  <div className="space-y-2 divide-y divide-gray-100">
                    {activeInvestments.map(inv => (
                      <div key={inv.id} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                        <div className="min-w-0 flex-1 pr-2">
                          <span className="font-semibold text-gray-900 block truncate">{inv.merchant || "Investment SIP"}</span>
                          <span className="text-gray-400 text-[11px]">Next debit {formatDate(inv.next_date, settings)}</span>
                        </div>
                        <span className="font-bold text-gray-900 flex-shrink-0">{formatCurrency(inv.amount, settings)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

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
              <CategorySpendBreakdown
                transactions={transactions}
                type="inflow"
                settings={settings}
                title="Income by Category"
                subtitle="Ranked inflow distribution & drill-down"
              />
            </>
          )}

          {tab === "expense" && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <StatCard label="Total Expense" value={formatCurrency(stats.totalOutflow, settings)} icon={<TrendingDown size={16} className="text-red-500" />} bg="bg-red-50" />
                <StatCard label="Avg per Tx" value={formatCurrency(stats.avgOutflow, settings)} icon={<ArrowDownRight size={16} className="text-gray-700" />} bg="bg-gray-100" />
              </div>
              <CategorySpendBreakdown
                transactions={transactions}
                type="outflow"
                settings={settings}
                title="Expense by Category"
                subtitle="Ranked outflow distribution & drill-down"
              />
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

      {/* Subscription Price History Modal */}
      {selectedSubForHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto slim-scrollbar animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">{selectedSubForHistory.merchant}</h3>
                <p className="text-xs text-gray-400">Subscription Price Trajectory</p>
              </div>
              <button
                onClick={() => setSelectedSubForHistory(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900"
              >
                <X size={16} />
              </button>
            </div>

            <div className="py-4">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50 border border-amber-200/80 mb-4">
                <div>
                  <span className="text-[11px] text-amber-800 font-semibold block">Detected Increase</span>
                  <span className="text-base font-bold text-amber-950">
                    +{formatCurrency(selectedSubForHistory.changeAmount, settings)} (+{selectedSubForHistory.changePercent}%)
                  </span>
                </div>
                <div className="text-right text-xs text-amber-800 font-medium">
                  {formatCurrency(selectedSubForHistory.previousAmount, settings)} → {formatCurrency(selectedSubForHistory.currentAmount, settings)}
                </div>
              </div>

              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
                Logged Rate History ({selectedSubForHistory.history.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto slim-scrollbar pr-1 divide-y divide-gray-100">
                {selectedSubForHistory.history.map((h, i) => (
                  <div key={i} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                    <span className="text-gray-500">{formatDate(h.date, settings)}</span>
                    <span className="font-bold text-gray-900">{formatCurrency(h.amount, settings)}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSelectedSubForHistory(null)}
              className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Generate Custom Insights Report Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto slim-scrollbar animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Generate Report</h3>
                  <p className="text-xs text-gray-400">Customized summary from Insights</p>
                </div>
              </div>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-700 uppercase tracking-wider block text-[10px] mb-1.5">
                  Report Timeframe
                </label>
                <div className="flex gap-1.5">
                  {["month", "last_month", "year"].map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`flex-1 py-2 rounded-xl font-semibold border transition-all ${
                        period === p
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {periodLabel(p)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 uppercase tracking-wider block text-[10px] mb-2">
                  Sections to Include
                </label>
                <div className="space-y-2 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reportModules.executiveSummary}
                      onChange={e => setReportModules({ ...reportModules, executiveSummary: e.target.checked })}
                      className="rounded border-gray-300 text-gray-900 focus:ring-0"
                    />
                    <span className="font-semibold text-gray-800">Executive Summary (Cash Flow & Safe-to-Spend)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reportModules.subscriptions}
                      onChange={e => setReportModules({ ...reportModules, subscriptions: e.target.checked })}
                      className="rounded border-gray-300 text-gray-900 focus:ring-0"
                    />
                    <span className="font-semibold text-gray-800">Subscriptions Audit & Price Hikes</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reportModules.investments}
                      onChange={e => setReportModules({ ...reportModules, investments: e.target.checked })}
                      className="rounded border-gray-300 text-gray-900 focus:ring-0"
                    />
                    <span className="font-semibold text-gray-800">Investments & Capital Deployed (SIPs)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reportModules.categoryBreakdown}
                      onChange={e => setReportModules({ ...reportModules, categoryBreakdown: e.target.checked })}
                      className="rounded border-gray-300 text-gray-900 focus:ring-0"
                    />
                    <span className="font-semibold text-gray-800">Category Spend Breakdown (Top 10)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reportModules.transactionsLedger}
                      onChange={e => setReportModules({ ...reportModules, transactionsLedger: e.target.checked })}
                      className="rounded border-gray-300 text-gray-900 focus:ring-0"
                    />
                    <span className="font-semibold text-gray-800">Itemized Transactions Ledger</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={exportCSV}
                  disabled={exporting}
                  className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl flex items-center justify-center gap-1.5 hover:bg-gray-50 active:scale-[0.99] transition-all"
                >
                  <Download size={14} />
                  Raw CSV
                </button>
                <button
                  type="button"
                  onClick={generateCustomReport}
                  disabled={exporting}
                  className="flex-1 py-3 bg-gray-900 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 hover:bg-black active:scale-[0.99] transition-all"
                >
                  {exporting ? <Loader size={14} className="animate-spin" /> : <FileText size={14} />}
                  Export Report
                </button>
              </div>
            </div>
          </div>
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
