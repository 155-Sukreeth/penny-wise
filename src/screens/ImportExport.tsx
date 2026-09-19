import { useState, useRef, useEffect } from "react";
import { Download, Upload, FileText, Sparkles, AlertCircle, Check, X, Loader, ArrowDownLeft, ArrowUpRight, CheckSquare, Square, ChevronRight } from "lucide-react";
import type { AppSettings, Transaction, ImportDraft, StagedTransactionRow } from "@/types";
import { TransactionType, TagType, ImportSource, ImportDraftMode, TAG_BG_COLORS } from "@/types";
import { fetchTransactions, fetchCategories, fetchAccounts, createTransaction, createCategory, createAccount, type TransactionWithNames } from "@/lib/data";
import { db } from "@/lib/db";
import { importTransactionsWithAI } from "@/lib/ai";
import { formatCurrency, getTodayString } from "@/lib/format";
import { saveSettings } from "@/lib/settings";
import { exportFile } from "@/lib/exportUtils";
import { saveImportDraft, getImportDraft, clearImportDraft, refreshDraftDuplicates } from "@/lib/importStaging";

type ImportMode = "menu" | "normal" | "ai" | "preview" | "ai-preview";

export function ImportExport({ settings }: { settings: AppSettings }) {
  const [mode, setMode] = useState<ImportMode>("menu");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<StagedTransactionRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [activeDraft, setActiveDraft] = useState<ImportDraft | null>(null);
  const [pendingMode, setPendingMode] = useState<ImportMode | null>(null);
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getImportDraft().then(draft => {
      setActiveDraft(draft);
    });
  }, [mode]);

  const parseCSV = (text: string): string[][] => {
    const cleanText = text.replace(/^\uFEFF/, "");
    const rows: string[][] = [];
    let current: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < cleanText.length; i++) {
      const c = cleanText[i];
      if (inQuotes) {
        if (c === '"') {
          if (cleanText[i + 1] === '"') { field += '"'; i++; }
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

  const checkIsDuplicate = (
    candidate: {
      date: string;
      amount: number;
      type: TransactionType;
      merchant?: string | null;
      category?: string | null;
      notes?: string | null;
    },
    existingList: TransactionWithNames[]
  ): boolean => {
    return existingList.some(t => {
      // 1. Must match transaction type (inflow vs outflow)
      if (t.type !== candidate.type) return false;

      // 2. Must match amount (accounting for floating point differences)
      if (Math.abs(Number(t.amount) - candidate.amount) > 0.001) return false;

      // 3. Must match date
      if (t.date !== candidate.date) return false;

      const candMerchant = (candidate.merchant || "").trim().toLowerCase();
      const existMerchant = (t.merchant || "").trim().toLowerCase();

      // 4. If both have merchant info, compare merchants
      if (candMerchant && existMerchant) {
        return candMerchant === existMerchant;
      }

      // 5. If merchant is missing from either, check category match
      const candCat = (candidate.category || "").trim().toLowerCase();
      const existCat = (t.category_name || "").trim().toLowerCase();
      if (candCat && existCat && candCat === existCat) {
        return true;
      }

      // 6. If notes match
      const candNotes = (candidate.notes || "").trim().toLowerCase();
      const existNotes = (t.notes || "").trim().toLowerCase();
      if (candNotes && existNotes && candNotes === existNotes) {
        return true;
      }

      // 7. If both have empty merchant and no category/notes match, date+type+amount match implies duplicate
      if (!candMerchant && !existMerchant && !candNotes && !existNotes) {
        return true;
      }

      return false;
    });
  };

  const handleFileUpload = async (file: File, useAI: boolean) => {
    setLoading(true);
    setError(null);

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
        const results = await importTransactionsWithAI(
          rows,
          cats.map(c => ({ name: c.name, type: c.type, tag: c.tag })),
          getTodayString(),
          settings.aiSettings
        );
        if (!Array.isArray(results)) throw new Error("AI returned unexpected format");

        const existing = await fetchTransactions({ limit: 5000 });
        const seenAiSignatures = new Set<string>();

        const enriched = results.map(r => {
          const isDbDup = checkIsDuplicate(r, existing);
          const sig = `${r.date}_${r.type}_${r.amount}_${(r.merchant || "").trim().toLowerCase()}_${(r.category || "").trim().toLowerCase()}`;
          const isFileDup = seenAiSignatures.has(sig);
          seenAiSignatures.add(sig);

          const isDuplicate = isDbDup || isFileDup;
          return {
            ...r,
            isDuplicate,
            selected: !isDuplicate, // Duplicates default to UNSELECTED!
          };
        });

        const draftPayload = {
          fileName: file.name,
          source: ImportSource.AI,
          mode: ImportDraftMode.AIPreview,
          rows: enriched,
        };
        await saveImportDraft(draftPayload);
        setActiveDraft({
          id: "active_staging_draft",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...draftPayload,
        });

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
      const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").trim().toLowerCase());
      const required = ["date", "type", "amount", "category"];
      const missing = required.filter(r => !headers.includes(r));
      if (missing.length > 0) {
        setError(`Missing required columns: ${missing.join(", ")}. Expected format: Date, Type, Amount, Category, Merchant, Account, Tag, Notes`);
        setLoading(false);
        return;
      }

      const cats = await fetchCategories();
      const existing = await fetchTransactions({ limit: 5000 });
      const seenFileSignatures = new Set<string>();

      const rawRows = rows.slice(1).map(row => {
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
        };
      }).filter(r => r.amount > 0);

      const parsed: StagedTransactionRow[] = rawRows.map(r => {
        const isDbDup = checkIsDuplicate(r, existing);
        const sig = `${r.date}_${r.type}_${r.amount}_${r.merchant.trim().toLowerCase()}_${r.category.trim().toLowerCase()}`;
        const isFileDup = seenFileSignatures.has(sig);
        seenFileSignatures.add(sig);

        const isDuplicate = isDbDup || isFileDup;
        return {
          ...r,
          isDuplicate,
          selected: !isDuplicate, // Duplicates default to UNSELECTED!
        };
      });

      const draftPayload = {
        fileName: file.name,
        source: ImportSource.CSV,
        mode: ImportDraftMode.Preview,
        rows: parsed,
      };
      await saveImportDraft(draftPayload);
      setActiveDraft({
        id: "active_staging_draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...draftPayload,
      });

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

    let importedCount = 0;
    for (const row of selected) {
      let cat = cats.find(c => c.name.toLowerCase() === row.category.toLowerCase());
      if (!cat && row.category.trim()) {
        try {
          cat = await createCategory({
            name: row.category.trim(),
            type: row.type,
            tag: row.tag || "Want",
          });
          cats.push(cat);
        } catch {
          // ignore error if auto-creation fails
        }
      }

      let acc = accs.find(a => a.name.toLowerCase() === row.account.toLowerCase());
      if (!acc && row.account.trim()) {
        try {
          acc = await createAccount({
            name: row.account.trim(),
            type: "bank",
          });
          accs.push(acc);
        } catch {
          // ignore error if auto-creation fails
        }
      }

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
      importedCount++;
    }
    await clearImportDraft();
    setActiveDraft(null);
    setLoading(false);
    setMode("menu");
    setPreviewRows([]);
    setFileName("");
    setError(null);
    setSuccessMsg(`Successfully imported ${importedCount} transaction${importedCount !== 1 ? "s" : ""}!`);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleExportCSV = async () => {
    setError(null);
    try {
      const transactions = await fetchTransactions({ limit: 50000 });
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
      const filename = `pennywise-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      const result = await exportFile({
        content: csv,
        filename,
        mimeType: "text/csv",
        dialogTitle: "Export Transactions CSV",
      });

      if (result.success) {
        setSuccessMsg(result.method === "shared" ? "Export shared successfully!" : "File downloaded successfully!");
        setTimeout(() => setSuccessMsg(null), 3000);
      } else if (result.error) {
        setError("Failed to export CSV: " + result.error);
      }
    } catch (e) {
      setError("Failed to export CSV: " + (e instanceof Error ? e.message : "unknown error"));
    }
  };

  const handleBackup = async () => {
    setError(null);
    try {
      const [txs, cats, accs, budgets, recurring, rules, settingsVal] = await Promise.all([
        fetchTransactions({ limit: 50000 }),
        fetchCategories(),
        fetchAccounts(),
        db.budgets.toArray(),
        db.recurring_transactions.toArray(),
        db.payee_rules.toArray(),
        db.app_settings.get("app_settings"),
      ]);
      const backup = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        transactions: txs,
        categories: cats,
        accounts: accs,
        budgets,
        recurringTransactions: recurring,
        payeeRules: rules,
        settings: settingsVal?.value,
      };
      const jsonStr = JSON.stringify(backup, null, 2);
      const filename = `pennywise-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const result = await exportFile({
        content: jsonStr,
        filename,
        mimeType: "application/json",
        dialogTitle: "Export PennyWise Backup",
      });

      if (result.success) {
        setSuccessMsg(result.method === "shared" ? "Backup shared successfully!" : "File downloaded successfully!");
        setTimeout(() => setSuccessMsg(null), 3000);
      } else if (result.error) {
        setError("Failed to generate backup: " + result.error);
      }
    } catch (e) {
      setError("Failed to generate backup: " + (e instanceof Error ? e.message : "unknown error"));
    }
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

      if (backup.categories && Array.isArray(backup.categories)) {
        for (const cat of backup.categories) {
          await db.categories.put(cat);
        }
      }
      if (backup.accounts && Array.isArray(backup.accounts)) {
        for (const acc of backup.accounts) {
          await db.accounts.put(acc);
        }
      }
      if (backup.budgets && Array.isArray(backup.budgets)) {
        for (const b of backup.budgets) {
          await db.budgets.put(b);
        }
      }
      if (backup.recurringTransactions && Array.isArray(backup.recurringTransactions)) {
        for (const r of backup.recurringTransactions) {
          await db.recurring_transactions.put(r);
        }
      }
      if (backup.payeeRules && Array.isArray(backup.payeeRules)) {
        for (const rule of backup.payeeRules) {
          await db.payee_rules.put(rule);
        }
      }
      if (backup.settings) {
        await saveSettings(backup.settings);
      }

      const cats = await fetchCategories();
      const accs = await fetchAccounts();

      let restoredTxCount = 0;
      for (const tx of backup.transactions) {
        const cat = cats.find(c => c.name === tx.category_name) || cats.find(c => c.id === tx.category_id);
        const acc = accs.find(a => a.name === tx.account_name) || accs.find(a => a.id === tx.account_id);
        const restoredTx: Transaction = {
          id: tx.id || crypto.randomUUID(),
          type: (tx.type as TransactionType) || TransactionType.Outflow,
          amount: Number(tx.amount) || 0,
          category_id: cat?.id || tx.category_id || null,
          date: tx.date || new Date().toISOString().slice(0, 10),
          account_id: acc?.id || tx.account_id || null,
          merchant: tx.merchant || null,
          notes: tx.notes || null,
          tag: (tx.tag as TagType) || TagType.Want,
          tags: tx.tags || [],
          attachment_url: tx.attachment_url || null,
          created_at: tx.created_at || new Date().toISOString(),
          updated_at: tx.updated_at || new Date().toISOString(),
        };
        await db.transactions.put(restoredTx);
        restoredTxCount++;
      }
      setLoading(false);
      setMode("menu");
      setSuccessMsg(`Backup restored successfully (${restoredTxCount} transaction${restoredTxCount !== 1 ? "s" : ""} restored)!`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (e) {
      setError("Failed to restore backup: " + (e instanceof Error ? e.message : "invalid file"));
      setLoading(false);
    }
  };

  const updateRowsAndPersist = (updater: (prev: StagedTransactionRow[]) => StagedTransactionRow[]) => {
    setPreviewRows(prev => {
      const updated = updater(prev);
      if (fileName && (mode === "preview" || mode === "ai-preview")) {
        const currentSource: ImportSource = mode === "ai-preview" ? ImportSource.AI : ImportSource.CSV;
        const currentMode: ImportDraftMode = mode === "ai-preview" ? ImportDraftMode.AIPreview : ImportDraftMode.Preview;
        saveImportDraft({
          fileName,
          source: currentSource,
          mode: currentMode,
          rows: updated,
        }).catch(err => console.error("Auto-save draft error:", err));
      }
      return updated;
    });
  };

  const toggleRow = (idx: number) => {
    updateRowsAndPersist(prev => prev.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r)));
  };

  const selectAll = () => {
    updateRowsAndPersist(prev => prev.map(r => ({ ...r, selected: true })));
  };

  const deselectAll = () => {
    updateRowsAndPersist(prev => prev.map(r => ({ ...r, selected: false })));
  };

  const skipDuplicates = () => {
    updateRowsAndPersist(prev => prev.map(r => ({ ...r, selected: !r.isDuplicate })));
  };

  const handleResumeDraft = async () => {
    if (!activeDraft) return;
    setLoading(true);
    try {
      const existing = await fetchTransactions({ limit: 5000 });
      const freshRows = refreshDraftDuplicates(activeDraft.rows, existing);
      setPreviewRows(freshRows);
      setFileName(activeDraft.fileName);
      setMode(activeDraft.mode);
    } catch (e) {
      console.error("Failed to resume draft:", e);
      setPreviewRows(activeDraft.rows);
      setFileName(activeDraft.fileName);
      setMode(activeDraft.mode);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardDraft = async () => {
    await clearImportDraft();
    setActiveDraft(null);
    setPreviewRows([]);
    setFileName("");
    setSuccessMsg("Staged import discarded.");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleStartImport = (targetMode: "normal" | "ai") => {
    if (activeDraft) {
      setPendingMode(targetMode);
      setShowOverwriteWarning(true);
    } else {
      setMode(targetMode);
    }
  };

  const handleConfirmDiscardAndProceed = async () => {
    await clearImportDraft();
    setActiveDraft(null);
    setPreviewRows([]);
    setFileName("");
    setShowOverwriteWarning(false);
    if (pendingMode) {
      setMode(pendingMode);
      setPendingMode(null);
    }
  };

  const handleResumeFromWarning = () => {
    setShowOverwriteWarning(false);
    setPendingMode(null);
    handleResumeDraft();
  };

  const handleCancelWarning = () => {
    setShowOverwriteWarning(false);
    setPendingMode(null);
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

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-4 flex items-start gap-2 animate-in fade-in">
            <Check size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-emerald-700">{successMsg}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {activeDraft && (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-5 shadow-xs animate-in fade-in">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
                  {activeDraft.source === ImportSource.AI ? <Sparkles size={16} /> : <Upload size={16} />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-900">Import in Progress</span>
                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {activeDraft.source}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate max-w-[210px] mt-0.5">
                    {activeDraft.fileName || "Uploaded Statement"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-xs font-medium text-gray-400 hover:text-red-500 py-1 px-2 rounded-lg transition"
              >
                Discard
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-3 pl-0.5">
              <span className="font-semibold text-gray-900">{activeDraft.rows.filter(r => r.selected).length}</span> of {activeDraft.rows.length} transactions selected for review.
            </p>

            <button
              type="button"
              onClick={handleResumeDraft}
              className="w-full py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs active:scale-[0.98] transition flex items-center justify-center gap-1.5"
            >
              Resume Review
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div className="space-y-3">
          <SectionTitle>Export</SectionTitle>
          <ActionCard icon={<Download size={20} className="text-gray-600" />} title="Export as CSV" subtitle="Download all transactions" onClick={handleExportCSV} />
          <ActionCard icon={<FileText size={20} className="text-gray-600" />} title="Full Backup" subtitle="Export all data as JSON" onClick={handleBackup} />

          <SectionTitle>Import</SectionTitle>
          <ActionCard icon={<Upload size={20} className="text-gray-600" />} title="Import CSV" subtitle="From this app's export format" onClick={() => handleStartImport("normal")} />
          <ActionCard
            icon={<Sparkles size={20} className="text-gray-700" />}
            title="Import with AI"
            subtitle="Bank statements, unstructured files"
            onClick={() => handleStartImport("ai")}
            highlight={!!settings.aiSettings?.apiKey}
          />

          <SectionTitle>Restore</SectionTitle>
          <ActionCard icon={<Upload size={20} className="text-gray-600" />} title="Restore from Backup" subtitle="Import a .json backup file" onClick={() => fileRef.current?.click()} />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,text/plain"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleRestore(f); e.target.value = ""; }}
          />
        </div>

        {/* Overwrite Protection Warning Modal */}
        {showOverwriteWarning && activeDraft && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-in fade-in"
            onClick={handleCancelWarning}
          >
            <div
              className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-4 text-amber-600">
                <AlertCircle size={24} />
              </div>

              <h3 className="text-base font-bold text-gray-900 mb-1.5">
                Replace Unfinished Import?
              </h3>

              <p className="text-xs text-gray-500 leading-relaxed mb-5">
                You already have an import draft in progress for{" "}
                <span className="font-semibold text-gray-800 truncate inline-block max-w-[170px] align-bottom">
                  {activeDraft.fileName || "Uploaded Statement"}
                </span>{" "}
                ({activeDraft.rows.length} transactions). Starting a new import will discard your previous review.
              </p>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleResumeFromWarning}
                  className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold shadow-xs active:scale-[0.98] transition flex items-center justify-center gap-1.5"
                >
                  Resume Existing Import
                </button>

                <button
                  type="button"
                  onClick={handleConfirmDiscardAndProceed}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-semibold active:scale-[0.98] transition"
                >
                  Discard & Start New Import
                </button>

                <button
                  type="button"
                  onClick={handleCancelWarning}
                  className="w-full py-2.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition text-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (mode === "normal" || mode === "ai") {
    const isAI = mode === "ai";
    return (
      <div className="px-4 pt-6 pb-6 min-h-screen flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => { setMode("menu"); setError(null); }} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition text-gray-600 hover:bg-gray-200">
            <X size={18} />
          </button>
          <h1 className="text-base font-semibold text-gray-900 flex items-center gap-1.5">
            {isAI && <Sparkles size={16} className="text-gray-900" />}
            {isAI ? "Import with AI" : "Import CSV"}
          </h1>
          <div className="w-9" />
        </div>

        {isAI && (
          <div className="bg-gray-100/80 border border-gray-200/80 rounded-2xl p-3.5 mb-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              Upload any bank statement (CSV, Excel, or text). AI will analyze and map your transactions into a review staging area.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-3.5 mb-4 flex items-start gap-2.5">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center py-8">
          <div
            onClick={() => importFileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-200 hover:border-gray-400 bg-white rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors shadow-2xs"
          >
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <Upload size={24} className="text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-gray-800">Tap to select a file</p>
            <p className="text-xs text-gray-400 mt-1">{isAI ? "CSV, TXT, or any text file" : "CSV from this app's export"}</p>
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept={isAI ? ".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel" : ".csv,text/csv,text/plain,application/vnd.ms-excel"}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f, isAI);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    );
  }

  // Preview mode (normal or AI)
  const duplicates = previewRows.filter(r => r.isDuplicate).length;
  const selectedCount = previewRows.filter(r => r.selected).length;

  return (
    <div className="px-4 pt-6 pb-6 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => { setMode("menu"); setError(null); }}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition text-gray-600 hover:bg-gray-200"
        >
          <X size={18} />
        </button>
        <div className="text-center">
          <h1 className="text-base font-semibold text-gray-900">Review Import</h1>
          {fileName && <p className="text-[11px] text-gray-400 max-w-[210px] truncate">{fileName}</p>}
        </div>
        <div className="w-9" />
      </div>

      {duplicates > 0 && (
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3.5 mb-3 flex items-start gap-2.5">
          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            {duplicates} potential duplicate{duplicates !== 1 ? "s" : ""} detected. They have been unselected by default.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <div>
            <span>{previewRows.length} found</span>
            <span> · </span>
            <span className="font-semibold text-gray-900">{selectedCount} selected</span>
          </div>
          {duplicates > 0 && (
            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
              {duplicates} duplicate{duplicates !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50 active:scale-95 transition shadow-2xs"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50 active:scale-95 transition shadow-2xs"
          >
            Deselect All
          </button>
          {duplicates > 0 && (
            <button
              type="button"
              onClick={skipDuplicates}
              className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-1.5 hover:bg-amber-100 active:scale-95 transition shadow-2xs flex items-center gap-1"
            >
              Skip Duplicates ({duplicates})
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50 shadow-2xs mb-4">
        {previewRows.map((r, idx) => (
          <div
            key={idx}
            onClick={() => toggleRow(idx)}
            className={`flex items-center gap-3 p-3.5 cursor-pointer select-none transition-colors active:scale-[0.99] ${
              r.selected
                ? r.isDuplicate
                  ? "bg-amber-50/30 hover:bg-amber-50/50"
                  : "bg-white hover:bg-gray-50/60"
                : "bg-gray-50/70 opacity-55 hover:bg-gray-50"
            }`}
          >
            <div className="flex-shrink-0 text-gray-400">
              {r.selected ? (
                <CheckSquare size={19} className="text-gray-900" />
              ) : (
                <Square size={19} className="text-gray-300" />
              )}
            </div>

            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              r.type === TransactionType.Inflow ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
            }`}>
              {r.type === TransactionType.Inflow ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {r.merchant || r.category}
                </span>
                {r.isDuplicate && (
                  <span className="text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    Duplicate
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span>{r.date}</span>
                <span>·</span>
                <span>{r.category}</span>
                {r.account && (
                  <>
                    <span>·</span>
                    <span>{r.account}</span>
                  </>
                )}
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${TAG_BG_COLORS[r.tag]}`}>
                  {r.tag}
                </span>
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <span className={`text-sm font-bold ${
                r.type === TransactionType.Inflow ? "text-emerald-600" : "text-gray-900"
              }`}>
                {r.type === TransactionType.Inflow ? "+" : "-"}
                {formatCurrency(r.amount, settings)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent pt-3 pb-4 mt-auto">
        <button
          onClick={handleConfirmImport}
          disabled={selectedCount === 0}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm shadow-md active:scale-98 transition-all ${
            selectedCount > 0
              ? "bg-gray-900 text-white hover:bg-black"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          Import {selectedCount} Transaction{selectedCount !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-5 mb-2 px-1">{children}</h2>;
}

function ActionCard({ icon, title, subtitle, onClick, highlight }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3.5 p-4 rounded-2xl border border-gray-100 bg-white text-left active:scale-[0.98] transition-all hover:border-gray-200 shadow-2xs"
    >
      <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {highlight && (
            <span className="text-[10px] font-semibold bg-gray-900 text-white px-2 py-0.5 rounded-full">
              AI Powered
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
    </button>
  );
}
