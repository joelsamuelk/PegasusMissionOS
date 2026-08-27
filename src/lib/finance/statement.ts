import { parseCsvRows } from "@/lib/documents";
import { money } from "@/lib/finance-intelligence/money";
import type {
  CurrencyCode,
  FinancialTransaction,
  Money,
  TransactionDirection,
} from "@/types/domain";

/**
 * Reading a bank statement.
 *
 * Every UK bank exports a different CSV and none of them declares a schema.
 * The columns are named differently, the dates are in three formats, and
 * money is sometimes one signed column and sometimes two unsigned ones. There
 * is no standard to conform to, so the parser detects rather than assumes, and
 * **says what it detected** so a person can correct it before anything is
 * imported.
 *
 * Two rules, and the second is the one that matters.
 *
 * **Nothing is guessed silently.** A column the parser could not identify is
 * reported by name. A row it could not read is reported by number, with the
 * reason. An import that quietly skipped four rows would reconcile to the
 * wrong total and nobody would know which four.
 *
 * **Money never touches a float.** Amounts are parsed to integer minor units
 * directly from the text, never through `parseFloat`. `parseFloat("1234.56") *
 * 100` is `123455.99999999999`, and a ledger built on that does not reconcile.
 */

export type StatementColumn =
  | "date"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "balance"
  | "counterparty"
  | "reference"
  | "unknown";

/**
 * Header text that identifies a column, lowercased.
 *
 * Drawn from the exports of the banks a UK charity is most likely to use. It
 * will be incomplete; that is why an unmatched column is reported rather than
 * dropped.
 */
const COLUMN_HINTS: [StatementColumn, string[]][] = [
  ["date", ["date", "transaction date", "posted", "value date", "booking date"]],
  [
    "description",
    ["description", "details", "narrative", "transaction description", "memo", "particulars"],
  ],
  ["debit", ["debit", "money out", "paid out", "withdrawal", "out"]],
  ["credit", ["credit", "money in", "paid in", "deposit", "in"]],
  ["amount", ["amount", "value", "transaction amount"]],
  ["balance", ["balance", "running balance"]],
  ["counterparty", ["counterparty", "payee", "name", "beneficiary", "merchant"]],
  ["reference", ["reference", "ref", "transaction reference"]],
];

/**
 * Match a hint as a whole phrase, not as a substring.
 *
 * The substring version matched "Some Bank Specific Thing" as a credit column,
 * because the credit hints include the two-letter word "in" and the word
 * "thing" contains it. A column mis-detected that way puts every row on the
 * wrong side of the ledger, so the pass is anchored on word boundaries.
 */
function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(haystack);
}

export function detectColumn(header: string): StatementColumn {
  const normalised = header.trim().toLowerCase().replace(/[_-]+/g, " ");
  for (const [column, hints] of COLUMN_HINTS) {
    if (hints.includes(normalised)) return column;
  }
  // Phrase matching second, so "amount" never wins over "debit amount", and
  // so a short hint cannot match a word that merely contains it.
  for (const [column, hints] of COLUMN_HINTS) {
    if (hints.some((hint) => containsPhrase(normalised, hint))) return column;
  }
  return "unknown";
}

/**
 * Parse an amount into integer minor units.
 *
 * Text to integer, without a float in between. Handles the parenthesised
 * negatives, currency symbols, thousands separators and trailing `CR`/`DR`
 * markers that appear across UK bank exports.
 */
export function parseAmountMinorUnits(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  let negative = false;
  let body = text;

  if (/^\(.*\)$/.test(body)) {
    negative = true;
    body = body.slice(1, -1);
  }
  const marker = /\s*(CR|DR)\s*$/i.exec(body);
  if (marker) {
    if (marker[1]!.toUpperCase() === "DR") negative = true;
    body = body.slice(0, marker.index);
  }
  body = body.replace(/[£$€,\s]/g, "");
  if (body.startsWith("-")) {
    negative = true;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }

  if (!/^\d*(?:\.\d*)?$/.test(body) || body === "" || body === ".") return null;

  const [whole = "0", fraction = ""] = body.split(".");
  // Two decimal places, padded or truncated. A bank exporting three is
  // reporting a rate rather than a settled amount, and truncating is the
  // conservative reading.
  const minor = `${fraction}00`.slice(0, 2);
  const value = Number(whole) * 100 + Number(minor);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

const DATE_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^(\d{4})-(\d{2})-(\d{2})/, (m) => `${m[1]}-${m[2]}-${m[3]}`],
  [/^(\d{1,2})\/(\d{1,2})\/(\d{4})/, (m) => `${m[3]}-${pad(m[2]!)}-${pad(m[1]!)}`],
  [/^(\d{1,2})-(\d{1,2})-(\d{4})/, (m) => `${m[3]}-${pad(m[2]!)}-${pad(m[1]!)}`],
  [
    /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/,
    (m) => {
      const month = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
      return month ? `${m[3]}-${month}-${pad(m[1]!)}` : "";
    },
  ],
];

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const pad = (value: string) => value.padStart(2, "0");

