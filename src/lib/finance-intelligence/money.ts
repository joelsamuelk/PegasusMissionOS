import type { CurrencyCode, Money } from "./types";

/**
 * Integer money.
 *
 * Impact economics apportions the same pound repeatedly — a shared cost splits
 * three ways, each share rolls up two levels, then divides by a participant
 * count. Doing that in floating point produces totals that do not reconcile to
 * the accounts, which destroys the only thing these figures have going for
 * them. Every amount here is an integer number of minor units, every split is
 * exact, and mixing currencies throws rather than coercing.
 */

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Cannot combine amounts in ${a} and ${b}.`);
    this.name = "CurrencyMismatchError";
  }
}

/** Minor units per major unit. Extend as currencies are supported. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  JPY: 0,
  KRW: 0,
  ISK: 0,
  CLP: 0,
  VND: 0,
  UGX: 0,
  RWF: 0,
  KMF: 0,
  XOF: 0,
  XAF: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
  JOD: 3,
};

export function minorUnitScale(currency: CurrencyCode): number {
  return 10 ** (MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2);
}

export function money(minorUnits: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(minorUnits)) {
    throw new TypeError(`Money must be whole minor units, received ${minorUnits}.`);
  }
  return { minorUnits, currency };
}

/** Build from a major-unit figure, e.g. `fromMajor(420_000, "GBP")`. */
export function fromMajor(major: number, currency: CurrencyCode): Money {
  const scale = minorUnitScale(currency);
  // toFixed first so 1.005 * 100 does not land on 100.49999999999999.
  return money(Math.round(Number((major * scale).toFixed(6))), currency);
}

export function toMajor(m: Money): number {
  return m.minorUnits / minorUnitScale(m.currency);
}

export function zero(currency: CurrencyCode): Money {
  return { minorUnits: 0, currency };
}

export function isZero(m: Money): boolean {
  return m.minorUnits === 0;
}

export function isNegative(m: Money): boolean {
  return m.minorUnits < 0;
}

export function isPositive(m: Money): boolean {
  return m.minorUnits > 0;
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits + b.minorUnits, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits - b.minorUnits, a.currency);
}

export function negate(m: Money): Money {
  return money(-m.minorUnits, m.currency);
}

export function absMoney(m: Money): Money {
  return money(Math.abs(m.minorUnits), m.currency);
}

/** Sum a list. `currency` is required so an empty list still has a currency. */
export function sumMoney(items: Money[], currency: CurrencyCode): Money {
  let total = 0;
  for (const item of items) {
    if (item.currency !== currency) throw new CurrencyMismatchError(currency, item.currency);
    total += item.minorUnits;
  }
  return money(total, currency);
}

/** Multiply by a scalar, rounding half away from zero. */
export function multiplyMoney(m: Money, factor: number): Money {
  const raw = m.minorUnits * factor;
  return money(Math.sign(raw) * Math.round(Math.abs(raw)), m.currency);
}

/** Divide by a count, rounding half away from zero. Throws on zero. */
export function divideMoney(m: Money, divisor: number): Money {
  if (divisor === 0) throw new RangeError("Cannot divide money by zero.");
  const raw = m.minorUnits / divisor;
  return money(Math.sign(raw) * Math.round(Math.abs(raw)), m.currency);
}

export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.minorUnits - b.minorUnits;
}

export function maxMoney(a: Money, b: Money): Money {
  return compareMoney(a, b) >= 0 ? a : b;
}

export function minMoney(a: Money, b: Money): Money {
  return compareMoney(a, b) <= 0 ? a : b;
}

/** Clamp at zero. Used where a negative gap means "no gap", not "surplus owed". */
export function floorAtZero(m: Money): Money {
  return m.minorUnits < 0 ? zero(m.currency) : m;
}

/** `a / b` as a plain ratio. Returns null when `b` is zero. */
export function ratio(a: Money, b: Money): number | null {
  assertSameCurrency(a, b);
  if (b.minorUnits === 0) return null;
  return a.minorUnits / b.minorUnits;
}

/** `a / b` as a percentage, rounded to `dp` decimal places. Null when `b` is zero. */
export function percentOf(a: Money, b: Money, dp = 1): number | null {
  const r = ratio(a, b);
  if (r === null) return null;
  const factor = 10 ** dp;
  return Math.round(r * 100 * factor) / factor;
}

/**
 * Split an amount by weights so that the parts sum **exactly** to the whole.
 *
 * Largest-remainder: floor every share, then hand the leftover minor units to
 * the largest fractional remainders, ties broken by index so the result is
 * stable. Without this, a £72,000 shared cost split 42/35/23 across three
 * programmes reconciles to £71,999.99 and every roll-up above it is wrong.
 */
export function splitMoney(total: Money, weights: number[]): Money[] {
  if (weights.length === 0) return [];
  if (weights.some((w) => w < 0 || !Number.isFinite(w))) {
    throw new RangeError("Allocation weights must be finite and non-negative.");
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return weights.map(() => zero(total.currency));

  const sign = total.minorUnits < 0 ? -1 : 1;
  const magnitude = Math.abs(total.minorUnits);

  const exact = weights.map((w) => (magnitude * w) / totalWeight);
  const parts = exact.map((v) => Math.floor(v));
  let remainder = magnitude - parts.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((v, index) => ({ index, fraction: v - Math.floor(v) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const entry of order) {
    if (remainder <= 0) break;
    parts[entry.index] = (parts[entry.index] ?? 0) + 1;
    remainder -= 1;
  }

  return parts.map((p) => money(sign * p, total.currency));
}

/**
 * Round to a step, for narrative figures that should read as approximations.
 * "£40k–£55k of unrestricted funding" is more honest than "£41,283–£54,904"
 * when the underlying allocations are apportioned.
 */
export function roundMoneyTo(m: Money, stepMinorUnits: number): Money {
  if (stepMinorUnits <= 0) return m;
  return money(Math.round(m.minorUnits / stepMinorUnits) * stepMinorUnits, m.currency);
}

/** Format for display. Major units, no decimals unless asked. */
export function formatMoney(m: Money, opts: { decimals?: boolean; locale?: string } = {}): string {
  return new Intl.NumberFormat(opts.locale ?? "en-GB", {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(toMajor(m));
}

/** Compact form for headline figures, e.g. £420k. */
export function formatMoneyCompact(m: Money, opts: { locale?: string } = {}): string {
  return new Intl.NumberFormat(opts.locale ?? "en-GB", {
    style: "currency",
    currency: m.currency,
    notation: "compact",
    // Without an explicit minimum, ICU renders £40,000 as "£40.0k".
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(toMajor(m));
}
