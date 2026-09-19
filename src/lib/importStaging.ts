import { db, ensureInitialized } from "@/lib/db";
import type { ImportDraft, ImportSource, ImportDraftMode, StagedTransactionRow } from "@/types";
import type { TransactionWithNames } from "@/lib/data";

export const ACTIVE_STAGING_DRAFT_ID = "active_staging_draft";

export interface SaveDraftPayload {
  fileName: string;
  source: ImportSource;
  mode: ImportDraftMode;
  rows: StagedTransactionRow[];
}

/**
 * Persists an in-progress import staging draft into IndexedDB.
 */
export async function saveImportDraft(payload: SaveDraftPayload): Promise<void> {
  await ensureInitialized();
  const now = new Date().toISOString();
  const existing = await db.import_drafts.get(ACTIVE_STAGING_DRAFT_ID);

  const draft: ImportDraft = {
    id: ACTIVE_STAGING_DRAFT_ID,
    fileName: payload.fileName,
    source: payload.source,
    mode: payload.mode,
    rows: payload.rows,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  await db.import_drafts.put(draft);
}

/**
 * Loads the active staging draft from IndexedDB, if one exists.
 */
export async function getImportDraft(): Promise<ImportDraft | null> {
  await ensureInitialized();
  const draft = await db.import_drafts.get(ACTIVE_STAGING_DRAFT_ID);
  if (!draft || !draft.rows || draft.rows.length === 0) {
    return null;
  }
  return draft;
}

/**
 * Deletes the active staging draft from IndexedDB.
 */
export async function clearImportDraft(): Promise<void> {
  await ensureInitialized();
  await db.import_drafts.delete(ACTIVE_STAGING_DRAFT_ID);
}

/**
 * Re-evaluates duplicate states of staged rows against the current live database transactions.
 * This guarantees that if transactions were added/modified while the draft was paused,
 * duplicate flags reflect the current state.
 */
export function refreshDraftDuplicates(
  rows: StagedTransactionRow[],
  existingTxList: TransactionWithNames[]
): StagedTransactionRow[] {
  const seenSignatures = new Set<string>();

  return rows.map((r) => {
    const isDbDuplicate = existingTxList.some((t) => {
      if (t.type !== r.type) return false;
      if (Math.abs(Number(t.amount) - r.amount) > 0.001) return false;
      if (t.date !== r.date) return false;

      const candMerchant = (r.merchant || "").trim().toLowerCase();
      const existMerchant = (t.merchant || "").trim().toLowerCase();

      if (candMerchant && existMerchant) {
        return candMerchant === existMerchant;
      }

      const candCat = (r.category || "").trim().toLowerCase();
      const existCat = (t.category_name || "").trim().toLowerCase();
      if (candCat && existCat && candCat === existCat) {
        return true;
      }

      const candNotes = (r.notes || "").trim().toLowerCase();
      const existNotes = (t.notes || "").trim().toLowerCase();
      if (candNotes && existNotes && candNotes === existNotes) {
        return true;
      }

      if (!candMerchant && !existMerchant && !candNotes && !existNotes) {
        return true;
      }

      return false;
    });

    const sig = `${r.date}_${r.type}_${r.amount}_${(r.merchant || "").trim().toLowerCase()}_${(r.category || "").trim().toLowerCase()}`;
    const isFileDuplicate = seenSignatures.has(sig);
    seenSignatures.add(sig);

    const isDuplicate = isDbDuplicate || isFileDuplicate;

    return {
      ...r,
      isDuplicate,
    };
  });
}
