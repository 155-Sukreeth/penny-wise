import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  scheduleAt?: Date;
  channelId?: string;
  extra?: Record<string, any>;
  sound?: string;
  actionTypeId?: string;
}

export interface NotificationActionPayload {
  notificationId: number;
  extra?: Record<string, any>;
  actionId?: string;
}

export type NotificationPermissionState = "granted" | "denied" | "prompt";

// Generic channel IDs (brand-agnostic)
export const NOTIFICATION_CHANNELS = {
  REMINDERS: "app_reminders",
  GENERAL: "app_general",
} as const;

type ActionListener = (payload: NotificationActionPayload) => void;
const actionListeners = new Set<ActionListener>();
let isInitialized = false;

export type InAppNotificationListener = (notification: AppNotification) => void;
const inAppListeners = new Set<InAppNotificationListener>();
const webTimers = new Map<number, any>();

/**
 * Register a listener that fires whenever an in-app notification is triggered.
 * Allows showing floating in-app toasts/banners.
 */
export function onInAppNotification(listener: InAppNotificationListener): () => void {
  inAppListeners.add(listener);
  return () => {
    inAppListeners.delete(listener);
  };
}

export function dispatchInAppNotification(notification: AppNotification) {
  for (const listener of inAppListeners) {
    try {
      listener(notification);
    } catch (err) {
      console.error("Error in in-app notification listener:", err);
    }
  }
}

/**
 * Deterministic string to 31-bit positive integer hash.
 * Useful for mapping UUIDs or string keys to numeric notification IDs required by native Android/iOS.
 */
export function hashStringToId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

/**
 * Register a listener that fires whenever a user taps on a notification.
 * Returns an unsubscribe callback.
 */
export function onNotificationAction(listener: ActionListener): () => void {
  actionListeners.add(listener);
  return () => {
    actionListeners.delete(listener);
  };
}

export function dispatchNotificationAction(payload: NotificationActionPayload) {
  for (const listener of actionListeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error("Error in notification action listener:", err);
    }
  }
}


/**
 * Initialize notification channels and native listeners.
 * Safe to call multiple times; will only initialize once.
 */
export async function initNotifications(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Create native notification channels for Android 8.0+
      await LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNELS.REMINDERS,
        name: "Reminders & Alerts",
        description: "Notifications for scheduled recurring reminders and due bills",
        importance: 4, // High importance (heads-up notification and sound)
        visibility: 1, // Public visibility
        sound: "res://raw/notification.wav",
        vibration: true,
      }).catch(() => {
        // Fallback channel without custom sound if resource not found
        return LocalNotifications.createChannel({
          id: NOTIFICATION_CHANNELS.REMINDERS,
          name: "Reminders & Alerts",
          description: "Notifications for scheduled recurring reminders and due bills",
          importance: 4,
          visibility: 1,
          vibration: true,
        });
      });

      await LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNELS.GENERAL,
        name: "General",
        description: "General app notifications and updates",
        importance: 3, // Default importance
        visibility: 1,
        vibration: true,
      });

      // 2. Listen for native notification clicks/taps
      await LocalNotifications.addListener(
        "localNotificationActionPerformed",
        (action) => {
          const notificationId = action.notification.id;
          const extra = action.notification.extra;
          const actionId = action.actionId;

          dispatchNotificationAction({
            notificationId,
            extra,
            actionId,
          });
        }
      );
    } catch (err) {
      console.error("Failed to initialize native notifications:", err);
    }
  } else {
    // Web / PWA: Listen for Service Worker notification messages
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "NOTIFICATION_CLICK") {
          dispatchNotificationAction({
            notificationId: event.data.id || 0,
            extra: event.data.extra,
            actionId: event.data.actionId,
          });
        }
      });
    }
  }
}

/**
 * Query current notification permission status.
 */
export async function checkNotificationPermissions(): Promise<NotificationPermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === "granted") return "granted";
      if (status.display === "denied") return "denied";
      return "prompt";
    } catch (err) {
      console.error("Failed to check native notification permissions:", err);
      return "prompt";
    }
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return "prompt";
  }

  return "denied";
}

/**
 * Request notification permission from the operating system or browser.
 */
export async function requestNotificationPermissions(): Promise<NotificationPermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.requestPermissions();
      if (status.display === "granted") return "granted";
      if (status.display === "denied") return "denied";
      return "prompt";
    } catch (err) {
      console.error("Failed to request native notification permissions:", err);
      return "prompt";
    }
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") return "granted";
      if (result === "denied") return "denied";
      return "prompt";
    } catch (err) {
      console.error("Failed to request web notification permissions:", err);
      return "prompt";
    }
  }

  return "denied";
}

