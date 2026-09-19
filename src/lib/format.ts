import type { AppSettings } from "@/types";

export function getLocaleForCurrency(currency?: string): string {
  return currency === "INR" ? "en-IN" : "en-US";
}

export function formatCurrency(amount: number, settings: AppSettings): string {
  const symbol = settings.currencySymbol || "₹";
  const locale = getLocaleForCurrency(settings.currency);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol}${formatted}`;
}

export function formatCurrencyWithSign(amount: number, settings: AppSettings): string {
  const symbol = settings.currencySymbol || "₹";
  const locale = getLocaleForCurrency(settings.currency);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${symbol}${formatted}`;
}

export function formatInputAmount(value: string, currency?: string): string {
  // Strip all non-digit and non-decimal characters
  const clean = value.replace(/[^0-9.]/g, "");
  if (!clean) return "";

  const parts = clean.split(".");
  const intPart = parts[0];
  const decPart = parts.length > 1 ? parts.slice(1).join("") : null;

  let formattedInt = "";
  if (intPart) {
    try {
      const num = BigInt(intPart);
      formattedInt = new Intl.NumberFormat(getLocaleForCurrency(currency)).format(num);
    } catch {
      formattedInt = intPart;
    }
  } else if (decPart !== null) {
    formattedInt = "0";
  }

  if (decPart !== null) {
    return `${formattedInt}.${decPart.slice(0, 2)}`;
  }
  return formattedInt;
}

export function parseInputAmount(value: string | number): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const clean = String(value).replace(/,/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
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

  // Difference in calendar days (positive = future, negative = past)
  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";

  // Future dates
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) return `in ${diffDays} days`;
  if (diffDays >= 7 && diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `in ${weeks}w`;
  }
  if (diffDays >= 30 && diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `in ${months}mo`;
  }
  if (diffDays >= 365) {
    const years = Math.floor(diffDays / 365);
    return `in ${years}y`;
  }

  // Past dates
  const pastDays = Math.abs(diffDays);
  if (pastDays === 1) return "Yesterday";
  if (pastDays < 7) return `${pastDays} days ago`;
  if (pastDays < 30) return `${Math.floor(pastDays / 7)}w ago`;
  if (pastDays < 365) return `${Math.floor(pastDays / 30)}mo ago`;
  return `${Math.floor(pastDays / 365)}y ago`;
}
