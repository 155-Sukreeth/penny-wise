import { db } from "@/lib/db";
import { loadSettings } from "@/lib/settings";
import { formatCurrency } from "@/lib/format";
import {
  scheduleNotificationBatch,
  cancelNotificationBatch,
  hashStringToId,
  NOTIFICATION_CHANNELS,
  type AppNotification,
} from "@/lib/notifications";
import { NotificationTemplates } from "@/lib/notificationMessages";
import { TransactionType, type RecurringTransaction } from "@/types";

/**
 * Generate deterministic notification ID for a recurring transaction and day offset.
 * Kept within positive 31-bit integer bounds for native Android AlarmManager compatibility.
 */
export function getRecurringNotificationId(recurringId: string, daysRemaining: number): number {
  const baseHash = hashStringToId(recurringId);
  return (baseHash * 64 + (daysRemaining % 64)) % 2147483647 || 1;
}

/**
 * Schedule all upcoming notification triggers for a specific recurring transaction.
 */
export async function scheduleRecurringReminder(
  item: RecurringTransaction,
  categoryName?: string
): Promise<void> {
  // First cancel any existing scheduled notifications for this item
  await cancelRecurringReminder(item.id);

  if (!item.is_active || !item.notifications_enabled || !item.next_date) {
    return;
  }

  const settings = await loadSettings();
  if (!settings.notificationsEnabled) {
    return;
  }

  const [year, month, day] = item.next_date.split("-").map(Number);
  const [hour, minute] = (item.notify_time || "09:00").split(":").map(Number);

  if (!year || !month || !day) return;

  const name = item.merchant || categoryName || (item.type === TransactionType.Inflow ? "Income" : "Bill");
  const amountFormatted = formatCurrency(item.amount, settings);
  const isIncome = item.type === TransactionType.Inflow;

  const daysToSchedule: number[] = [];
  const daysBefore = Math.max(0, item.notify_days_before ?? 0);

  if (daysBefore === 0) {
    // Only on due date
    daysToSchedule.push(0);
  } else if (item.repeat_until_acknowledged) {
    // Daily countdown from N days before down to due date (0)
    for (let d = daysBefore; d >= 0; d--) {
      daysToSchedule.push(d);
    }
  } else {
    // Advance notice day + actual due date
    daysToSchedule.push(daysBefore);
    daysToSchedule.push(0);
  }

  const now = Date.now();
  const notifications: AppNotification[] = [];

  for (const daysRemaining of daysToSchedule) {
    // Construct trigger date: next_date minus daysRemaining at notify_time
    const triggerDate = new Date(year, month - 1, day - daysRemaining, hour || 9, minute || 0, 0, 0);

    // Only schedule triggers in the future
    if (triggerDate.getTime() > now) {
      const copy = NotificationTemplates.recurringReminder({
        name,
        amountFormatted,
        daysRemaining,
        isIncome,
      });

      notifications.push({
        id: getRecurringNotificationId(item.id, daysRemaining),
        title: copy.title,
        body: copy.body,
        scheduleAt: triggerDate,
        channelId: NOTIFICATION_CHANNELS.REMINDERS,
        extra: {
          type: "recurring",
          recurringId: item.id,
          screen: "recurring",
        },
      });
    }
  }

  if (notifications.length > 0) {
    await scheduleNotificationBatch(notifications);
  }
}

/**
 * Cancel all possible notification triggers scheduled for a recurring item.
 */
export async function cancelRecurringReminder(recurringId: string): Promise<void> {
  const ids: number[] = [];
  // Cancel all possible day offset slots (0 to 31 days)
  for (let d = 0; d <= 31; d++) {
    ids.push(getRecurringNotificationId(recurringId, d));
  }
  await cancelNotificationBatch(ids);
}

/**
 * Synchronize all recurring reminders across the entire database.
 * Used when master notifications toggle in Settings is enabled or when app launches.
 */
export async function syncAllRecurringReminders(): Promise<void> {
  const settings = await loadSettings();

  const allRecurring = await db.recurring_transactions.toArray();
  const allCategories = await db.categories.toArray();
  const categoryMap = new Map(allCategories.map((c) => [c.id, c.name]));

  // Cancel all existing recurring notifications first
  for (const item of allRecurring) {
    await cancelRecurringReminder(item.id);
  }

  if (!settings.notificationsEnabled) {
    return;
  }

  // Reschedule for all active items with notifications enabled
  for (const item of allRecurring) {
    if (item.is_active && item.notifications_enabled) {
      const catName = item.category_id ? categoryMap.get(item.category_id) : undefined;
      await scheduleRecurringReminder(item, catName);
    }
  }
}
