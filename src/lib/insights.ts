import { db, ensureInitialized } from "./db";
import { getTodayString, getMonthBounds } from "./format";
import { RecurringSubType } from "@/types";

export interface SafeToSpendBreakdown {
  currentBalance: number;
  upcomingCommitments: number;
  safeToSpend: number;
  daysRemainingInMonth: number;
  breakdown: {
    subscriptions: number;
    investments: number;
    loans: number;
  };
  upcomingItems: {
    id: string;
    merchant: string;
    amount: number;
    next_date: string;
    sub_type: RecurringSubType;
  }[];
}

export async function computeSafeToSpend(): Promise<SafeToSpendBreakdown> {
  await ensureInitialized();

  const [allTx, allRecurring] = await Promise.all([
    db.transactions.toArray(),
    db.recurring_transactions.toArray(),
  ]);

  // 1. Current total balance from transactions
  let currentBalance = 0;
  for (const t of allTx) {
    if (t.type === "inflow") {
      currentBalance += Number(t.amount);
    } else {
      currentBalance -= Number(t.amount);
    }
  }

  // 2. Upcoming commitments before the end of current month
  const today = getTodayString();
  const { end: monthEnd } = getMonthBounds();

  let subscriptions = 0;
  let investments = 0;
  let loans = 0;
  const upcomingItems: SafeToSpendBreakdown["upcomingItems"] = [];

  for (const r of allRecurring) {
    if (!r.is_active || r.type !== "outflow") continue;

    // Item is due between today and end of this month
    if (r.next_date >= today && r.next_date <= monthEnd) {
      const amt = Number(r.amount);
      const subType = r.sub_type || RecurringSubType.Subscription;

      if (subType === RecurringSubType.Investment) {
        investments += amt;
      } else if (subType === RecurringSubType.Loan) {
        loans += amt;
      } else {
        subscriptions += amt;
      }

      upcomingItems.push({
        id: r.id,
        merchant: r.merchant || "Recurring Outflow",
        amount: amt,
        next_date: r.next_date,
        sub_type: subType,
      });
    }
  }

  // Sort upcoming items by next due date
  upcomingItems.sort((a, b) => a.next_date.localeCompare(b.next_date));

  const upcomingCommitments = subscriptions + investments + loans;
  const safeToSpend = currentBalance - upcomingCommitments;

  // Days remaining in month
  const now = new Date(today + "T00:00:00");
  const end = new Date(monthEnd + "T00:00:00");
  const daysRemainingInMonth = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  return {
    currentBalance,
    upcomingCommitments,
    safeToSpend,
    daysRemainingInMonth,
    breakdown: {
      subscriptions,
      investments,
      loans,
    },
    upcomingItems,
  };
}

export interface PriceHikeAlert {
  recurringId: string;
  merchant: string;
  currentAmount: number;
  previousAmount: number;
  changeAmount: number;
  changePercent: number;
  earliestDate: string;
  history: { date: string; amount: number }[];
}

export async function detectPriceHikes(): Promise<PriceHikeAlert[]> {
  await ensureInitialized();

  const [recurring, allTx] = await Promise.all([
    db.recurring_transactions.toArray(),
    db.transactions.toArray(),
  ]);

  const activeSubscriptions = recurring.filter(
    (r) => r.is_active && r.type === "outflow" && (!r.sub_type || r.sub_type === RecurringSubType.Subscription) && r.merchant
  );

  const alerts: PriceHikeAlert[] = [];

  for (const sub of activeSubscriptions) {
    if (!sub.merchant) continue;
    const targetName = sub.merchant.trim().toLowerCase();

    // Match transactions with this merchant
    const matchingTx = allTx
      .filter((t) => (t.merchant || "").trim().toLowerCase() === targetName && t.type === sub.type)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (matchingTx.length < 2) continue;

    const history = matchingTx.map((t) => ({ date: t.date, amount: Number(t.amount) }));
    const distinctAmounts = Array.from(new Set(history.map((h) => h.amount)));

    if (distinctAmounts.length >= 2) {
      const earliest = distinctAmounts[0];
      const current = Number(sub.amount);

      if (current > earliest) {
        const changeAmount = current - earliest;
        const changePercent = Math.round((changeAmount / earliest) * 100);

        alerts.push({
          recurringId: sub.id,
          merchant: sub.merchant,
          currentAmount: current,
          previousAmount: earliest,
          changeAmount,
          changePercent,
          earliestDate: history[0].date,
          history,
        });
      }
    }
  }

  return alerts;
}

