import { useState, useEffect, useCallback } from "react";
import { Home, ArrowLeftRight, PiggyBank, FileBarChart, Repeat, Download, Settings as SettingsIcon, Plus } from "lucide-react";
import type { AppSettings } from "@/types";
import { loadSettings } from "@/lib/settings";
import { initNotifications, onNotificationAction } from "@/lib/notifications";
import { Dashboard } from "@/screens/Dashboard";
import { Transactions } from "@/screens/Transactions";
import { Budgets } from "@/screens/Budgets";
import { Reports } from "@/screens/Reports";
import { Recurring } from "@/screens/Recurring";
import { ImportExport } from "@/screens/ImportExport";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { AddTransaction } from "@/screens/AddTransaction";
import { AddWithAI } from "@/screens/AddWithAI";
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
  | "add-ai";

interface NavItem {
  name: ScreenName;
  label: string;
  icon: typeof Home;
}

const NAV_ITEMS: NavItem[] = [
  { name: "dashboard", label: "Home", icon: Home },
  { name: "transactions", label: "Activity", icon: ArrowLeftRight },
  { name: "budgets", label: "Budgets", icon: PiggyBank },
  { name: "reports", label: "Reports", icon: FileBarChart },
  { name: "recurring", label: "Recurring", icon: Repeat },
  { name: "import-export", label: "Data", icon: Download },
  { name: "settings", label: "Settings", icon: SettingsIcon },
];

export default function App() {
  const [screen, setScreen] = useState<ScreenName>("dashboard");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      if (s.appLockEnabled && s.appLockPin) {
        setLocked(true);
      }
    });

    initNotifications();
  }, []);

  const navigate = useCallback((s: ScreenName) => {
    setScreen(s);
    if (s !== "add-transaction") setEditTransactionId(null);
  }, []);

  useEffect(() => {
    const unsubscribe = onNotificationAction((payload) => {
      if (payload.extra?.screen) {
        navigate(payload.extra.screen as ScreenName);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleEditTransaction = useCallback((id: string) => {
    setEditTransactionId(id);
    setScreen("add-transaction");
  }, []);

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

  const isFormScreen = screen === "add-transaction" || screen === "add-ai";

  return (
    <div className="h-[100dvh] w-full bg-gray-100 flex justify-center overflow-hidden">
      <div className="w-full max-w-md flex flex-col h-full bg-gray-50 relative shadow-xl overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {screen === "dashboard" && <Dashboard settings={settings} onNavigate={navigate} onEditTransaction={handleEditTransaction} />}
          {screen === "transactions" && <Transactions settings={settings} onEditTransaction={handleEditTransaction} onNavigate={navigate} />}
          {screen === "budgets" && <Budgets settings={settings} />}
          {screen === "reports" && <Reports settings={settings} />}
          {screen === "recurring" && <Recurring settings={settings} />}
          {screen === "import-export" && <ImportExport settings={settings} />}
          {screen === "settings" && <SettingsScreen settings={settings} onSettingsChange={handleSettingsChange} />}
          {screen === "add-transaction" && (
            <AddTransaction
              settings={settings}
              editId={editTransactionId}
              onDone={() => navigate("transactions")}
              onCancel={() => navigate("dashboard")}
            />
          )}
          {screen === "add-ai" && (
            <AddWithAI settings={settings} onDone={() => navigate("transactions")} onCancel={() => navigate("dashboard")} />
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
  return (
    <>
      <button
        onClick={() => onNavigate("add-transaction")}
        className="absolute bottom-16 right-4 w-13 h-13 p-3.5 bg-gray-900 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-95 transition-transform z-30"
        aria-label="Add transaction"
      >
        <Plus size={24} />
      </button>
      <nav className="h-16 bg-white border-t border-gray-200 px-1 flex items-center justify-around z-20 w-full flex-shrink-0">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = current === item.name;
          return (
            <button
              key={item.name}
              onClick={() => onNavigate(item.name)}
              className={`flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-lg transition-colors min-w-[42px] ${
                active ? "text-gray-900 font-semibold" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] leading-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