/**
 * Parse a date to ISO.
 *
 * `dd/mm/yyyy` is assumed over `mm/dd/yyyy`, because this is a UK product and
 * a wrong guess silently moves a transaction by up to eleven months. Where the
 * day is above twelve the format is unambiguous and the assumption is checked
 * rather than trusted — see `detectDateAmbiguity`.
 */
export function parseStatementDate(raw: string): string | null {
  const text = raw.trim();
  for (const [pattern, format] of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const iso = format(match);
    if (iso && !Number.isNaN(Date.parse(iso))) return iso;
  }
  return null;
}

/**
 * Whether a `dd/mm` reading could equally have been `mm/dd`.
 *
 * Reported on the import rather than resolved, because it cannot be resolved
 * from the file: a statement whose every day-of-month happens to be twelve or
 * below is genuinely ambiguous, and the only party who knows is the person who
 * downloaded it.
 */
export function detectDateAmbiguity(rawDates: string[]): boolean {
  const slashed = rawDates.filter((raw) => /^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(raw.trim()));
  if (slashed.length === 0) return false;
  return slashed.every((raw) => {
    const first = Number(/^(\d{1,2})/.exec(raw.trim())?.[1] ?? 0);
    return first <= 12;
  });
}

export interface ParsedStatementRow {
  /** 1-based, counting the header. Reported on every problem. */
  rowNumber: number;
  date: string;
  description: string;
  amount: Money;
  direction: TransactionDirection;
  counterparty?: string;
  reference?: string;
  balance?: Money;
}

export interface StatementProblem {
  rowNumber: number;
  reason: string;
  raw: string;
}

export interface ParsedStatement {
  rows: ParsedStatementRow[];
  problems: StatementProblem[];
  /** What each column was taken to mean, so a person can correct it. */
  columns: { header: string; detected: StatementColumn }[];
  /** Headers the parser could not identify. Never silently dropped. */
  unrecognisedColumns: string[];
  /** True where `dd/mm` could equally have been `mm/dd`. */
  dateFormatAmbiguous: boolean;
  currency: CurrencyCode;
}

export interface ParseStatementOptions {
  currency?: CurrencyCode;
  /** Override detection where a person has corrected it. */
  columnOverrides?: Record<string, StatementColumn>;
}

