import type { AppSettings } from "@/types";

export function formatCurrency(amount: number, settings: AppSettings): string {
  const symbol = settings.currencySymbol || "₹";
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol}${formatted}`;
}

export function formatCurrencyWithSign(amount: number, settings: AppSettings): string {
  const symbol = settings.currencySymbol || "₹";
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${symbol}${formatted}`;
}

export function formatDate(dateStr: string, settings: AppSettings): string {
  const date = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  const fmt = settings.dateFormat || "DD/MM/YYYY";
  if (fmt === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  if (fmt === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

export function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getMonthBounds(date: Date = new Date()): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function getWeekBounds(date: Date = new Date()): { start: string; end: string } {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function getYearBounds(date: Date = new Date()): { start: string; end: string } {
  return {
    start: `${date.getFullYear()}-01-01`,
    end: `${date.getFullYear()}-12-31`,
  };
}

export function getLastMonthBounds(date: Date = new Date()): { start: string; end: string } {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return getMonthBounds(d);
}

export function getPeriodBounds(period: string): { start: string; end: string } {
  switch (period) {
    case "today":
      const t = getTodayString();
      return { start: t, end: t };
    case "week":
      return getWeekBounds();
    case "month":
      return getMonthBounds();
    case "last_month":
      return getLastMonthBounds();
    case "year":
      return getYearBounds();
    default:
      return getMonthBounds();
  }
}

export function periodLabel(period: string): string {
  switch (period) {
    case "today":
      return "Today";
    case "week":
      return "This Week";
    case "month":
      return "This Month";
    case "last_month":
      return "Last Month";
    case "year":
      return "This Year";
    case "custom":
      return "Custom Range";
    default:
      return "This Month";
  }
}

export function relativeDate(dateStr: string): string {
  const date = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}
