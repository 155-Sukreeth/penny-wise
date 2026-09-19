export interface RecurringReminderCopyParams {
  name: string;
  amountFormatted: string;
  daysRemaining: number; // 0 = today, 1 = tomorrow, 2+ = in N days
  isIncome: boolean;
}

export const NotificationTemplates = {
  /**
   * Recurring bill & income reminders (advance and due date)
   */
  recurringReminder: ({ name, amountFormatted, daysRemaining, isIncome }: RecurringReminderCopyParams) => {
    const heading = isIncome ? "Expected Income" : "Bill Due";
    const timing =
      daysRemaining === 0
        ? "today"
        : daysRemaining === 1
        ? "tomorrow"
        : `in ${daysRemaining} days`;

    return {
      title: `${heading}: ${name} (${amountFormatted})`,
      body: isIncome
        ? `Expected incoming payment of ${amountFormatted} ${timing}.`
        : `Payment of ${amountFormatted} is due ${timing}. Tap to log.`,
    };
  },

  /**
   * Overdue reminders (for overdue alert feature)
   */
  overdueReminder: (name: string, amountFormatted: string, daysOverdue: number) => {
    const timing = daysOverdue === 1 ? "was due yesterday" : `is ${daysOverdue} days overdue`;
    return {
      title: `⚠️ Overdue: ${name} (${amountFormatted})`,
      body: `Payment of ${amountFormatted} ${timing}. Tap to log or skip.`,
    };
  },

  /**
   * System test notification
   */
  testNotification: () => ({
    title: "Test Notification",
    body: "Notifications are working properly!",
  }),
};
