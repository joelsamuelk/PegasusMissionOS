"use server";

import { revalidatePath } from "next/cache";
import type { FinancePosition } from "@/lib/finance";
import type { FinancialImport, TransactionCandidateRecord } from "@/server/data/types";
import { getRepository } from "@/server/data";
import { loadFinancePosition } from "@/server/finance/position-service";
import { authorise, ok, type ActionResult } from "./authorise";

/**
 * Finance server actions.
 *
 * Reading the position needs `read`: it is the organisation's own operating
 * picture, and withholding it from a programme lead who needs to know whether
 * their programme is funded would be a strange kind of security.
 *
 * Importing and posting need `finance:manage`, because posting a transaction
 * moves a figure that ends up in a funder report.
 */

export interface PositionResult {
  ok: boolean;
  position?: FinancePosition;
  error?: string;
}

export async function loadPosition(): Promise<PositionResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };
  return { ok: true, position: await loadFinancePosition(auth.ctx, getRepository()) };
}

export interface ImportResult extends ActionResult {
  importId?: string;
  rowCount?: number;
  problems?: number;
  duplicates?: number;
}

/**
 * Read a statement and hold it for review.
 *
 * Deliberately does not post. The brief's pipeline has `review` between
 * `classify` and `post`, and collapsing the two would make the classifier's
 * suggestions into assertions the moment a file was uploaded.
 */
export async function importStatement(
  fileName: string,
  csv: string,
): Promise<ImportResult> {
  const auth = await authorise("finance:manage");
  if (!auth.ok) return auth.result;

  const record = await getRepository().finance.importStatement(auth.ctx, { fileName, csv });
  revalidatePath("/finance");
  return {
    ...ok,
    importId: record.id,
    rowCount: record.rowCount,
    problems: record.problems.length,
    duplicates: record.duplicateCount,
  };
}

export interface ImportDetailResult {
  ok: boolean;
  record?: FinancialImport;
  candidates?: TransactionCandidateRecord[];
  error?: string;
}

export async function loadImport(importId: string): Promise<ImportDetailResult> {
  const auth = await authorise("read");
  if (!auth.ok) return { ok: false, error: auth.result.message };

  const repo = getRepository();
  const record = await repo.finance.getImport(auth.ctx, importId);
  if (!record) return { ok: false, error: "That import could not be found." };

  return { ok: true, record, candidates: await repo.finance.candidates(auth.ctx, importId) };
}

export interface PostResult extends ActionResult {
  posted?: number;
  skipped?: { rowNumber: number; reason: string }[];
}

export async function postTransactions(
  importId: string,
  acceptedRowNumbers: number[],
): Promise<PostResult> {
  const auth = await authorise("finance:manage");
  if (!auth.ok) return auth.result;

  const result = await getRepository().finance.postCandidates(
    auth.ctx,
    importId,
    acceptedRowNumbers,
  );
  revalidatePath("/finance");
  return { ...ok, posted: result.posted.length, skipped: result.skipped };
}

export interface AllocateResult extends ActionResult {
  allocationId?: string;
}

/**
 * Attribute money to delivery.
 *
 * The record that makes cost-per-outcome defensible, which is why the method
 * and the basis are required by the type rather than defaulted. A figure whose
 * apportionment cannot be explained is exactly what makes a unit cost
 * indefensible.
 */
export async function allocateTransaction(input: {
  transactionId: string;
  amountMinorUnits: number;
  currency: string;
  allocationMethod: "direct" | "proportional" | "shared_cost" | "manual";
  allocationBasis?:
    | "direct"
    | "headcount"
    | "programme_expenditure"
    | "staff_time"
    | "participant_volume"
    | "equal"
    | "custom_percentage";
  allocationNote?: string;
  programmeId?: string;
  grantId?: string;
  activityId?: string;
  fundId?: string;
  outcomeId?: string;
}): Promise<AllocateResult> {
  const auth = await authorise("finance:manage");
  if (!auth.ok) return auth.result;

  const repo = getRepository();
  const transaction = await repo.finance.getTransaction(auth.ctx, input.transactionId);
  if (!transaction) return { ok: false, message: "That transaction could not be found." };

  if (input.amountMinorUnits <= 0 || input.amountMinorUnits > transaction.amount.minorUnits) {
    return {
      ok: false,
      message:
        "An allocation must be positive and cannot exceed the transaction. Split it across several allocations instead.",
    };
  }

  const allocationId = await repo.finance.allocate(auth.ctx, {
    transactionId: input.transactionId,
    amount: { minorUnits: input.amountMinorUnits, currency: input.currency },
    allocationMethod: input.allocationMethod,
    allocationBasis: input.allocationBasis,
    allocationNote: input.allocationNote,
    programmeId: input.programmeId,
    grantId: input.grantId,
    activityId: input.activityId,
    fundId: input.fundId ?? transaction.fundId,
    outcomeId: input.outcomeId,
    restricted: transaction.restricted,
    effectiveDate: transaction.date,
    // A person chose the target and the method. Nobody has checked the
    // apportionment against a timesheet or an invoice.
    verificationState: "provided",
    createdBy: auth.ctx.userId,
  });

  if (!allocationId) {
    return { ok: false, message: "That target does not exist in this organisation." };
  }

  revalidatePath("/finance");
  return { ...ok, allocationId };
}
