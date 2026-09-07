import { useState } from "react";
import { X, Sparkles, Check, AlertCircle, Loader, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { AppSettings, TransactionType, TagType, Category } from "@/types";
import { TAGS, TAG_BG_COLORS } from "@/types";
import { fetchCategories, fetchAccounts, createTransaction, createPayeeRule, findPayeeRule } from "@/lib/data";
import { getTodayString, formatDate } from "@/lib/format";
import { AI_PROXY_URL } from "@/lib/supabase";

interface AddWithAIProps {
  settings: AppSettings;
  onDone: () => void;
  onCancel: () => void;
}

interface AIParsedTransaction {
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  merchant: string;
  notes: string;
  tag: TagType;
  confidence: number;
  missingFields: string[];
}

export function AddWithAI({ settings, onDone, onCancel }: AddWithAIProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<AIParsedTransaction | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [tag, setTag] = useState<TagType>("Want");
  const [saving, setSaving] = useState(false);

  const initCategories = async () => {
    const cats = await fetchCategories();
    setCategories(cats);
    const accs = await fetchAccounts();
    setAccounts(accs.map(a => ({ id: a.id, name: a.name })));
  };

  const handleParse = async () => {
    if (!input.trim()) return;
    if (!settings.aiSettings?.apiKey) {
      setError("AI is not configured. Please add an API key in Settings.");
      return;
    }

    setLoading(true);
    setError(null);
    setParsed(null);

    try {
      await initCategories();
      const cats = await fetchCategories();
      const catData = cats.map(c => ({ name: c.name, type: c.type, tag: c.tag }));

      const resp = await fetch(AI_PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "parse",
          text: input.trim(),
          categories: catData,
          today: getTodayString(),
          aiSettings: settings.aiSettings,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || `Request failed (${resp.status})`);
      }

      const data = await resp.json();
      const result = data.result as AIParsedTransaction;

      if (!result || typeof result !== "object") {
        throw new Error("AI returned an unexpected response");
      }

      const matchedCat = cats.find(c =>
        c.name.toLowerCase() === (result.category || "").toLowerCase()
      );
      if (matchedCat) {
        setCategoryId(matchedCat.id);
        setTag(matchedCat.tag);
      } else {
        const fallback = cats.find(c => c.type === result.type);
        if (fallback) {
          setCategoryId(fallback.id);
          setTag(fallback.tag);
        }
      }

      setParsed(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse transaction with AI");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!parsed || !categoryId || !parsed.amount) return;
    setSaving(true);
    try {
      await createTransaction({
        type: parsed.type,
        amount: parsed.amount,
        category_id: categoryId,
        date: parsed.date || getTodayString(),
        account_id: accountId,
        merchant: parsed.merchant || null,
        notes: parsed.notes || null,
        tag,
        tags: [],
      });

      if (parsed.merchant?.trim()) {
        const existing = await findPayeeRule(parsed.merchant.trim());
        if (!existing) {
          await createPayeeRule({
            payee_name: parsed.merchant.trim(),
            category_id: categoryId,
            type: parsed.type,
            is_active: true,
          });
        }
      }

      onDone();
    } catch (e) {
      console.error(e);
      setSaving(false);
    }
  };

  const filteredCategories = categories.filter(c => c.type === (parsed?.type || "outflow"));

  return (
    <div className="px-4 pt-6 pb-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <button onClick={onCancel} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
          <X size={18} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-1.5">
          <Sparkles size={16} className="text-blue-500" />
          Add with AI
        </h1>
        <div className="w-9" />
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
        <p className="text-xs text-blue-700">
          Describe your transaction in natural language. AI will extract the details for you to confirm.
        </p>
      </div>

      <div className="flex-1">
        {!parsed && !loading && (
          <>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="e.g. ₹450 dinner at Swiggy yesterday"
                rows={3}
                autoFocus
                className="w-full text-base text-gray-900 bg-transparent outline-none resize-none"
              />
            </div>
            <div className="space-y-2 mb-4">
              {[
                "₹450 dinner at Swiggy yesterday",
                "2500 grocery shopping at BigBasket today",
                "50000 salary credited on 1st",
                "199 Netflix subscription monthly",
              ].map(ex => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="block w-full text-left px-3 py-2 bg-white border border-gray-100 rounded-lg text-xs text-gray-500 active:scale-[0.98] transition-transform"
                >
                  {ex}
                </button>
              ))}
            </div>
          </>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <Loader size={24} className="text-blue-500 animate-spin" />
            </div>
            <p className="text-sm font-medium text-gray-700">AI is analyzing your input...</p>
            <p className="text-xs text-gray-400 mt-1">This may take a few seconds</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">AI Error</p>
              <p className="text-xs text-red-500 mt-1">{error}</p>
            </div>
          </div>
        )}

        {parsed && !loading && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-2">
              <Check size={16} className="text-emerald-600" />
              <span className="text-sm text-emerald-700 font-medium">AI extracted the following details</span>
            </div>

            {/* Type */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <label className="text-xs text-gray-500 font-medium block mb-2">Transaction Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { parsed.type = "outflow"; setParsed({ ...parsed }); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium ${parsed.type === "outflow" ? "bg-red-500 text-white" : "bg-gray-50 text-gray-600"}`}
                >
                  <ArrowDownLeft size={16} /> Outflow
                </button>
                <button
                  onClick={() => { parsed.type = "inflow"; setParsed({ ...parsed }); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium ${parsed.type === "inflow" ? "bg-emerald-500 text-white" : "bg-gray-50 text-gray-600"}`}
                >
                  <ArrowUpRight size={16} /> Inflow
                </button>
              </div>
            </div>

            {/* Amount */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <label className="text-xs text-gray-500 font-medium block mb-2">Amount</label>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-400">{settings.currencySymbol}</span>
                <input
                  type="number"
                  value={parsed.amount || ""}
                  onChange={e => setParsed({ ...parsed, amount: parseFloat(e.target.value) || 0 })}
                  className="text-xl font-bold text-gray-900 bg-transparent outline-none flex-1"
                />
              </div>
            </div>

            {/* Category */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <label className="text-xs text-gray-500 font-medium block mb-2">Category {parsed.confidence < 0.7 && <span className="text-amber-500">(low confidence)</span>}</label>
              <div className="flex flex-wrap gap-2">
                {filteredCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => { setCategoryId(cat.id); setTag(cat.tag); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${categoryId === cat.id ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-700"}`}
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
                value={parsed.date || getTodayString()}
                onChange={e => setParsed({ ...parsed, date: e.target.value })}
                className="w-full text-sm text-gray-900 bg-transparent outline-none"
              />
            </div>

            {/* Merchant */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <label className="text-xs text-gray-500 font-medium block mb-2">Merchant / Source</label>
              <input
                type="text"
                value={parsed.merchant || ""}
                onChange={e => setParsed({ ...parsed, merchant: e.target.value })}
                placeholder="Merchant name"
                className="w-full text-sm text-gray-900 bg-transparent outline-none"
              />
            </div>

            {/* Tag */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <label className="text-xs text-gray-500 font-medium block mb-2">Tag</label>
              <div className="flex gap-2">
                {TAGS.map(t => (
                  <button
                    key={t}
                    onClick={() => setTag(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tag === t ? TAG_BG_COLORS[t] : "bg-white text-gray-500 border-gray-200"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Account */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <label className="text-xs text-gray-500 font-medium block mb-2">Payment Method (optional)</label>
              <div className="flex flex-wrap gap-2">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => setAccountId(accountId === acc.id ? null : acc.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${accountId === acc.id ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-700"}`}
                  >
                    {acc.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            {parsed.notes && (
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <label className="text-xs text-gray-500 font-medium block mb-2">Notes</label>
                <p className="text-sm text-gray-700">{parsed.notes}</p>
              </div>
            )}

            {/* Missing fields warning */}
            {parsed.missingFields && parsed.missingFields.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  AI couldn't determine: {parsed.missingFields.join(", ")}. Please fill in above.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pt-4 space-y-2">
        {!parsed && !loading && (
          <button
            onClick={handleParse}
            disabled={!input.trim()}
            className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              input.trim()
                ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white active:scale-[0.98]"
                : "bg-gray-200 text-gray-400"
            }`}
          >
            <Sparkles size={16} />
            Parse with AI
          </button>
        )}

        {parsed && !loading && (
          <>
            <button
              onClick={handleSave}
              disabled={!categoryId || !parsed.amount || saving}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all ${
                categoryId && parsed.amount && !saving
                  ? "bg-gray-900 text-white active:scale-[0.98]"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {saving ? "Saving..." : "Confirm & Save"}
            </button>
            <button
              onClick={() => { setParsed(null); setError(null); }}
              className="w-full py-2.5 text-sm text-gray-500 font-medium"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
