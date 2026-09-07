import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, SlidersHorizontal, X, ArrowUpRight, ArrowDownRight, Trash2, CheckSquare, Square, ChevronDown, Plus } from "lucide-react";
import type { AppSettings, TransactionType, TagType, Category } from "@/types";
import { TAGS, TAG_BG_COLORS } from "@/types";
import { fetchTransactions, fetchCategories, fetchAccounts, deleteTransaction, bulkDeleteTransactions, type TransactionWithNames } from "@/lib/data";
import { formatCurrency, relativeDate, getTodayString } from "@/lib/format";
import type { ScreenName } from "@/App";

interface TransactionsProps {
  settings: AppSettings;
  onEditTransaction: (id: string) => void;
  onNavigate: (s: ScreenName) => void;
}

type SortField = "date" | "amount" | "merchant";

export function Transactions({ settings, onEditTransaction, onNavigate }: TransactionsProps) {
  const [transactions, setTransactions] = useState<TransactionWithNames[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<TransactionType | "">("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterTag, setFilterTag] = useState<TagType | "">("");
  const [sortBy, setSortBy] = useState<SortField>("date");
  const [sortDesc, setSortDesc] = useState(true);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSortMenu, setShowSortMenu] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchTransactions({
      search: search || undefined,
      type: filterType || undefined,
      categoryId: filterCategory || undefined,
      accountId: filterAccount || undefined,
      tag: filterTag || undefined,
      orderBy: sortBy,
      ascending: !sortDesc,
      limit: 2000,
    });
    setTransactions(data);
    setLoading(false);
  }, [search, filterType, filterCategory, filterAccount, filterTag, sortBy, sortDesc]);

  useEffect(() => {
    fetchCategories().then(setCategories);
    fetchAccounts().then(a => setAccounts(a.map(x => ({ id: x.id, name: x.name }))));
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, TransactionWithNames[]>();
    [...transactions].sort((a, b) => {
      if (sortBy === "date") return sortDesc ? b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at) : a.date.localeCompare(b.date);
      if (sortBy === "amount") return sortDesc ? Number(b.amount) - Number(a.amount) : Number(a.amount) - Number(b.amount);
      if (sortBy === "merchant") return (b.merchant || "").localeCompare(a.merchant || "");
      return 0;
    }).forEach(t => {
      const key = t.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).sort((a, b) =>
      sortDesc ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])
    );
  }, [transactions, sortBy, sortDesc]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    await bulkDeleteTransactions(Array.from(selected));
    setSelected(new Set());
    setBulkMode(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
    load();
  };

  const totalInflow = transactions.filter(t => t.type === "inflow").reduce((s, t) => s + Number(t.amount), 0);
  const totalOutflow = transactions.filter(t => t.type === "outflow").reduce((s, t) => s + Number(t.amount), 0);
  const activeFilters = [filterType, filterCategory, filterAccount, filterTag].filter(Boolean).length;

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{transactions.length} entries</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setBulkMode(!bulkMode); setSelected(new Set()); }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${bulkMode ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {bulkMode ? <CheckSquare size={18} /> : <Square size={18} />}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-xs text-gray-500">Total Inflow</p>
          <p className="text-base font-bold text-emerald-600 mt-0.5">{formatCurrency(totalInflow, settings)}</p>
        </div>
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <p className="text-xs text-gray-500">Total Outflow</p>
          <p className="text-base font-bold text-red-500 mt-0.5">{formatCurrency(totalOutflow, settings)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search transactions..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-gray-400"
        />
      </div>

      {/* Filter & sort bar */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeFilters > 0 ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
        >
          <SlidersHorizontal size={13} />
          Filter{activeFilters > 0 ? ` (${activeFilters})` : ""}
        </button>
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-600 border border-gray-200"
          >
            Sort: {sortBy === "date" ? "Date" : sortBy === "amount" ? "Amount" : "Merchant"}
            <ChevronDown size={13} />
          </button>
          {showSortMenu && (
            <div className="absolute top-9 left-0 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20 min-w-[140px]">
              {(["date", "amount", "merchant"] as SortField[]).map(s => (
                <button
                  key={s}
                  onClick={() => { setSortBy(s); setShowSortMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-xs ${sortBy === s ? "bg-gray-50 font-medium text-gray-900" : "text-gray-600"}`}
                >
                  {s === "date" ? "Date" : s === "amount" ? "Amount" : "Merchant"}
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => { setSortDesc(!sortDesc); setShowSortMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-600"
                >
                  {sortDesc ? "Descending" : "Ascending"}
                </button>
              </div>
            </div>
          )}
        </div>
        {(search || activeFilters > 0) && (
          <button
            onClick={() => {
              setSearch(""); setFilterType(""); setFilterCategory("");
              setFilterAccount(""); setFilterTag("");
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1.5">Type</label>
            <div className="flex gap-2">
              {["", "inflow", "outflow"].map(t => (
                <button
                  key={t || "all"}
                  onClick={() => setFilterType(t as TransactionType | "")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filterType === t ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}
                >
                  {t === "" ? "All" : t === "inflow" ? "Inflow" : "Outflow"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1.5">Category</label>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100"
            >
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1.5">Payment Method</label>
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100"
            >
              <option value="">All methods</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1.5">Tag</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterTag("")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filterTag === "" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}
              >All</button>
              {TAGS.map(t => (
                <button
                  key={t}
                  onClick={() => setFilterTag(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filterTag === t ? TAG_BG_COLORS[t] : "bg-white text-gray-500 border-gray-200"}`}
                >{t}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      {bulkMode && selected.size > 0 && (
        <div className="bg-gray-900 text-white rounded-xl p-3 mb-3 flex items-center justify-between">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button onClick={handleBulkDelete} className="flex items-center gap-1.5 text-sm text-red-400 font-medium">
            <Trash2 size={15} /> Delete
          </button>
        </div>
      )}

      {/* Transaction list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-gray-400 mb-3">No transactions found</p>
          <button
            onClick={() => onNavigate("add-transaction")}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl"
          >
            <Plus size={16} /> Add Transaction
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, txs]) => (
            <div key={date}>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-medium text-gray-400">{relativeDate(date)}</span>
                <span className="text-xs text-gray-300">{formatCurrency(txs.reduce((s, t) => s + (t.type === "outflow" ? Number(t.amount) : -Number(t.amount)), 0), settings)}</span>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {txs.map((t, i) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 p-3 ${i > 0 ? "border-t border-gray-50" : ""} ${bulkMode && selected.has(t.id) ? "bg-blue-50" : ""}`}
                  >
                    {bulkMode && (
                      <button onClick={() => toggleSelect(t.id)} className="flex-shrink-0">
                        {selected.has(t.id) ? <CheckSquare size={18} className="text-gray-900" /> : <Square size={18} className="text-gray-300" />}
                      </button>
                    )}
                    <button
                      onClick={() => bulkMode ? toggleSelect(t.id) : onEditTransaction(t.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${t.type === "inflow" ? "bg-emerald-50" : "bg-red-50"}`}>
                        {t.type === "inflow" ? <ArrowUpRight size={16} className="text-emerald-600" /> : <ArrowDownRight size={16} className="text-red-500" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-900 truncate">{t.merchant || t.category_name || "Transaction"}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${TAG_BG_COLORS[t.tag]}`}>
                            {t.tag}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 block truncate">
                          {t.category_name}{t.account_name ? ` · ${t.account_name}` : ""}
                        </span>
                      </div>
                      <span className={`text-sm font-semibold flex-shrink-0 ${t.type === "inflow" ? "text-emerald-600" : "text-gray-900"}`}>
                        {t.type === "inflow" ? "+" : "-"}{formatCurrency(t.amount, settings)}
                      </span>
                    </button>
                    {!bulkMode && (
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
