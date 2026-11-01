import { useState, useEffect, useCallback, useRef } from "react";
import { Home, ArrowLeftRight, PiggyBank, FileBarChart, Repeat, Download, Plus } from "lucide-react";
import type { AppSettings } from "@/types";
import { loadSettings, updateSettings } from "@/lib/settings";
import { initNotifications, onNotificationAction, onInAppNotification, type AppNotification } from "@/lib/notifications";
import { syncAllRecurringReminders } from "@/lib/recurringReminders";
import { syncDailyNudge } from "@/lib/dailyNudge";
import { handleOAuthCallback, uploadBackupToGoogleDrive, requestGoogleAccessToken, findDriveBackupFile } from "@/lib/googleDrive";
import { NotificationToast } from "@/components/NotificationToast";
import { SidePanel } from "@/components/SidePanel";
import { Dashboard } from "@/screens/Dashboard";
import { Transactions } from "@/screens/Transactions";
import { Budgets } from "@/screens/Budgets";
import { Reports } from "@/screens/Reports";
import { Recurring } from "@/screens/Recurring";
import { ImportExport } from "@/screens/ImportExport";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { AddTransaction } from "@/screens/AddTransaction";
import { AddWithAI } from "@/screens/AddWithAI";
import { AddRecurring } from "@/screens/AddRecurring";
import { AppLock } from "@/screens/AppLock";

export type ScreenName =
  | "dashboard"
  | "transactions"
  | "budgets"
  | "reports"
  | "recurring"
  | "import-export"
  | "settings"
  | "add-transaction"
  | "add-ai"
  | "add-recurring";

interface NavItem {
  name: ScreenName;
  label: string;
  icon: typeof Home;
}

const LEFT_NAV_ITEMS: NavItem[] = [
  { name: "dashboard", label: "Home", icon: Home },
  { name: "transactions", label: "Activity", icon: ArrowLeftRight },
  { name: "budgets", label: "Budgets", icon: PiggyBank },
];

const RIGHT_NAV_ITEMS: NavItem[] = [
  { name: "reports", label: "Reports", icon: FileBarChart },
  { name: "recurring", label: "Recurring", icon: Repeat },
  { name: "import-export", label: "Data", icon: Download },
];