/**
 * Schedule a single notification.
 * If scheduleAt is omitted or in the past, it will trigger immediately.
 */
export async function scheduleNotification(notification: AppNotification): Promise<void> {
  await scheduleNotificationBatch([notification]);
}

/**
 * Schedule multiple notifications in a single batch operation.
 */
export async function scheduleNotificationBatch(notifications: AppNotification[]): Promise<void> {
  if (notifications.length === 0) return;

  if (Capacitor.isNativePlatform()) {
    const formatted = notifications.map((n) => {
      const channelId = n.channelId || NOTIFICATION_CHANNELS.REMINDERS;
      const isScheduled = n.scheduleAt && n.scheduleAt.getTime() > Date.now();

      return {
        id: n.id,
        title: n.title,
        body: n.body,
        channelId,
        extra: n.extra || {},
        schedule: isScheduled
          ? {
              at: n.scheduleAt,
              allowWhileIdle: true,
            }
          : undefined,
        actionTypeId: n.actionTypeId,
      };
    });

    try {
      await LocalNotifications.schedule({ notifications: formatted });
    } catch (err) {
      console.error("Failed to schedule native notifications:", err);
    }
    return;
  }

  // Web / PWA fallback
  for (const n of notifications) {
    if (webTimers.has(n.id)) {
      clearTimeout(webTimers.get(n.id));
      webTimers.delete(n.id);
    }

    const delayMs = n.scheduleAt ? n.scheduleAt.getTime() - Date.now() : 0;

    const fireWeb = async () => {
      // 1. Always dispatch in-app notification for foreground user feedback
      dispatchInAppNotification(n);

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch (_) {}
      }

      // 2. If browser system notification permission is granted, display desktop/system notification
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        // Try ServiceWorker first if available (works on PWAs and Chromium)
        if ("serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
              await reg.showNotification(n.title, {
                body: n.body,
                icon: "/icon-192.png",
                badge: "/favicon.png",
                data: {
                  id: n.id,
                  extra: n.extra,
                },
              });
              return;
            }
          } catch (swErr) {
            console.warn("ServiceWorker showNotification failed, trying Notification constructor:", swErr);
          }
        }

        // Direct Notification constructor fallback
        try {
          const notif = new Notification(n.title, {
            body: n.body,
            data: n.extra,
            icon: "/icon-192.png",
            badge: "/favicon.png",
          });

          notif.onclick = () => {
            window.focus();
            dispatchNotificationAction({
              notificationId: n.id,
              extra: n.extra,
            });
            notif.close();
          };
        } catch (e) {
          console.error("Direct Notification constructor failed:", e);
        }
      }
    };

    if (delayMs <= 0) {
      fireWeb();
    } else {
      const timerId = setTimeout(() => {
        webTimers.delete(n.id);
        fireWeb();
      }, delayMs);
      webTimers.set(n.id, timerId);
    }
  }
}

/**
 * Cancel a notification by its numeric ID.
 */
export async function cancelNotification(id: number): Promise<void> {
  await cancelNotificationBatch([id]);
}

/**
 * Cancel multiple notifications by their numeric IDs.
 */
export async function cancelNotificationBatch(ids: number[]): Promise<void> {
  if (ids.length === 0) return;

  // Clear web timers
  for (const id of ids) {
    if (webTimers.has(id)) {
      clearTimeout(webTimers.get(id));
      webTimers.delete(id);
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({
        notifications: ids.map((id) => ({ id })),
      });
    } catch (err) {
      console.error("Failed to cancel native notifications:", err);
    }
  }
}

/**
 * Cancel all scheduled pending notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  for (const timerId of webTimers.values()) {
    clearTimeout(timerId);
  }
  webTimers.clear();

  if (Capacitor.isNativePlatform()) {
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({
          notifications: pending.notifications.map((n) => ({ id: n.id })),
        });
      }
    } catch (err) {
      console.error("Failed to cancel all notifications:", err);
    }
  }
}

/**
 * Get list of all currently scheduled/pending notifications.
 */
export async function getPendingNotifications(): Promise<{ id: number; title: string; extra?: any }[]> {
  if (Capacitor.isNativePlatform()) {
    try {
      const pending = await LocalNotifications.getPending();
      return pending.notifications.map((n) => ({
        id: n.id,
        title: n.title,
        extra: n.extra,
      }));
    } catch (err) {
      console.error("Failed to get pending native notifications:", err);
      return [];
    }
  }

  return [];
}
