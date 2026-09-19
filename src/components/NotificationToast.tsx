import { useEffect } from "react";
import { Bell, X, ArrowRight } from "lucide-react";
import type { AppNotification } from "@/lib/notifications";

interface NotificationToastProps {
  notification: AppNotification | null;
  onClose: () => void;
  onAction: (notification: AppNotification) => void;
}

export function NotificationToast({ notification, onClose, onAction }: NotificationToastProps) {
  useEffect(() => {
    if (!notification) return;

    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 6000);

    return () => clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  return (
    <div className="fixed top-3 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-200">
      <div
        onClick={() => onAction(notification)}
        className="pointer-events-auto w-full max-w-sm bg-gray-900/95 backdrop-blur-md text-white rounded-2xl p-3.5 shadow-2xl border border-white/10 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
      >
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
          <Bell size={20} className="animate-bounce" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">Reminder</span>
            <span className="text-[10px] text-gray-400">· Just now</span>
          </div>
          <h4 className="text-sm font-semibold text-white truncate">{notification.title}</h4>
          <p className="text-xs text-gray-300 line-clamp-1">{notification.body}</p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction(notification);
            }}
            className="px-2 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-semibold flex items-center gap-0.5 text-white transition-colors"
          >
            <span>View</span>
            <ArrowRight size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
