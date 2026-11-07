import React, { useState, useMemo } from "react";
import { ChevronRight, Calendar } from "lucide-react";
import type { AppSettings } from "@/types";
import { formatCurrency } from "@/lib/format";
import type { TransactionWithNames } from "@/lib/data";

interface CategoryGroup {
  name: string;
  total: number;
  count: number;
  transactions: TransactionWithNames[];
}

interface CategorySpendBreakdownProps {
  transactions: TransactionWithNames[];
  type?: "outflow" | "inflow";
  settings: AppSettings;
  onEditTransaction?: (id: string) => void;
  title?: string;
  subtitle?: string;
  initialLimit?: number;
}

const TAG_PILL_STYLES: Record<string, string> = {
  Need: "bg-[#eaf8ef] text-[#1e824c] border-[#d2edd9]",
  Want: "bg-[#fff4e6] text-[#c2410c] border-[#fed7aa]",
  Invest: "bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]",
  Transfer: "bg-[#faf5ff] text-[#7e22ce] border-[#e9d5ff]",
};

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${day} ${month}`;
}

export function CategorySpendBreakdown({
  transactions,
  type = "outflow",
  settings,
  onEditTransaction,
  title,
  subtitle,
  initialLimit = 5,
}: CategorySpendBreakdownProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sortTxBy, setSortTxBy] = useState<"amount" | "date">("amount");

  const { groups, totalAmount } = useMemo(() => {
    const filtered = transactions.filter((t) => t.type === type);
    const map = new Map<string, { total: number; txs: TransactionWithNames[] }>();

    filtered.forEach((t) => {
      const name = t.category_name || "Uncategorized";
      const entry = map.get(name) || { total: 0, txs: [] };
      entry.total += Number(t.amount);
      entry.txs.push(t);
      map.set(name, entry);
    });

    let total = 0;
    const result: CategoryGroup[] = Array.from(map.entries())
      .map(([name, data]) => {
        total += data.total;
        return {
          name,
          total: data.total,
          count: data.txs.length,
          transactions: data.txs,
        };
      })
      .sort((a, b) => b.total - a.total);

    return { groups: result, totalAmount: total };
  }, [transactions, type]);

  if (groups.length === 0) {
    return null;
  }

  const displayedGroups = showAll ? groups : groups.slice(0, initialLimit);
  const hasMore = groups.length > initialLimit;

  const toggleAccordion = (name: string) => {
    setExpandedCategory((prev) => (prev === name ? null : name));
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      {/* Header: SPENDING BY CATEGORY + Total Amount */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-100/80">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-gray-900 uppercase">
            {title || (type === "outflow" ? "SPENDING BY CATEGORY" : "INCOME BY CATEGORY")}
          </h2>
          {subtitle && (
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <span className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
          {formatCurrency(totalAmount, settings)}
        </span>
      </div>

      {/* Category Rows */}
      <div className="divide-y divide-gray-100/90">
        {displayedGroups.map((group, index) => {
          const rank = String(index + 1).padStart(2, "0");
          const sharePct = totalAmount > 0 ? Math.round((group.total / totalAmount) * 100) : 0;
          const isExpanded = expandedCategory === group.name;

          const sortedTransactions = [...group.transactions].sort((a, b) => {
            if (sortTxBy === "amount") return Number(b.amount) - Number(a.amount);
            return b.date.localeCompare(a.date);
          });

          return (
            <div key={group.name} className="py-3.5 first:pt-3 last:pb-1">
              {/* Category Clickable Row */}
              <button
                type="button"
                onClick={() => toggleAccordion(group.name)}
                className="w-full text-left focus:outline-none transition-opacity hover:opacity-95"
              >
                {/* #01 | Category Name | Amount | Chevron */}
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="text-xs font-mono font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">
                      #{rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-bold text-gray-900 truncate block">
                        {group.name}
                      </span>
                      <span className="text-xs text-gray-400 font-medium block mt-0.5">
                        {group.count} {group.count === 1 ? "txn" : "txns"} · {sharePct}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                    <span className="text-sm font-bold text-gray-900">
                      {formatCurrency(group.total, settings)}
                    </span>
                    <ChevronRight
                      size={16}
                      className={`text-gray-400 transition-transform duration-200 ${
                        isExpanded ? "rotate-90 text-gray-700" : ""
                      }`}
                    />
                  </div>
                </div>

                {/* Progress Bar + Percentage */}
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gray-900 transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(100, Math.max(2, sharePct))}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-400 w-8 text-right flex-shrink-0">
                    {sharePct}%
                  </span>
                </div>
              </button>

              {/* Expanded Transactions Drill-down */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-100 animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Gray Banner Header */}
                  <div className="flex items-center justify-between px-3.5 py-2 mb-2 bg-[#f1f5f9] border border-slate-200/60 rounded-xl">
                    <span className="text-xs font-semibold text-slate-800 truncate">
                      In {group.name}{" "}
                      <span className="font-normal text-slate-500">
                        ({sortTxBy === "amount" ? "Ranked highest" : "Most recent"})
                      </span>
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-shrink-0">
                      <span className="font-medium text-slate-500">Sort:</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSortTxBy("amount");
                        }}
                        className={`transition px-1.5 py-0.5 rounded ${
                          sortTxBy === "amount"
                            ? "text-slate-900 bg-white shadow-xs font-bold"
                            : "text-slate-400 hover:text-slate-600"
                        }`}
                        title="Sort by amount"
                      >
                        {settings.currencySymbol || "₹"}
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSortTxBy("date");
                        }}
                        className={`transition px-1.5 py-0.5 rounded ${
                          sortTxBy === "date"
                            ? "text-slate-900 bg-white shadow-xs font-bold"
                            : "text-slate-400 hover:text-slate-600"
                        }`}
                        title="Sort by date"
                      >
                        <Calendar size={13} className="inline -mt-0.5" />
                      </button>
                    </div>
                  </div>

                  {/* Transaction rows with single continuous grey timeline */}
                  <div className="max-h-64 overflow-y-auto slim-scrollbar">
                    {sortedTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        onClick={() => onEditTransaction?.(tx.id)}
                        className={`flex items-center gap-0 transition-colors ${
                          onEditTransaction
                            ? "hover:bg-slate-50/80 cursor-pointer active:scale-[0.99]"
                            : ""
                        }`}
                      >
                        {/* Timeline column: single unbroken grey line + grey dot */}
                        <div className="relative flex items-center justify-center w-5 self-stretch flex-shrink-0">
                          {/* Single continuous vertical line — top to bottom, no break */}
                          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[1.5px] bg-slate-300" />
                          {/* Grey dot */}
                          <div className="relative z-10 w-[7px] h-[7px] rounded-full bg-slate-400" />
                        </div>

                        {/* Transaction content */}
                        <div className="flex-1 min-w-0 flex items-center gap-2.5 py-2.5 ml-2">
                          <span className="text-sm font-semibold text-slate-900 truncate flex-1 min-w-0">
                            {tx.merchant || tx.notes || "Transaction"}
                          </span>
                          <span className="text-xs text-slate-400 flex-shrink-0 font-medium">
                            {formatShortDate(tx.date)}
                          </span>
                          <span className="text-sm font-bold text-slate-900 flex-shrink-0 text-right min-w-[70px]">
                            {formatCurrency(tx.amount, settings)}
                          </span>
                          {tx.tag && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0 border ${
                                TAG_PILL_STYLES[tx.tag] || "bg-slate-50 text-slate-600 border-slate-200"
                              }`}
                            >
                              {tx.tag}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show More / Less Toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 flex items-center justify-center gap-1.5 transition-colors"
        >
          {showAll ? (
            <>Show Top {initialLimit} Only</>
          ) : (
            <>Show All {groups.length} Categories ({groups.length - initialLimit} more)</>
          )}
        </button>
      )}
    </div>
  );
}