export default function App() {
  const [screen, setScreen] = useState<ScreenName>("dashboard");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [editRecurringId, setEditRecurringId] = useState<string | null>(null);
  const [targetRecurringId, setTargetRecurringId] = useState<string | null>(null);
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);
  const [locked, setLocked] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    loadSettings().then(async (s) => {
      if (!isMounted) return;
      setSettings(s);
      if (s.appLockEnabled && s.appLockPin) {
        setLocked(true);
      }
      if (s.notificationsEnabled) {
        syncAllRecurringReminders();
        if (s.dailyNudgeEnabled) {
          syncDailyNudge();
        }
      }

      // Auto-sync on app launch if enabled
      if (s.googleSync?.enabled && s.googleSync?.autoSync && navigator.onLine) {
        try {
          const auth = await requestGoogleAccessToken(s.googleSync.clientId);
          await uploadBackupToGoogleDrive(auth.accessToken);
          const nowStr = new Date().toLocaleString();
          const updated = await updateSettings({
            googleSync: { ...s.googleSync, lastSyncedAt: nowStr },
          });
          if (isMounted) {
            setSettings(updated);
          }
        } catch {
          // Silent background sync failure
        }
      }
    });

    // Handle deep-linking query parameters (OAuth callback or Notification navigation)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const targetScreen = params.get("screen") as ScreenName | null;
      const recurringId = params.get("recurringId");
      const oauthCode = params.get("code");

      if (oauthCode) {
        handleOAuthCallback(oauthCode)
          .then(async ({ accessToken, email }) => {
            const current = await loadSettings();
            const existingCloud = await findDriveBackupFile(accessToken);
            const cloudTimestamp = existingCloud
              ? new Date(existingCloud.modifiedTime).toLocaleString()
              : null;

            const updatedSync = {
              ...(current.googleSync || { autoSync: false, lastSyncedAt: null, clientId: "" }),
              enabled: true,
              userEmail: email || current.googleSync?.userEmail || "Connected User",
              lastSyncedAt: cloudTimestamp || current.googleSync?.lastSyncedAt || null,
            };
            const updated = await updateSettings({ googleSync: updatedSync });
            setSettings(updated);

            if (existingCloud) {
              setActiveToast({
                id: Date.now(),
                title: "Existing Cloud Backup Found",
                body: `Found backup from ${cloudTimestamp}. Go to Settings > Google Backup to restore.`,
              });
            } else {
              // Initial backup snapshot only if NO existing backup was found on Drive
              try {
                const res = await uploadBackupToGoogleDrive(accessToken);
                const nowStr = new Date(res.modifiedTime).toLocaleString();
                const latest = await updateSettings({
                  googleSync: { ...updatedSync, lastSyncedAt: nowStr },
                });
                setSettings(latest);
                setActiveToast({
                  id: Date.now(),
                  title: "Google Drive Connected",
                  body: `Initial backup created (${nowStr}).`,
                });
              } catch {
                setActiveToast({
                  id: Date.now(),
                  title: "Google Drive Connected",
                  body: `Connected as ${email || "Google Account"}!`,
                });
              }
            }
          })
          .catch((err) => {
            console.error("OAuth callback error:", err);
          });
      }

      if (targetScreen) {
        setScreen(targetScreen);
        if (recurringId) setTargetRecurringId(recurringId);
      }

      if (targetScreen || oauthCode) {
        window.history.replaceState({ screen: targetScreen || "dashboard" }, document.title, window.location.pathname);
      }
    }

    // Initialize root history state if unset
    if (typeof window !== "undefined" && (!window.history.state || !window.history.state.screen)) {
      window.history.replaceState({ screen: "dashboard" }, "");
    }

    initNotifications();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncAllRecurringReminders();
        syncDailyNudge();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const sidePanelOpenRef = useRef(sidePanelOpen);
  useEffect(() => {
    sidePanelOpenRef.current = sidePanelOpen;
  }, [sidePanelOpen]);

  const navigate = useCallback((s: ScreenName, replace = false) => {
    setSidePanelOpen(false);
    setScreen((current) => {
      if (current === s) return current;
      if (typeof window !== "undefined") {
        if (replace) {
          window.history.replaceState({ screen: s }, "");
        } else {
          window.history.pushState({ screen: s }, "");
        }
      }
      return s;
    });
    if (s !== "add-transaction") setEditTransactionId(null);
    if (s !== "add-recurring") setEditRecurringId(null);
    if (s !== "recurring") setTargetRecurringId(null);
  }, []);

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigate("dashboard");
    }
  }, [navigate]);

  const handleOpenSidePanel = useCallback(() => {
    setSidePanelOpen(true);
    if (typeof window !== "undefined") {
      window.history.pushState({ sidePanel: true, screen }, "");
    }
  }, [screen]);

  const handleCloseSidePanel = useCallback(() => {
    setSidePanelOpen(false);
  }, []);

  // Listen for browser/Android back gestures (swiping back)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = (e: PopStateEvent) => {
      if (sidePanelOpenRef.current) {
        setSidePanelOpen(false);
        if (e.state?.screen) {
          setScreen(e.state.screen);
        }
        return;
      }

      const targetScreen = (e.state?.screen as ScreenName) || "dashboard";
      setScreen(targetScreen);
      if (targetScreen !== "add-transaction") setEditTransactionId(null);
      if (targetScreen !== "add-recurring") setEditRecurringId(null);
      if (targetScreen !== "recurring") setTargetRecurringId(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onNotificationAction((payload) => {
      if (payload.extra?.screen) {
        if (payload.extra.recurringId) {
          setTargetRecurringId(payload.extra.recurringId);
        }
        navigate(payload.extra.screen as ScreenName);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const unsubscribe = onInAppNotification((notif) => {
      setActiveToast(notif);
    });
    return () => unsubscribe();
  }, []);

  const handleToastAction = useCallback((notif: AppNotification) => {
    setActiveToast(null);
    if (notif.extra?.screen) {
      if (notif.extra.recurringId) {
        setTargetRecurringId(notif.extra.recurringId);
      }
      navigate(notif.extra.screen as ScreenName);
    }
  }, [navigate]);

  const handleEditTransaction = useCallback((id: string) => {
    setEditTransactionId(id);
    navigate("add-transaction");
  }, [navigate]);

  const handleOpenAddRecurring = useCallback(() => {
    setEditRecurringId(null);
    navigate("add-recurring");
  }, [navigate]);

  const handleOpenEditRecurring = useCallback((id: string) => {
    setEditRecurringId(id);
    navigate("add-recurring");
  }, [navigate]);

  const handleSettingsChange = useCallback((s: AppSettings) => {
    setSettings(s);
  }, []);

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (locked && settings.appLockEnabled) {
    return <AppLock settings={settings} onUnlock={() => setLocked(false)} />;
  }

  const isFormScreen = screen === "add-transaction" || screen === "add-ai" || screen === "add-recurring";

  return (
    <div className="h-[100dvh] w-full bg-gray-100 flex justify-center overflow-hidden">
      <div className="w-full max-w-md flex flex-col h-full bg-gray-50 relative shadow-xl overflow-hidden">
        <SidePanel
          isOpen={sidePanelOpen}
          onClose={handleCloseSidePanel}
          onNavigate={navigate}
          currentScreen={screen}
          settings={settings}
        />

        <NotificationToast
          notification={activeToast}
          onClose={() => setActiveToast(null)}
          onAction={handleToastAction}
        />

        <main className="flex-1 overflow-y-auto">
          {screen === "dashboard" && (
            <Dashboard
              settings={settings}
              onNavigate={navigate}
              onEditTransaction={handleEditTransaction}
              onOpenSidePanel={handleOpenSidePanel}
            />
          )}
          {screen === "transactions" && <Transactions settings={settings} onEditTransaction={handleEditTransaction} onNavigate={navigate} />}
          {screen === "budgets" && <Budgets settings={settings} />}
          {screen === "reports" && <Reports settings={settings} />}
          {screen === "recurring" && (
            <Recurring
              settings={settings}
              targetRecurringId={targetRecurringId}
              onOpenAdd={handleOpenAddRecurring}
              onOpenEdit={handleOpenEditRecurring}
            />
          )}
          {screen === "import-export" && <ImportExport settings={settings} />}
          {screen === "settings" && <SettingsScreen settings={settings} onSettingsChange={handleSettingsChange} />}
          {screen === "add-transaction" && (
            <AddTransaction
              settings={settings}
              editId={editTransactionId}
              onDone={() => navigate("transactions")}
              onCancel={goBack}
            />
          )}
          {screen === "add-ai" && (
            <AddWithAI settings={settings} onDone={() => navigate("transactions")} onCancel={goBack} />
          )}
          {screen === "add-recurring" && (
            <AddRecurring
              settings={settings}
              editId={editRecurringId}
              onDone={() => navigate("recurring")}
              onCancel={goBack}
            />
          )}
        </main>

        {!isFormScreen && (
          <BottomNav current={screen} onNavigate={navigate} />
        )}
      </div>
    </div>
  );
}

function BottomNav({ current, onNavigate }: { current: ScreenName; onNavigate: (s: ScreenName) => void }) {
  const renderNavGroup = (items: NavItem[]) => (
    <div className="flex items-center justify-around flex-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = current === item.name;
        return (
          <button
            key={item.name}
            onClick={() => onNavigate(item.name)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-1 rounded-xl transition-all min-w-[42px] ${
              active ? "text-gray-900 font-semibold" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Icon size={19} strokeWidth={active ? 2.5 : 1.8} />
            <span className="text-[10px] leading-tight tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <nav className="h-16 bg-white border-t border-gray-200 px-1 flex items-center justify-between z-20 w-full flex-shrink-0 relative">
      {/* Left items: Home, Activity, Budgets */}
      {renderNavGroup(LEFT_NAV_ITEMS)}

      {/* Center + Button */}
      <div className="flex items-center justify-center px-1 flex-shrink-0 -mt-5">
        <button
          onClick={() => onNavigate("add-transaction")}
          className="w-14 h-14 p-3.5 bg-gray-900 text-white rounded-full shadow-lg shadow-gray-900/25 border-4 border-gray-50 flex items-center justify-center active:scale-90 transition-all hover:bg-black focus:outline-none"
          aria-label="Add transaction"
          title="Add Transaction"
        >
          <Plus size={22} strokeWidth={2.6} />
        </button>
      </div>

      {/* Right items: Reports, Recurring, Data */}
      {renderNavGroup(RIGHT_NAV_ITEMS)}
    </nav>
  );
}
