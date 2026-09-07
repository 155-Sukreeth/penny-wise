import { useState } from "react";
import { Lock, Delete } from "lucide-react";
import type { AppSettings } from "@/types";

interface AppLockProps {
  settings: AppSettings;
  onUnlock: () => void;
}

export function AppLock({ settings, onUnlock }: AppLockProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handlePress = (digit: string) => {
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    setError(false);
    if (next.length >= (settings.appLockPin?.length || 4)) {
      if (next === settings.appLockPin) {
        onUnlock();
      } else {
        setTimeout(() => {
          setError(true);
          setPin("");
        }, 200);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  const pinLength = settings.appLockPin?.length || 4;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center mb-6">
        <Lock size={28} className="text-white" />
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">App Locked</h1>
      <p className="text-sm text-gray-500 mb-8">Enter your PIN to continue</p>

      <div className={`flex gap-3 mb-10 ${error ? "animate-shake" : ""}`}>
        {Array.from({ length: pinLength }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-colors ${
              error
                ? "bg-red-500"
                : i < pin.length
                ? "bg-gray-900"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-500 mb-6">Incorrect PIN, try again</p>
      )}

      <div className="grid grid-cols-3 gap-4 w-full max-w-[260px]">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
          <button
            key={d}
            onClick={() => handlePress(d)}
            className="w-16 h-16 rounded-full bg-white border border-gray-100 flex items-center justify-center text-xl font-semibold text-gray-900 active:scale-90 transition-transform mx-auto"
          >
            {d}
          </button>
        ))}
        <div className="w-16 h-16 mx-auto" />
        <button
          onClick={() => handlePress("0")}
          className="w-16 h-16 rounded-full bg-white border border-gray-100 flex items-center justify-center text-xl font-semibold text-gray-900 active:scale-90 transition-transform mx-auto"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          disabled={pin.length === 0}
          className="w-16 h-16 rounded-full flex items-center justify-center text-gray-500 disabled:opacity-30 active:scale-90 transition-transform mx-auto"
        >
          <Delete size={22} />
        </button>
      </div>
    </div>
  );
}
