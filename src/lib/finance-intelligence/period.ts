import {
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfQuarter,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfQuarter,
} from "date-fns";
import type { ISODate } from "@/types/domain";
import type { Period } from "./types";

/**
 * Period arithmetic for finance views.
 *
 * Calendar quarters, not financial years: an organisation's financial year end
 * is a profile field and forecasts are read alongside funder deadlines, which
 * are calendar-dated. `financialYearPeriod` is provided for the statutory view.
 */

function iso(date: Date): ISODate {
  return format(date, "yyyy-MM-dd");
}

export function quarterKey(date: Date): string {
  return `${format(date, "yyyy")}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

export function quarterLabel(date: Date): string {
  return `Q${Math.floor(date.getMonth() / 3) + 1} ${format(date, "yyyy")}`;
}

export function quarterOf(date: Date): Period {
  const start = startOfQuarter(date);
  const end = endOfQuarter(date);
  return {
    key: quarterKey(start),
    label: quarterLabel(start),
    start: iso(start),
    end: iso(end),
  };
}

/** `count` consecutive quarters starting with the one containing `from`. */
export function quartersFrom(from: Date, count: number): Period[] {
  const periods: Period[] = [];
  let cursor = startOfQuarter(from);
  for (let i = 0; i < count; i += 1) {
    periods.push(quarterOf(cursor));
    cursor = addMonths(cursor, 3);
  }
  return periods;
}

/** Quarters covering `months` from `from`, inclusive of the starting quarter. */
export function quartersOverHorizon(from: Date, months: number): Period[] {
  return quartersFrom(from, Math.max(1, Math.ceil(months / 3)));
}

export function calendarYearPeriod(year: number): Period {
  return {
    key: String(year),
    label: String(year),
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

/**
 * A financial year labelled by its end, e.g. year end 31 March 2027 is
 * "FY2026/27" and runs 1 April 2026 – 31 March 2027.
 */
export function financialYearPeriod(yearEnd: ISODate): Period {
  const end = parseISO(yearEnd);
  const start = addMonths(end, -12);
  const startNext = new Date(start.getTime());
  startNext.setDate(start.getDate() + 1);
  const startYear = startNext.getFullYear();
  const endYear = end.getFullYear();
  return {
    key: `FY${startYear}-${String(endYear).slice(-2)}`,
    label: `FY${startYear}/${String(endYear).slice(-2)}`,
    start: iso(startNext),
    end: iso(end),
  };
}

export function periodContains(period: Period, date: ISODate): boolean {
  const d = parseISO(date);
  return !isBefore(d, parseISO(period.start)) && !isAfter(d, parseISO(period.end));
}

export function periodsOverlap(a: Period, b: Period): boolean {
  return !isAfter(parseISO(a.start), parseISO(b.end)) && !isBefore(parseISO(a.end), parseISO(b.start));
}

/** Inclusive day count, used to apportion a span across quarters. */
export function periodDays(period: Period): number {
  return differenceInCalendarDays(parseISO(period.end), parseISO(period.start)) + 1;
}

/** Inclusive day count of an arbitrary span. */
export function spanDays(start: ISODate, end: ISODate): number {
  return Math.max(0, differenceInCalendarDays(parseISO(end), parseISO(start)) + 1);
}

/** Days of `span` that fall inside `period`. Zero when they do not overlap. */
export function overlapDays(span: { start: ISODate; end: ISODate }, period: Period): number {
  const start = Math.max(parseISO(span.start).getTime(), parseISO(period.start).getTime());
  const end = Math.min(parseISO(span.end).getTime(), parseISO(period.end).getTime());
  if (end < start) return 0;
  return differenceInCalendarDays(new Date(end), new Date(start)) + 1;
}

/**
 * Whole months from `from` to `to`, truncated toward zero: two weeks short of
 * a month is not a month of runway.
 *
 * Negative where `to` precedes `from`, deliberately. Clamping at zero would
 * hide the ordering, and callers need to distinguish "the deadline falls two
 * months after the money is needed" from "the deadline is today".
 */
export function wholeMonthsBetween(from: Date, to: Date): number {
  const months = differenceInCalendarMonths(to, from);
  if (months === 0) return 0;
  const anniversary = addMonths(from, months);
  if (months > 0) return isAfter(anniversary, to) ? months - 1 : months;
  return isBefore(anniversary, to) ? months + 1 : months;
}

/** Fractional months, for runway figures quoted to one decimal place. */
export function fractionalMonthsBetween(from: Date, to: Date): number {
  const days = differenceInCalendarDays(to, from);
  if (days <= 0) return 0;
  return Math.round((days / 30.44) * 10) / 10;
}