export function parseStatementCsv(
  input: string,
  options: ParseStatementOptions = {},
): ParsedStatement {
  const currency = options.currency ?? "GBP";
  const raw = parseCsvRows(input).filter((row) => row.some((cell) => cell.trim() !== ""));

  if (raw.length < 2) {
    return {
      rows: [],
      problems: [
        {
          rowNumber: 0,
          reason:
            "The file has no rows beyond a header, or could not be read as CSV. Nothing was imported.",
          raw: "",
        },
      ],
      columns: [],
      unrecognisedColumns: [],
      dateFormatAmbiguous: false,
      currency,
    };
  }

  const headers = raw[0]!.map((header) => header.trim());
  const columns = headers.map((header) => ({
    header,
    detected: options.columnOverrides?.[header] ?? detectColumn(header),
  }));
  const indexOf = (column: StatementColumn) =>
    columns.findIndex((entry) => entry.detected === column);

  const dateIndex = indexOf("date");
  const descriptionIndex = indexOf("description");
  const amountIndex = indexOf("amount");
  const debitIndex = indexOf("debit");
  const creditIndex = indexOf("credit");
  const balanceIndex = indexOf("balance");
  const counterpartyIndex = indexOf("counterparty");
  const referenceIndex = indexOf("reference");

  const problems: StatementProblem[] = [];
  const rows: ParsedStatementRow[] = [];

  if (dateIndex === -1) {
    problems.push({
      rowNumber: 1,
      reason: `No date column was found. Headers seen: ${headers.join(", ")}.`,
      raw: headers.join(","),
    });
  }
  if (amountIndex === -1 && debitIndex === -1 && creditIndex === -1) {
    problems.push({
      rowNumber: 1,
      reason: `No amount column was found. Headers seen: ${headers.join(", ")}.`,
      raw: headers.join(","),
    });
  }
  if (problems.length > 0) {
    return {
      rows: [],
      problems,
      columns,
      unrecognisedColumns: columns
        .filter((entry) => entry.detected === "unknown")
        .map((entry) => entry.header),
      dateFormatAmbiguous: false,
      currency,
    };
  }

  const rawDates: string[] = [];

  for (let i = 1; i < raw.length; i += 1) {
    const cells = raw[i]!;
    const rowNumber = i + 1;
    const rawLine = cells.join(",");

    const rawDate = cells[dateIndex]?.trim() ?? "";
    const date = parseStatementDate(rawDate);
    if (!date) {
      problems.push({
        rowNumber,
        reason: `"${rawDate}" is not a date this parser recognises.`,
        raw: rawLine,
      });
      continue;
    }
    rawDates.push(rawDate);

    let minorUnits: number | null = null;
    if (amountIndex !== -1) {
      minorUnits = parseAmountMinorUnits(cells[amountIndex] ?? "");
    } else {
      const debit = debitIndex === -1 ? null : parseAmountMinorUnits(cells[debitIndex] ?? "");
      const credit = creditIndex === -1 ? null : parseAmountMinorUnits(cells[creditIndex] ?? "");
      // A parsed zero is different from an unparseable cell, and the two used
      // to collapse into "no amount could be read" — which sent a reviewer
      // looking for a formatting problem that was not there.
      if (debit === 0 && (credit === null || credit === 0)) {
        problems.push({ rowNumber, reason: "The amount is zero.", raw: rawLine });
        continue;
      }
      if (credit === 0 && debit === null) {
        problems.push({ rowNumber, reason: "The amount is zero.", raw: rawLine });
        continue;
      }
      if (debit !== null && credit !== null && debit !== 0 && credit !== 0) {
        // Both columns populated is a file the parser does not understand, not
        // a row to average or to pick from.
        problems.push({
          rowNumber,
          reason: "Both the money in and money out columns are populated on this row.",
          raw: rawLine,
        });
        continue;
      }
      minorUnits = credit && credit !== 0 ? credit : debit && debit !== 0 ? -Math.abs(debit) : null;
    }

    if (minorUnits === null) {
      problems.push({
        rowNumber,
        reason: "No amount could be read from this row.",
        raw: rawLine,
      });
      continue;
    }
    if (minorUnits === 0) {
      // A zero-value line is a bank artefact rather than a transaction. Noted
      // rather than imported, so the row count still reconciles.
      problems.push({ rowNumber, reason: "The amount is zero.", raw: rawLine });
      continue;
    }

    rows.push({
      rowNumber,
      date,
      description: (cells[descriptionIndex] ?? "").trim() || "No description given",
      amount: money(Math.abs(minorUnits), currency),
      direction: minorUnits > 0 ? "income" : "expenditure",
      counterparty: counterpartyIndex === -1 ? undefined : cells[counterpartyIndex]?.trim(),
      reference: referenceIndex === -1 ? undefined : cells[referenceIndex]?.trim(),
      balance:
        balanceIndex === -1
          ? undefined
          : (() => {
              const parsed = parseAmountMinorUnits(cells[balanceIndex] ?? "");
              return parsed === null ? undefined : money(parsed, currency);
            })(),
    });
  }

  return {
    rows,
    problems,
    columns,
    unrecognisedColumns: columns
      .filter((entry) => entry.detected === "unknown")
      .map((entry) => entry.header),
    dateFormatAmbiguous: detectDateAmbiguity(rawDates),
    currency,
  };
}

// --- Duplicate detection ------------------------------------------------

export interface DuplicateMatch {
  rowNumber: number;
  existingTransactionId: string;
  reason: string;
  /** How sure. A same-day identical pair is common and legitimate. */
  confidence: "exact" | "likely";
}

/**
 * Rows that look like transactions already recorded.
 *
 * Flagged, never dropped. A charity paying the same £250 rent on the same day
 * of two consecutive months produces identical rows that are both real, and a
 * parser that deduplicated them would silently lose one. Two *identical* rows
 * on the *same date* is the ambiguous case, and it is reported as `likely`
 * rather than resolved.
 */
export function detectDuplicates(
  rows: ParsedStatementRow[],
  existing: FinancialTransaction[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const key = (date: string, minorUnits: number, description: string) =>
    `${date}:${minorUnits}:${description.trim().toLowerCase()}`;

  const byKey = new Map<string, FinancialTransaction[]>();
  for (const transaction of existing) {
    const k = key(transaction.date, transaction.amount.minorUnits, transaction.description);
    byKey.set(k, [...(byKey.get(k) ?? []), transaction]);
  }

  const seenInFile = new Map<string, number>();

  for (const row of rows) {
    const k = key(row.date, row.amount.minorUnits, row.description);
    const already = byKey.get(k);
    if (already && already.length > 0) {
      matches.push({
        rowNumber: row.rowNumber,
        existingTransactionId: already[0]!.id,
        reason: `Same date, amount and description as a transaction already recorded on ${row.date}.`,
        confidence: "exact",
      });
      continue;
    }
    const previousRow = seenInFile.get(k);
    if (previousRow !== undefined) {
      matches.push({
        rowNumber: row.rowNumber,
        existingTransactionId: "",
        reason: `Identical to row ${previousRow} in this file. Both may be real; check before importing.`,
        confidence: "likely",
      });
    }
    seenInFile.set(k, row.rowNumber);
  }

  return matches;
}
