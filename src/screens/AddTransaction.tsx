import { useState, useEffect, useMemo, useCallback } from "react";
import { X, ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Tag as TagIcon, Zap } from "lucide-react";
import type { AppSettings, TransactionType, TagType, Category } from "@/types";
import { TAGS, TAG_BG_COLORS } from "@/types";
import {
  fetchCategories, fetchAccounts, createTransaction, updateTransaction,
  fetchTransactions, findPayeeRule, createPayeeRule, type TransactionWithNames
} from "@/lib/data";
import { getTodayString, formatDate } from "@/lib/format";
import { Sparkles } from "lucide-react";
import type { ScreenName } from "@/App";

interface AddTransactionProps {
  settings: AppSettings;
  editId: string | null;
  onDone: () => void;
  onCancel: () => void;
}

export function AddTransaction({ settings, editId, onDone, onCancel }: AddTransactionProps) {
  const [type, setType] = useState<TransactionType>("outflow");
  const [amount, setAmount] = useState("");
  const [quickText, setQuickText] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(getTodayString());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState<TagType>("Want");
  const [autoCategorize, setAutoCategorize] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [existingTx, setExistingTx] = useState<TransactionWithNames | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quickMode, setQuickMode] = useState(true);

  useEffect(() => {
    fetchCategories().then(cats => {
      setCategories(cats);
      const firstOutflow = cats.find(c => c.type === "outflow");
      if (firstOutflow) {
        setCategoryId(firstOutflow.id);
        setTag(firstOutflow.tag);
      }
    });
    fetchAccounts().then(accs => setAccounts(accs.map(a => ({ id: a.id, name: a.name }))));
  }, []);

  useEffect(() => {
    if (editId) {
      fetchTransactions({}).then(all => {
        const tx = all.find(t => t.id === editId);
        if (tx) {
          setExistingTx(tx);
          setType(tx.type);
          setAmount(String(tx.amount));
          setCategoryId(tx.category_id);
          setDate(tx.date);
          setAccountId(tx.account_id);
          setMerchant(tx.merchant || "");
          setNotes(tx.notes || "");
          setTag(tx.tag);
          setQuickMode(false);
        }
      });
    }
  }, [editId]);

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

  // Parse quick text like "450 dinner"
  const parseQuickText = useCallback((text: string) => {
    const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (match) {
      setAmount(match[1]);
      const desc = match[2].trim();
      if (desc) {
        const lowerDesc = desc.toLowerCase();
        const matched = categories.find(c =>
          c.type === type && c.name.toLowerCase().includes(lowerDesc)
        );
        if (matched) {
          setCategoryId(matched.id);
          setTag(matched.tag);
        } else {
          setMerchant(desc);
        }
      }
    }
  }, [categories, type]);

  const handleQuickSubmit = () => {
    if (quickText.trim()) parseQuickText(quickText);
    setQuickMode(false);
  };

  // Auto-categorize from merchant using payee rules
  const handleMerchantBlur = async () => {
    if (!autoCategorize || !merchant.trim()) return;
    const rule = await findPayeeRule(merchant.trim());
    if (rule) {
      setType(rule.type);
      setCategoryId(rule.category_id);
    }
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !categoryId || !date) return;
    setSaving(true);
    try {
      if (editId && existingTx) {
        await updateTransaction(editId, {
          type, amount: amt, category_id: categoryId, date,
          account_id: accountId, merchant: merchant || null,
          notes: notes || null, tag,
        });
      } else {
        await createTransaction({
          type, amount: amt, category_id: categoryId, date,
          account_id: accountId, merchant: merchant || null,
          notes: notes || null, tag, tags: [],
        });

        // Save payee rule if auto-categorize is on and merchant is present
        if (autoCategorize && merchant.trim()) {
          const existing = await findPayeeRule(merchant.trim());
          if (!existing) {
            await createPayeeRule({
              payee_name: merchant.trim(),
              category_id: categoryId,
              type,
              is_active: true,
            });
          }
        }
      }
      onDone();
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  const canSave = parseFloat(amount) > 0 && categoryId && date;

  if (quickMode && !editId) {
    return (
      <QuickAddScreen
        quickText={quickText}
        setQuickText={setQuickText}
        onSubmit={handleQuickSubmit}
        onCancel={onCancel}
        onSkipToFull={() => setQuickMode(false)}
      />
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onCancel} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
          <X size={18} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{editId ? "Edit" : "Add"} Transaction</h1>
        <div className="w-9" />
      </div>

      {/* Type toggle */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => handleTypeChange("outflow")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all ${
            type === "outflow"
              ? "bg-red-500 text-white shadow-sm"
              : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          <ArrowDownLeft size={18} />
          Outflow
        </button>
        <button
          onClick={() => handleTypeChange("inflow")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all ${
            type === "inflow"
              ? "bg-emerald-500 text-white shadow-sm"
              : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          <ArrowUpRight size={18} />
          Inflow
        </button>
      </div>

      <div className="space-y-4 flex-1">
        {/* Amount */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <label className="text-xs text-gray-500 font-medium block mb-2">Amount</label>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-400">{settings.currencySymbol}</span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              autoFocus={!editId}
              className="text-2xl font-bold text-gray-900 bg-transparent outline-none flex-1 min-w-0"
            />
          </div>
        </div>

        {/* Category */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <label className="text-xs text-gray-500 font-medium block mb-2">Category</label>
          <div className="flex flex-wrap gap-2">
            {filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  categoryId === cat.id
                    ? "bg-gray-900 text-white"
                    : "bg-gray-50 text-gray-700 active:scale-95"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <label className="text-xs text-gray-500 font-medium block mb-2">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full text-sm text-gray-900 bg-transparent outline-none"
          />
        </div>

        {/* Merchant with auto-categorize toggle */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <label className="text-xs text-gray-500 font-medium block mb-2">Merchant / Source (optional)</label>
          <input
            type="text"
            value={merchant}
            onChange={e => setMerchant(e.target.value)}
            onBlur={handleMerchantBlur}
            placeholder="e.g. Swiggy, Amazon"
            className="w-full text-sm text-gray-900 bg-transparent outline-none"
          />
          {merchant.trim() && (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TagIcon size={13} className="text-gray-400" />
                <span className="text-xs text-gray-500">Auto-categorize future {merchant.trim()} transactions</span>
              </div>
              <Toggle checked={autoCategorize} onChange={setAutoCategorize} />
            </div>
          )}
        </div>

        {/* Tag selector */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <label className="text-xs text-gray-500 font-medium block mb-2">Tag</label>
          <div className="flex gap-2">
            {TAGS.map(t => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  tag === t ? TAG_BG_COLORS[t] : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full text-sm text-gray-600 py-2"
        >
          <span className="font-medium">More details</span>
          <ChevronDown size={16} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>

        {showAdvanced && (
          <div className="space-y-4">
            {/* Account */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <label className="text-xs text-gray-500 font-medium block mb-2">Payment Method / Account (optional)</label>
              <div className="flex flex-wrap gap-2">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => setAccountId(accountId === acc.id ? null : acc.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      accountId === acc.id
                        ? "bg-gray-900 text-white"
                        : "bg-gray-50 text-gray-700"
                    }`}
                  >
                    {acc.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <label className="text-xs text-gray-500 font-medium block mb-2">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="w-full text-sm text-gray-900 bg-transparent outline-none resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="pt-4">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
            canSave && !saving
              ? "bg-gray-900 text-white active:scale-[0.98]"
              : "bg-gray-200 text-gray-400"
          }`}
        >
          {saving ? "Saving..." : editId ? "Update Transaction" : "Save Transaction"}
        </button>
      </div>
    </div>
  );
}

function QuickAddScreen({ quickText, setQuickText, onSubmit, onCancel, onSkipToFull }: {
  quickText: string;
  setQuickText: (s: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onSkipToFull: () => void;
}) {
  return (
    <div className="px-4 pt-6 pb-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onCancel} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
          <X size={18} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Quick Add</h1>
        <button onClick={onSkipToFull} className="text-xs text-gray-500 font-medium px-2">Full form</button>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Zap size={24} className="text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">Type an amount and description</p>
          <p className="text-xs text-gray-400 mt-1">e.g. "450 dinner" or "12000 salary"</p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
          <input
            type="text"
            value={quickText}
            onChange={e => setQuickText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && quickText.trim() && onSubmit()}
            placeholder="450 dinner"
            autoFocus
            className="w-full text-lg text-gray-900 bg-transparent outline-none"
          />
        </div>

        <button
          onClick={onSubmit}
          disabled={!quickText.trim()}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
            quickText.trim()
              ? "bg-gray-900 text-white active:scale-[0.98]"
              : "bg-gray-200 text-gray-400"
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors relative ${checked ? "bg-gray-900" : "bg-gray-300"}`}
    >
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}
