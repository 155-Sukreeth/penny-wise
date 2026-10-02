import { X, Download, Settings as SettingsIcon, Shield, Sparkles, ChevronRight, Lock, Bell, Palette, Globe, Tag, CreditCard } from "lucide-react";
import type { ScreenName } from "@/App";
import type { AppSettings } from "@/types";

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (s: ScreenName) => void;
  currentScreen: ScreenName;
  settings: AppSettings;
}

export function SidePanel({ isOpen, onClose, onNavigate, currentScreen, settings }: SidePanelProps) {
  if (!isOpen) return null;

  const handleNav = (screen: ScreenName) => {
    onNavigate(screen);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex">
      {/* Backdrop with standard PennyWise modal overlay */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="relative w-[82%] max-w-[320px] bg-gray-50 h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-left duration-250 ease-out border-r border-gray-200">
        {/* Header matching PennyWise screen headers */}
        <div className="px-4 pt-6 pb-4 bg-white border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="PennyWise"
              className="w-10 h-10 rounded-full border border-gray-100 shadow-sm"
            />
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight leading-none">PennyWise</h2>
              <p className="text-xs text-gray-500 mt-1">Finance & Budget</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 active:scale-95 transition-all"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content list styled identically to SettingsScreen and app cards */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
              Management
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => handleNav("import-export")}
                className={`w-full flex items-center gap-3 p-3.5 bg-white rounded-xl border text-left active:scale-[0.98] transition-transform ${
                  currentScreen === "import-export"
                    ? "border-gray-900 ring-1 ring-gray-900"
                    : "border-gray-100"
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-700">
                  <Download size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900">Data Management</h4>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">Export, import, backup & restore</p>
                </div>
                <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
              </button>

              <button
                onClick={() => handleNav("settings")}
                className={`w-full flex items-center gap-3 p-3.5 bg-white rounded-xl border text-left active:scale-[0.98] transition-transform ${
                  currentScreen === "settings"
                    ? "border-gray-900 ring-1 ring-gray-900"
                    : "border-gray-100"
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-700">
                  <SettingsIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900">Settings</h4>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {settings.appLockEnabled ? "Security enabled" : "Preferences & categories"}
                  </p>
                </div>
                <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
              System Status
            </h3>
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Storage</span>
                <span className="font-medium text-gray-900">Local (IndexedDB)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Privacy</span>
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                  <Shield size={12} />
                  Offline-First
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Currency</span>
                <span className="font-medium text-gray-900">{settings.currency || "USD"}</span>
              </div>
              {settings.aiSettings?.apiKey && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-50">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Sparkles size={12} className="text-blue-500" />
                    AI Provider
                  </span>
                  <span className="font-medium text-gray-900 uppercase text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                    {settings.aiSettings.provider}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info matching SettingsScreen branding */}
        <div className="p-4 bg-white border-t border-gray-200 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-gray-700">PennyWise</p>
          <p className="text-[11px] text-gray-400 mt-0.5">v1.0.0 · Offline-First & Private</p>
        </div>
      </div>
    </div>
  );
}
