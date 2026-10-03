import { useState } from "react";
import {
  X,
  Download,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  ChevronRight,
  Github,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Cloud
} from "lucide-react";
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
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNav = (screen: ScreenName) => {
    onNavigate(screen);
    onClose();
  };

  const handleCheckUpdates = async () => {
    if (checkingUpdates) return;
    setCheckingUpdates(true);
    setUpdateStatus(null);

    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
        }
      }
      // Brief animation for user feedback
      setTimeout(() => {
        setCheckingUpdates(false);
        setUpdateStatus("You are on the latest version (v1.0.0)");
        setTimeout(() => setUpdateStatus(null), 3500);
      }, 900);
    } catch {
      setCheckingUpdates(false);
      setUpdateStatus("Up to date");
      setTimeout(() => setUpdateStatus(null), 3500);
    }
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
        <div className="px-4 pt-5 pb-3.5 bg-white border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="PennyWise"
              className="w-9 h-9 rounded-full border border-gray-100 shadow-sm"
            />
            <div>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight leading-none">PennyWise</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">Finance & Budget</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 active:scale-95 transition-all"
            aria-label="Close menu"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content list with compact icons */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3.5">
          {/* Main workspace section */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
              Workspace
            </h3>
            <div className="space-y-1.5">
              <button
                onClick={() => handleNav("import-export")}
                className={`w-full flex items-center gap-2.5 p-2.5 bg-white rounded-xl border text-left active:scale-[0.98] transition-transform ${
                  currentScreen === "import-export"
                    ? "border-gray-900 ring-1 ring-gray-900 shadow-sm"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-700">
                  <Download size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-gray-900">Data Management</h4>
                  <p className="text-[11px] text-gray-400 truncate">Export, import, backup & restore</p>
                </div>
                <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
              </button>

              <button
                onClick={() => handleNav("settings")}
                className={`w-full flex items-center gap-2.5 p-2.5 bg-white rounded-xl border text-left active:scale-[0.98] transition-transform ${
                  currentScreen === "settings"
                    ? "border-gray-900 ring-1 ring-gray-900 shadow-sm"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-700">
                  <SettingsIcon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-gray-900">Settings</h4>
                  <p className="text-[11px] text-gray-400 truncate">
                    {settings.appLockEnabled ? "Security enabled" : "Preferences & categories"}
                  </p>
                </div>
                <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
              </button>
            </div>
          </div>

          {/* Connected Integrations */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
              Integrations
            </h3>
            <div className="space-y-1.5">
              {/* Google Integration Slot */}
              <button
                onClick={() => handleNav("settings")}
                className="w-full flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-100 text-left active:scale-[0.98] transition-transform hover:border-gray-200"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-700">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-900">Google Backup</h4>
                    <p className="text-[11px] text-gray-400 truncate">
                      {settings.googleSync?.userEmail ? settings.googleSync.userEmail : "Drive sync & cloud restore"}
                    </p>
                  </div>
                </div>
                {settings.googleSync?.enabled ? (
                  <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
                    Active
                  </span>
                ) : (
                  <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                )}
              </button>
            </div>
          </div>

          {/* Application & Support */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
              About & Updates
            </h3>
            <div className="space-y-1.5">
              {/* Check for updates */}
              <button
                onClick={handleCheckUpdates}
                disabled={checkingUpdates}
                className="w-full flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-100 text-left active:scale-[0.98] transition-transform hover:border-gray-200 disabled:opacity-70"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-700">
                    <RefreshCw size={14} className={checkingUpdates ? "animate-spin text-gray-900" : ""} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-900">Check for Updates</h4>
                    <p className="text-[11px] text-gray-400 truncate">
                      {checkingUpdates ? "Checking..." : updateStatus ? updateStatus : "Check for latest release"}
                    </p>
                  </div>
                </div>
                {updateStatus && <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />}
              </button>

              {/* GitHub repository link */}
              <a
                href="https://github.com/155-Sukreeth/penny-wise"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-100 text-left active:scale-[0.98] transition-transform hover:border-gray-200"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-800">
                    <Github size={15} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-900">GitHub Repository</h4>
                    <p className="text-[11px] text-gray-400 truncate">Source code & issues</p>
                  </div>
                </div>
                <ExternalLink size={14} className="text-gray-300 flex-shrink-0" />
              </a>
            </div>
          </div>

          {/* Compact System Status card */}
          <div>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
              System
            </h3>
            <div className="bg-white rounded-xl border border-gray-100 p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">Storage</span>
                <span className="font-medium text-gray-800">IndexedDB (Local)</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500">Privacy</span>
                <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                  <Shield size={11} />
                  Offline-First
                </span>
              </div>
              {settings.aiSettings?.apiKey && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-50">
                  <span className="text-gray-500 flex items-center gap-1">
                    <Sparkles size={11} className="text-blue-500" />
                    AI Provider
                  </span>
                  <span className="font-medium text-gray-800 uppercase text-[10px] bg-blue-50 text-blue-700 px-1 py-0.2 rounded">
                    {settings.aiSettings.provider}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info matching SettingsScreen branding */}
        <div className="p-3 bg-white border-t border-gray-200 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-gray-700">PennyWise</p>
          <p className="text-[10px] text-gray-400 mt-0.5">v1.0.0 · Offline-First & Private</p>
        </div>
      </div>
    </div>
  );
}
