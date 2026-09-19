import { db } from "@/lib/db";
import { loadSettings, saveSettings } from "@/lib/settings";
import { formatCurrency } from "@/lib/format";
import {
  scheduleNotificationBatch,
  cancelNotificationBatch,
  checkNotificationPermissions,
  hashStringToId,
  NOTIFICATION_CHANNELS,
  type AppNotification,
} from "@/lib/notifications";
import { NotificationTemplates } from "@/lib/notificationMessages";
import { TransactionType, RecurringFrequency, type RecurringTransaction } from "@/types";

/**
 * Get the interval in days for a given recurring frequency.
 */
export function getFrequencyIntervalDays(
  frequency: RecurringFrequency | string,
  customDays?: number | null
): number {
  switch (frequency) {
    case "daily":
    case RecurringFrequency.Daily:
      return 1;
    case "weekly":
    case RecurringFrequency.Weekly:
      return 7;
    case "monthly":
    case RecurringFrequency.Monthly:
      return 28; // safe minimum for days in a month
    case "yearly":
    case RecurringFrequency.Yearly:
      return 365;
    case "custom":
    case RecurringFrequency.Custom:
      return Math.max(1, customDays || 1);
    default:
      return 7;
  }
}

/**
 * Generate deterministic notification ID for a recurring transaction and day offset.
 * Supports positive advance notice offsets (0..31) and negative overdue offsets (-1..-7).
 * Kept within positive 31-bit integer bounds for native Android AlarmManager compatibility.
 */
export function getRecurringNotificationId(recurringId: string, daysRemaining: number): number {
  const baseHash = hashStringToId(recurringId);
  // Shift by 32 to guarantee a positive modulo index for negative day offsets
  const offset = ((daysRemaining + 32) % 64);
  return (baseHash * 64 + offset) % 2147483647 || 1;
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
    // If notification permission is already granted, automatically enable settings
    const perm = await checkNotificationPermissions();
    if (perm === "granted") {
      await saveSettings({ ...settings, notificationsEnabled: true });
    } else {
      return;
    }
  }

  const [year, month, day] = item.next_date.split("-").map(Number);
  const [hourStr, minStr] = (item.notify_time || "09:00").split(":");
  const hour = isNaN(Number(hourStr)) ? 9 : Number(hourStr);
  const minute = isNaN(Number(minStr)) ? 0 : Number(minStr);

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

  // 1. Schedule advance notice and due date triggers
  for (const daysRemaining of daysToSchedule) {
    // Construct trigger date: next_date minus daysRemaining at notify_time
    const triggerDate = new Date(year, month - 1, day - daysRemaining, hour, minute, 0, 0);

    // Only schedule triggers strictly in the future
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

  // 2. Schedule overdue reminders if enabled in settings
  // Approach B: strictly cap overdue triggers to (frequencyInterval - 1) so daily items (interval=1)
  // have maxOverdueDays=0 and never collide with the next cycle's reminder!
  if (settings.overdueRemindersEnabled) {
    const intervalDays = getFrequencyIntervalDays(item.frequency, item.custom_days);
    const maxOverdueDays = Math.min(settings.overdueDaysLimit || 2, Math.max(0, intervalDays - 1));

    if (maxOverdueDays > 0) {
      const [overdueHourStr, overdueMinStr] = (settings.overdueNotifyTime || "10:00").split(":");
      const overdueHour = isNaN(Number(overdueHourStr)) ? 10 : Number(overdueHourStr);
      const overdueMinute = isNaN(Number(overdueMinStr)) ? 0 : Number(overdueMinStr);

      for (let d = 1; d <= maxOverdueDays; d++) {
        // Trigger date: next_date plus d days at overdueNotifyTime
        const overdueTrigger = new Date(year, month - 1, day + d, overdueHour, overdueMinute, 0, 0);

        if (overdueTrigger.getTime() > now) {
          const copy = NotificationTemplates.overdueReminder(name, amountFormatted, d);

          notifications.push({
            id: getRecurringNotificationId(item.id, -d),
            title: copy.title,
            body: copy.body,
            scheduleAt: overdueTrigger,
            channelId: NOTIFICATION_CHANNELS.REMINDERS,
            extra: {
              type: "recurring",
              recurringId: item.id,
              screen: "recurring",
            },
          });
        }
      }
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
  // Cancel all possible slots: overdue slots (-7..-1) and advance/due slots (0..31)
  for (let d = -7; d <= 31; d++) {
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
    const perm = await checkNotificationPermissions();
    if (perm === "granted") {
      await saveSettings({ ...settings, notificationsEnabled: true });
    } else {
      return;
    }
  }

  // Reschedule for all active items with notifications enabled
  for (const item of allRecurring) {
    if (item.is_active && item.notifications_enabled) {
      const catName = item.category_id ? categoryMap.get(item.category_id) : undefined;
      await scheduleRecurringReminder(item, catName);
    }
  }
}

