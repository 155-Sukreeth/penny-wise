import { useState, useEffect, useCallback } from "react";
import { Plus, X, Trash2, AlertTriangle, Check, PiggyBank } from "lucide-react";
import type { AppSettings, Category, Budget } from "@/types";
import { BudgetType, BudgetPeriod } from "@/types";
import { fetchBudgets, createBudget, updateBudget, deleteBudget, fetchCategories, fetchTransactions } from "@/lib/data";
import { formatCurrency, getMonthBounds, formatInputAmount, parseInputAmount } from "@/lib/format";

interface BudgetWithSpent extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  categoryName?: string;
}

export function Budgets({ settings }: { settings: AppSettings }) {
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<BudgetType>(BudgetType.Overall);
  const [addAmount, setAddAmount] = useState("");
  const [addCategoryId, setAddCategoryId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [budgetsData, catsData, txData] = await Promise.all([
      fetchBudgets(),
      fetchCategories(),
      fetchTransactions({ startDate: getMonthBounds().start, endDate: getMonthBounds().end, limit: 5000 }),
    ]);
    setCategories(catsData);

    const enriched = budgetsData.map(b => {
      const spent = b.type === "overall"
        ? txData.filter(t => t.type === "outflow").reduce((s, t) => s + Number(t.amount), 0)
        : txData.filter(t => t.type === "outflow" && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
      const cat = catsData.find(c => c.id === b.category_id);
      return {
        ...b,
        spent,
        remaining: b.amount - spent,
        percentage: b.amount > 0 ? (spent / b.amount) * 100 : 0,
        categoryName: cat?.name,
      };
    });
    setBudgets(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const amt = parseInputAmount(addAmount);
    if (!amt || amt <= 0) return;
    if (addType === BudgetType.Category && !addCategoryId) return;
    await createBudget({
      type: addType,
      category_id: addType === BudgetType.Category ? addCategoryId : null,
      amount: amt,
      period: BudgetPeriod.Monthly,
    });
    setShowAdd(false);
    setAddAmount("");
    setAddCategoryId(null);
    load();
  };

  const handleUpdate = async (id: string) => {
    const amt = parseInputAmount(editAmount);
    if (!amt || amt <= 0) return;
    await updateBudget(id, { amount: amt });
    setEditingId(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteBudget(id);
    load();
  };

  const outflowCategories = categories.filter(c => c.type === "outflow");

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Budgets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monthly spending limits</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center active:scale-90 transition-transform"
        >
          <Plus size={20} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
        </div>
      ) : budgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
            <PiggyBank size={24} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 mb-1">No budgets yet</p>
          <p className="text-xs text-gray-400 mb-4">Create a budget to track your spending</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl"
          >
            Create Budget
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => {
            const isOver = b.percentage >= 100;
            const isWarning = b.percentage >= 80 && !isOver;
            const barColor = isOver ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500";

            return (
              <div key={b.id} className="bg-white rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {b.type === "overall" ? (
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                        <PiggyBank size={16} className="text-gray-600" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-600">{b.categoryName?.[0]?.toUpperCase()}</span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {b.type === "overall" ? "Overall Budget" : b.categoryName}
                      </h3>
                      <p className="text-xs text-gray-400">Monthly</p>
                    </div>
                  </div>
                  {(isOver || isWarning) && (
                    <div className={`flex items-center gap-1 text-xs font-medium ${isOver ? "text-red-500" : "text-amber-500"}`}>
                      <AlertTriangle size={13} />
                      {isOver ? "Exceeded" : "Warning"}
                    </div>
                  )}
                </div>

                <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                    style={{ width: `${Math.min(b.percentage, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-gray-400">Spent </span>
                    <span className="font-medium text-gray-900">{formatCurrency(b.spent, settings)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">of </span>
                    <span className="font-medium text-gray-900">{formatCurrency(b.amount, settings)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                  <span className={`text-xs font-medium ${b.remaining < 0 ? "text-red-500" : "text-emerald-600"}`}>
                    {b.remaining < 0 ? "Over by " : "Remaining "}{formatCurrency(Math.abs(b.remaining), settings)}
                  </span>
                  <span className="text-xs text-gray-400">{b.percentage.toFixed(0)}% used</span>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  {editingId === b.id ? (
                    <>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editAmount}
                        onChange={e => setEditAmount(formatInputAmount(e.target.value, settings.currency))}
                        placeholder="New amount"
                        className="flex-1 px-3 py-1.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100"
                        autoFocus
                      />
                      <button onClick={() => handleUpdate(b.id)} className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg">
                        <Check size={14} />
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(b.id); setEditAmount(b.amount ? formatInputAmount(String(b.amount), settings.currency) : ""); }}
                        className="text-xs text-gray-500 font-medium px-2 py-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add budget modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5 pb-8 animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Create Budget</h2>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Budget Scope</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAddType(BudgetType.Overall); setAddCategoryId(null); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${addType === BudgetType.Overall ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}
                  >
                    Overall
                  </button>
                  <button
                    onClick={() => setAddType(BudgetType.Category)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${addType === BudgetType.Category ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600"}`}
                  >
                    Category
                  </button>
                </div>
              </div>

              {addType === BudgetType.Category && (
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-2">Category</label>
                  <select
                    value={addCategoryId || ""}
                    onChange={e => setAddCategoryId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-100"
                  >
                    <option value="">Select category</option>
                    {outflowCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 font-medium block mb-2">Monthly Amount</label>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-lg font-bold text-gray-400">{settings.currencySymbol}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={addAmount}
                    onChange={e => setAddAmount(formatInputAmount(e.target.value, settings.currency))}
                    placeholder="0"
                    autoFocus
                    className="text-lg font-bold text-gray-900 bg-transparent outline-none flex-1"
                  />
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={parseInputAmount(addAmount) <= 0 || (addType === "category" && !addCategoryId)}
                className={`w-full py-3.5 rounded-xl font-semibold text-sm ${parseInputAmount(addAmount) > 0 && (addType !== "category" || addCategoryId) ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-400"}`}
              >
                Create Budget
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
