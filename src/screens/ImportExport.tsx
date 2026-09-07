import { useState, useRef } from "react";
import { Download, Upload, FileText, Sparkles, AlertCircle, Check, X, Loader, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { AppSettings, TransactionType, TagType, Category } from "@/types";
import { TAGS, TAG_BG_COLORS } from "@/types";
import { fetchTransactions, fetchCategories, fetchAccounts, createTransaction } from "@/lib/data";
import { supabase, AI_PROXY_URL } from "@/lib/supabase";
import { formatCurrency, getTodayString } from "@/lib/format";

type ImportMode = "menu" | "normal" | "ai" | "preview" | "ai-preview";

interface PreviewRow {
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  merchant: string;
  notes: string;
  tag: TagType;
  account: string;
  isDuplicate?: boolean;
  selected: boolean;
}

export function ImportExport({ settings }: { settings: AppSettings }) {
  const [mode, setMode] = useState<ImportMode>("menu");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [aiText, setAiText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const initData = async () => {
    const [cats, accs] = await Promise.all([fetchCategories(), fetchAccounts()]);
    setCategories(cats);
    setAccounts(accs.map(a => ({ id: a.id, name: a.name })));
  };

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let current: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { current.push(field); field = ""; }
        else if (c === "\n") { current.push(field); rows.push(current); current = []; field = ""; }
        else if (c !== "\r") field += c;
      }
    }
    if (field || current.length) { current.push(field); rows.push(current); }
    return rows.filter(r => r.some(c => c.trim()));
  };

  const handleFileUpload = async (file: File, useAI: boolean) => {
    setLoading(true);
    setError(null);
    await initData();

    const text = await file.text();
    setFileName(file.name);

    if (useAI) {
      if (!settings.aiSettings?.apiKey) {
        setError("AI is not configured. Please add an API key in Settings.");
        setLoading(false);
        return;
      }
      const rows = text.split("\n").filter(r => r.trim()).slice(0, 100);
      try {
        const cats = await fetchCategories();
        const resp = await fetch(AI_PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "import",
            rows,
            categories: cats.map(c => ({ name: c.name, type: c.type, tag: c.tag })),
            today: getTodayString(),
            aiSettings: settings.aiSettings,
          }),
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || `AI import failed (${resp.status})`);
        }
        const data = await resp.json();
        const results = data.result as PreviewRow[];
        if (!Array.isArray(results)) throw new Error("AI returned unexpected format");

        const existing = await fetchTransactions({ limit: 5000 });
        const enriched = results.map(r => ({
          ...r,
          isDuplicate: existing.some(t =>
            t.date === r.date &&
            Number(t.amount) === r.amount &&
            (t.merchant || "").toLowerCase() === (r.merchant || "").toLowerCase()
          ),
          selected: true,
        }));
        setPreviewRows(enriched);
        setMode("ai-preview");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to import with AI");
      } finally {
        setLoading(false);
      }
    } else {
      // Normal CSV import (app's own format)
      const rows = parseCSV(text);
      if (rows.length < 2) {
        setError("CSV file appears to be empty or has no data rows");
        setLoading(false);
        return;
      }
      const headers = rows[0].map(h => h.trim().toLowerCase());
      const required = ["date", "type", "amount", "category"];
      const missing = required.filter(r => !headers.includes(r));
      if (missing.length > 0) {
        setError(`Missing required columns: ${missing.join(", ")}. Expected format: Date, Type, Amount, Category, Merchant, Account, Tag, Notes`);
        setLoading(false);
        return;
      }

      const cats = await fetchCategories();
      const existing = await fetchTransactions({ limit: 5000 });
      const parsed: PreviewRow[] = rows.slice(1).map(row => {
        const get = (name: string) => {
          const idx = headers.indexOf(name);
          return idx >= 0 ? row[idx]?.trim() || "" : "";
        };
        const catName = get("category");
        const cat = cats.find(c => c.name.toLowerCase() === catName.toLowerCase());
        const txType = (get("type") || "outflow") as TransactionType;
        const amt = parseFloat(get("amount")) || 0;
        const date = get("date") || getTodayString();
        const merchant = get("merchant") || get("merchant/source") || "";
        const account = get("account") || get("payment/account") || "";
        const tagVal = (get("tag") || cat?.tag || "Want") as TagType;
        return {
          type: txType,
          amount: amt,
          category: catName,
          date,
          merchant,
          notes: get("notes") || "",
          tag: tagVal,
          account,
          isDuplicate: existing.some(t =>
            t.date === date &&
            Number(t.amount) === amt &&
            (t.merchant || "").toLowerCase() === merchant.toLowerCase()
          ),
          selected: true,
        };
      }).filter(r => r.amount > 0);

      setPreviewRows(parsed);
      setMode("preview");
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    setLoading(true);
    const selected = previewRows.filter(r => r.selected);
    const cats = await fetchCategories();
    const accs = await fetchAccounts();

    for (const row of selected) {
      const cat = cats.find(c => c.name.toLowerCase() === row.category.toLowerCase());
      const acc = accs.find(a => a.name.toLowerCase() === row.account.toLowerCase());
      await createTransaction({
        type: row.type,
        amount: row.amount,
        category_id: cat?.id || null,
        date: row.date,
        account_id: acc?.id || null,
        merchant: row.merchant || null,
        notes: row.notes || null,
        tag: row.tag,
        tags: [],
      });
    }
    setLoading(false);
    setMode("menu");
    setPreviewRows([]);
    setError(null);
  };

  const handleExportCSV = async () => {
    const transactions = await fetchTransactions({ limit: 10000 });
    const headers = ["Date", "Type", "Amount", "Category", "Merchant", "Account", "Tag", "Notes"];
    const rows = transactions.map(t => [
      t.date, t.type, t.amount, t.category_name || "",
      t.merchant || "", t.account_name || "", t.tag, (t.notes || "").replace(/,/g, ";"),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackup = async () => {
    const [txs, cats, accs, budgets, recurring] = await Promise.all([
      fetchTransactions({ limit: 10000 }),
      fetchCategories(),
      fetchAccounts(),
      (await supabase.from("budgets").select("*")).data || [],
      (await supabase.from("recurring_transactions").select("*")).data || [],
    ]);
    const backup = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      transactions: txs,
      categories: cats,
      accounts: accs,
      budgets,
      recurringTransactions: recurring,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.transactions || !Array.isArray(backup.transactions)) {
        setError("Invalid backup file format");
        setLoading(false);
        return;
      }

      const cats = await fetchCategories();
      const accs = await fetchAccounts();

      for (const tx of backup.transactions) {
        const cat = cats.find(c => c.name === tx.category_name) || cats.find(c => c.id === tx.category_id);
        const acc = accs.find(a => a.name === tx.account_name) || accs.find(a => a.id === tx.account_id);
        await createTransaction({
          type: tx.type,
          amount: tx.amount,
          category_id: cat?.id || tx.category_id,
          date: tx.date,
          account_id: acc?.id || tx.account_id,
          merchant: tx.merchant,
          notes: tx.notes,
          tag: tx.tag,
          tags: tx.tags || [],
        });
      }
      setLoading(false);
      setMode("menu");
    } catch (e) {
      setError("Failed to restore backup: " + (e instanceof Error ? e.message : "invalid file"));
      setLoading(false);
    }
  };

  const toggleRow = (idx: number) => {
    setPreviewRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  };

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Import / Export</h1>
        <div className="flex flex-col items-center justify-center py-16">
          <Loader size={28} className="text-gray-400 animate-spin mb-3" />
          <p className="text-sm text-gray-500">Processing...</p>
        </div>
      </div>
    );
  }

  if (mode === "menu") {
    return (
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">Data</h1>
        <p className="text-sm text-gray-500 mb-6">Import, export, and backup</p>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <SectionTitle>Export</SectionTitle>
          <ActionCard icon={<Download size={20} className="text-gray-600" />} title="Export as CSV" subtitle="Download all transactions" onClick={handleExportCSV} />
          <ActionCard icon={<FileText size={20} className="text-gray-600" />} title="Full Backup" subtitle="Export all data as JSON" onClick={handleBackup} />

          <SectionTitle>Import</SectionTitle>
          <ActionCard icon={<Upload size={20} className="text-gray-600" />} title="Import CSV" subtitle="From this app's export format" onClick={() => { setMode("normal"); }} />
          <ActionCard
            icon={<Sparkles size={20} className="text-blue-500" />}
            title="Import with AI"
            subtitle="Bank statements, unstructured files"
            onClick={() => { setMode("ai"); }}
            highlight={!!settings.aiSettings?.apiKey}
          />

          <SectionTitle>Restore</SectionTitle>
          <ActionCard icon={<Upload size={20} className="text-gray-600" />} title="Restore from Backup" subtitle="Import a .json backup file" onClick={() => fileRef.current?.click()} />
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleRestore(f); e.target.value = ""; }}
          />
        </div>
      </div>
    );
  }

  if (mode === "normal" || mode === "ai") {
    const isAI = mode === "ai";
    return (
      <div className="px-4 pt-6 pb-4 min-h-screen flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => { setMode("menu"); setError(null); }} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={18} className="text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-1.5">
            {isAI && <Sparkles size={16} className="text-blue-500" />}
            {isAI ? "Import with AI" : "Import CSV"}
          </h1>
          <div className="w-9" />
        </div>

        {isAI && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
            <p className="text-xs text-blue-700">
              Upload a bank statement (CSV, Excel, or text). AI will analyze and map it to transactions for your review.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center">
          <div
            onClick={() => document.getElementById("file-input")?.click()}
            className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-gray-300 transition-colors"
          >
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <Upload size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">Tap to select a file</p>
            <p className="text-xs text-gray-400 mt-1">{isAI ? "CSV, TXT, or any text file" : "CSV from this app's export"}</p>
          </div>
          <input
            id="file-input"
            type="file"
            accept={isAI ? ".csv,.txt,.tsv" : ".csv"}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, isAI); }}
          />
        </div>
      </div>
    );
  }

  // Preview mode (normal or AI)
  const duplicates = previewRows.filter(r => r.isDuplicate).length;
  const selectedCount = previewRows.filter(r => r.selected).length;

  return (
    <div className="px-4 pt-6 pb-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { setMode("menu"); setError(null); setPreviewRows([]); }} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
          <X size={18} className="text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Review Import</h1>
        <div className="w-9" />
      </div>

      {fileName && <p className="text-xs text-gray-400 mb-3 truncate">{fileName}</p>}

      {duplicates > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">{duplicates} potential duplicate(s) detected. Review before importing.</p>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
        <span>{previewRows.length} rows found</span>
        <span>·</span>
        <span>{selectedCount} selected</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {previewRows.map((r, idx) => (
          <div
            key={idx}
            className={`bg-white rounded-xl p-3 border ${r.isDuplicate ? "border-amber-200" : "border-gray-100"} ${!r.selected ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-2">
              <button onClick={() => toggleRow(idx)} className="mt-1 flex-shrink-0">
                {r.selected ? <Check size={18} className="text-gray-900" /> : <X size={18} className="text-gray-300" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${r.type === "inflow" ? "bg-emerald-50" : "bg-red-50"}`}>
                    {r.type === "inflow" ? <ArrowUpRight size={12} className="text-emerald-600" /> : <ArrowDownLeft size={12} className="text-red-500" />}
                  </div>
                  <span className="text-sm font-medium text-gray-900 truncate">{r.merchant || r.category}</span>
                  {r.isDuplicate && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">DUP</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{r.date}</span>
                  <span>·</span>
                  <span>{r.category}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${TAG_BG_COLORS[r.tag]}`}>{r.tag}</span>
                </div>
              </div>
              <span className="text-sm font-semibold text-gray-900 flex-shrink-0">{formatCurrency(r.amount, settings)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4">
        <button
          onClick={handleConfirmImport}
          disabled={selectedCount === 0}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm ${selectedCount > 0 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-400"}`}
        >
          Import {selectedCount} Transaction{selectedCount !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2 px-1">{children}</h2>;
}

function ActionCard({ icon, title, subtitle, onClick, highlight }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 rounded-2xl border text-left active:scale-[0.98] transition-transform ${highlight ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-white"}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${highlight ? "bg-blue-100" : "bg-gray-100"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
    </button>
  );
}
