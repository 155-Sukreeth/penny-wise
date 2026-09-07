import { useState, useEffect, useCallback } from "react";
import { Home, ArrowLeftRight, PiggyBank, FileBarChart, Repeat, Download, Settings as SettingsIcon, Plus } from "lucide-react";
import type { AppSettings } from "@/types";
import { loadSettings } from "@/lib/settings";
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
  }, []);

  const navigate = useCallback((s: ScreenName) => {
    setScreen(s);
    if (s !== "add-transaction") setEditTransactionId(null);
  }, []);

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
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-md flex flex-col min-h-screen relative bg-gray-50">
        <div className="flex-1 overflow-y-auto pb-24">
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
              onCancel={() => navigate(screen === "add-transaction" ? "dashboard" : "dashboard")}
            />
          )}
          {screen === "add-ai" && (
            <AddWithAI settings={settings} onDone={() => navigate("transactions")} onCancel={() => navigate("dashboard")} />
          )}
        </div>

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
        className="absolute bottom-20 right-4 w-14 h-14 bg-gray-900 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform z-20"
        aria-label="Add transaction"
      >
        <Plus size={24} />
      </button>
      <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-1.5 flex items-center justify-around z-10 max-w-md mx-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = current === item.name;
          return (
            <button
              key={item.name}
              onClick={() => onNavigate(item.name)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[44px] ${
                active ? "text-gray-900" : "text-gray-400"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[9px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
