import { loadSettings } from "@/lib/settings";
import { fetchTransactions } from "@/lib/data";
import { getTodayString } from "@/lib/format";
import {
  scheduleNotification,
  cancelNotification,
  checkNotificationPermissions,
  NOTIFICATION_CHANNELS,
} from "@/lib/notifications";
import { NotificationTemplates } from "@/lib/notificationMessages";

export const DAILY_NUDGE_NOTIFICATION_ID = 999001;

/**
 * Reconciles the scheduled daily inactive reminder with the user's current activity.
 *
 * Pattern (Option A - Pre-Arm & Cancel with Daily Repeat):
 * 1. If disabled or permissions not granted, cancels any pending nudge.
 * 2. If the user has already logged >= 1 transaction today, cancels today's alert and queues tomorrow's.
 * 3. If zero transactions logged today and alert time has not yet passed, arms today's alert.
 * 4. Configured with native `every: 'day'` so it continues ringing on subsequent inactive days.
 */
export async function syncDailyNudge(): Promise<void> {
  const settings = await loadSettings();

  if (!settings.notificationsEnabled || !settings.dailyNudgeEnabled) {
    await cancelNotification(DAILY_NUDGE_NOTIFICATION_ID);
    return;
  }

  const perm = await checkNotificationPermissions();
  if (perm !== "granted") {
    return;
  }

  const todayStr = getTodayString();
  const [y, m, d] = todayStr.split("-").map(Number);
  const [hourStr, minStr] = (settings.dailyNudgeTime || "21:00").split(":");
  const hour = isNaN(Number(hourStr)) ? 21 : Number(hourStr);
  const minute = isNaN(Number(minStr)) ? 0 : Number(minStr);

  const now = new Date();
  const todayTrigger = new Date(y, m - 1, d, hour, minute, 0, 0);

  // Check if user has recorded any transactions today
  const txsToday = await fetchTransactions({
    startDate: todayStr,
    endDate: todayStr,
    limit: 1,
  });

  let targetDate: Date;

  if (txsToday.length > 0) {
    // User was already active today! Cancel today's alert and target tomorrow
    targetDate = new Date(y, m - 1, d + 1, hour, minute, 0, 0);
  } else {
    // Zero transactions logged today
    if (todayTrigger.getTime() > now.getTime()) {
      // It's still before the alert time today
      targetDate = todayTrigger;
    } else {
      // Alert time today has already passed; queue for tomorrow
      targetDate = new Date(y, m - 1, d + 1, hour, minute, 0, 0);
    }
  }

  // Cancel any existing alarm first
  await cancelNotification(DAILY_NUDGE_NOTIFICATION_ID);

  const copy = NotificationTemplates.dailyInactiveNudge();

  await scheduleNotification({
    id: DAILY_NUDGE_NOTIFICATION_ID,
    title: copy.title,
    body: copy.body,
    scheduleAt: targetDate,
    channelId: NOTIFICATION_CHANNELS.REMINDERS,
    every: "day",
    extra: {
      type: "daily_nudge",
      screen: "add-transaction",
    },
  });
}

/**
 * Explicitly cancels any scheduled daily inactive reminder.
 */
export async function cancelDailyNudge(): Promise<void> {
  await cancelNotification(DAILY_NUDGE_NOTIFICATION_ID);
}
