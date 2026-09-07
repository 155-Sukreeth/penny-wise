import { useState, useEffect, useMemo } from "react";
import { X, ArrowDownLeft, ArrowUpRight, Check, Tag as TagIcon } from "lucide-react";
import type { AppSettings, TransactionType, TagType, Category } from "@/types";
import { TAGS, TAG_BG_COLORS } from "@/types";
import {
  fetchCategories, fetchAccounts, createTransaction, updateTransaction,
  fetchTransactions, findPayeeRule, createPayeeRule, fetchPayeeRules, type TransactionWithNames
} from "@/lib/data";
import { getTodayString, formatInputAmount, parseInputAmount } from "@/lib/format";

interface AddTransactionProps {
  settings: AppSettings;
  editId: string | null;
  onDone: () => void;
  onCancel: () => void;
}

export function AddTransaction({ settings, editId, onDone, onCancel }: AddTransactionProps) {
  const [type, setType] = useState<TransactionType>("outflow");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(getTodayString());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState<TagType>("Want");
  const [autoCategorize, setAutoCategorize] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [knownMerchants, setKnownMerchants] = useState<string[]>([]);
  const [existingTx, setExistingTx] = useState<TransactionWithNames | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategories().then(cats => {
      setCategories(cats);
      if (!editId) {
        const firstOutflow = cats.find(c => c.type === "outflow");
        if (firstOutflow) {
          setCategoryId(firstOutflow.id);
          setTag(firstOutflow.tag);
        }
      }
    });

    fetchAccounts().then(accs => {
      setAccounts(accs.map(a => ({ id: a.id, name: a.name })));
      if (!editId && accs.length > 0) {
        const def = accs.find(a => a.is_default);
        setAccountId(def ? def.id : accs[0].id);
      }
    });

    Promise.all([fetchTransactions({ limit: 1000 }), fetchPayeeRules()]).then(([txs, rules]) => {
      const set = new Set<string>();
      txs.forEach(t => { if (t.merchant?.trim()) set.add(t.merchant.trim()); });
      rules.forEach(r => { if (r.payee_name?.trim()) set.add(r.payee_name.trim()); });
      setKnownMerchants(Array.from(set).sort((a, b) => a.localeCompare(b)));
    });
  }, []);

  useEffect(() => {
    if (editId) {
      fetchTransactions({}).then(all => {
        const tx = all.find(t => t.id === editId);
        if (tx) {
          setExistingTx(tx);
          setType(tx.type);
          setAmount(tx.amount ? formatInputAmount(String(tx.amount), settings.currency) : "");
          setCategoryId(tx.category_id);
          setDate(tx.date);
          setAccountId(tx.account_id);
          setMerchant(tx.merchant || "");
          setNotes(tx.notes || "");
          setTag(tx.tag);
        }
      });
    }
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

  const handleMerchantSelect = async (val: string) => {
    setMerchant(val);
    if (!val.trim()) return;
    const rule = await findPayeeRule(val.trim());
    if (rule) {
      setType(rule.type);
      if (rule.category_id) {
        setCategoryId(rule.category_id);
        const cat = categories.find(c => c.id === rule.category_id);
        if (cat) setTag(cat.tag);
      }
    }
  };

  const handleSave = async () => {
    const amt = parseInputAmount(amount);
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

  const canSave = parseInputAmount(amount) > 0 && categoryId && date;

  return (
    <div className="px-4 pt-6 pb-20 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onCancel} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
          <X size={18} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{editId ? "Edit" : "Add"} Transaction</h1>
        <div className="w-9" />
      </div>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => handleTypeChange("outflow")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
            type === "outflow"
              ? "bg-red-500 text-white shadow-sm"
              : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          <ArrowDownLeft size={18} />
          Expense
        </button>
        <button
          onClick={() => handleTypeChange("inflow")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
            type === "inflow"
              ? "bg-emerald-500 text-white shadow-sm"
              : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          <ArrowUpRight size={18} />
          Income
        </button>
      </div>

      <div className="space-y-4 flex-1">
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
              className="text-2xl font-bold text-gray-900 bg-transparent outline-none flex-1 min-w-0"
            />
          </div>
        </div>

        {/* Notes (Primary description / title) */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <label className="text-xs text-gray-500 font-medium block mb-2">Notes / Description (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Grocery run, Team dinner, Bonus"
            className="w-full text-sm text-gray-900 bg-gray-50 rounded-xl px-3.5 py-2.5 outline-none border border-gray-100 focus:border-gray-300"
          />
        </div>

        {/* Merchant with suggestions dropdown */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <label className="text-xs text-gray-500 font-medium block mb-2">Merchant / Payee / Source (optional)</label>
          <input
            type="text"
            list="merchant-list"
            value={merchant}
            onChange={e => handleMerchantSelect(e.target.value)}
            placeholder="e.g. Starbucks, Amazon, Salary"
            className="w-full text-sm text-gray-900 bg-gray-50 rounded-xl px-3.5 py-2.5 outline-none border border-gray-100 focus:border-gray-300"
          />
          <datalist id="merchant-list">
            {knownMerchants.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          {merchant.trim() && (
            <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-50">
              <div className="flex items-center gap-2">
                <TagIcon size={13} className="text-gray-400" />
                <span className="text-xs text-gray-500">Auto-categorize future {merchant.trim()} transactions</span>
              </div>
              <Toggle checked={autoCategorize} onChange={setAutoCategorize} />
            </div>
          )}
        </div>

        {/* Category */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <label className="text-xs text-gray-500 font-medium block mb-2">Category</label>
          <div className="flex flex-wrap gap-2">
            {filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                  categoryId === cat.id
                    ? "bg-gray-900 text-white shadow-sm"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100 active:scale-95"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Date & Account in grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <label className="text-xs text-gray-500 font-medium block mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full text-sm text-gray-900 bg-transparent outline-none font-medium"
            />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <label className="text-xs text-gray-500 font-medium block mb-2">Payment Method</label>
            <select
              value={accountId || ""}
              onChange={e => setAccountId(e.target.value || null)}
              className="w-full text-sm text-gray-900 bg-transparent outline-none font-medium"
            >
              <option value="">Unspecified</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {/* Tag selector */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <label className="text-xs text-gray-500 font-medium block mb-2">Budget Tag</label>
          <div className="flex gap-2">
            {TAGS.map(t => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  tag === t ? TAG_BG_COLORS[t] + " shadow-sm font-bold" : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="pt-5 mt-auto">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${
            canSave && !saving
              ? "bg-gray-900 text-white active:scale-95"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          <Check size={18} />
          {saving ? "Saving..." : editId ? "Update Transaction" : "Save Transaction"}
        </button>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
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
