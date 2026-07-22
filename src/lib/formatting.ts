import { differenceInCalendarDays, format, parseISO } from "date-fns";

/** Format a number as GBP (or given currency) with no decimals by default. */
export function formatCurrency(
  amount: number,
  currency = "GBP",
  opts: { decimals?: boolean } = {},
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(amount);
}

/** Compact currency, e.g. £1.2M, £48k. */
export function formatCurrencyCompact(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Human date, e.g. 14 Mar 2026. */
export function formatDate(date?: string | null): string {
  if (!date) return "Not set";
  try {
    return format(parseISO(date), "d MMM yyyy");
  } catch {
    return date;
  }
}

export function formatDateLong(date?: string | null): string {
  if (!date) return "Not set";
  try {
    return format(parseISO(date), "EEEE d MMMM yyyy");
  } catch {
    return date;
  }
}

export interface DeadlineInfo {
  days: number;
  label: string;
  tone: "critical" | "warning" | "info" | "neutral";
}

/** Days until a deadline plus a tone for the deadline indicator. */
export function deadlineInfo(deadline?: string | null, from?: Date): DeadlineInfo {
  if (!deadline) {
    return { days: Number.POSITIVE_INFINITY, label: "No deadline", tone: "neutral" };
  }
  const base = from ?? new Date();
  let days: number;
  try {
    days = differenceInCalendarDays(parseISO(deadline), base);
  } catch {
    return { days: Number.POSITIVE_INFINITY, label: "No deadline", tone: "neutral" };
  }
  if (days < 0) {
    return { days, label: `${Math.abs(days)} days overdue`, tone: "critical" };
  }
  if (days === 0) return { days, label: "Due today", tone: "critical" };
  if (days === 1) return { days, label: "Due tomorrow", tone: "critical" };
  const tone = days <= 7 ? "critical" : days <= 21 ? "warning" : "info";
  return { days, label: `${days} days left`, tone };
}

/** Title-case a snake_case or lower string for display. */
export function humanise(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Relative-ish short timestamp for activity feeds. */
export function timeAgo(iso: string, now?: Date): string {
  try {
    const then = parseISO(iso);
    const base = now ?? new Date();
    const mins = Math.round((base.getTime() - then.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return format(then, "d MMM");
  } catch {
    return iso;
  }
}
