import type { ISODate, UUID, VerificationState } from "@/types/domain";
import { addMoney, floorAtZero, isZero, money, splitMoney, subtractMoney, sumMoney, zero } from "./money";
import type {
  AllocationBasis,
  AllocationMethod,
  FinancialAllocation,
  FinancialTransaction,
  Money,
} from "./types";

/**
 * The allocation layer (§2).
 *
 * Nothing downstream reads a transaction directly. Cost roll-ups, unit
 * economics and subsidy all read allocations, because an allocation is the
 * only place that records *how* a pound was attributed to a programme. That
 * distinction is what separates "Youth Futures cost £420,000" from "£420,000
 * of expenditure has been attributed to Youth Futures, £96,000 of it by
 * apportioning shared costs on programme expenditure".
 */

/**
 * How much a basis can be relied on for the cost it apportions.
 *
 * These are confidences in the *method*, not truth claims. A direct invoice is
 * 1.0 because there is nothing to estimate. Equal allocation is 0.35 because it
 * is a convention chosen in the absence of a driver, and any figure resting
 * mostly on it should say so.
 */
export const BASIS_CONFIDENCE: Record<AllocationBasis, number> = {
  direct: 1,
  staff_time: 0.8,
  programme_expenditure: 0.75,
  headcount: 0.7,
  participant_volume: 0.6,
  custom_percentage: 0.55,
  equal: 0.35,
  unallocated: 0,
};

export const BASIS_LABELS: Record<AllocationBasis, string> = {
  direct: "Direct",
  headcount: "Headcount",
  programme_expenditure: "Programme expenditure",
  staff_time: "Staff time",
  participant_volume: "Participant volume",
  equal: "Equal allocation",
  custom_percentage: "Custom percentage",
  unallocated: "Unallocated",
};

export const METHOD_LABELS: Record<AllocationMethod, string> = {
  direct: "Direct",
  proportional: "Proportional",
  shared_cost: "Shared cost",
  manual: "Manual",
  suggested: "Suggested",
  unknown: "Unknown",
};

/** Targets an allocation can attach to. All optional; at least one is required. */
export interface AllocationTargetRef {
  programmeId?: UUID;
  workstreamId?: UUID;
  activityId?: UUID;
  outcomeId?: UUID;
  grantId?: UUID;
  strategicPriorityId?: UUID;
}

export interface DirectAllocationInput extends AllocationTargetRef {
  id: UUID;
  organisationId: UUID;
  amount: Money;
  effectiveDate: ISODate;
  transactionId?: UUID;
  budgetLineId?: UUID;
  restricted?: boolean;
  note?: string;
  createdBy?: UUID;
  /** Human-entered allocations are `manual`; rule-derived ones are `suggested`. */
  method?: Extract<AllocationMethod, "direct" | "manual" | "suggested">;
}

/**
 * A cost attributed in full to one target, with nothing apportioned.
 *
 * Created `needs_review` even at confidence 1.0 — the same rule Organisation
 * Intelligence applies to extraction. Confidence describes the method; only a
 * person produces `verified`.
 */
export function allocateDirect(input: DirectAllocationInput): FinancialAllocation {
  const method = input.method ?? "direct";
  return {
    id: input.id,
    organisationId: input.organisationId,
    ...(input.transactionId ? { transactionId: input.transactionId } : {}),
    ...(input.budgetLineId ? { budgetLineId: input.budgetLineId } : {}),
    ...targetFields(input),
    amount: input.amount,
    allocationMethod: method,
    allocationBasis: "direct",
    allocationNote: input.note ?? "Attributed in full to a single target.",
    confidence: method === "suggested" ? 0.5 : BASIS_CONFIDENCE.direct,
    ...(input.restricted !== undefined ? { restricted: input.restricted } : {}),
    effectiveDate: input.effectiveDate,
    verificationState: "needs_review",
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
  };
}

export interface SharedCostTarget extends AllocationTargetRef {
  label: string;
  /**
   * Driver value, not a percentage: headcount in people, programme
   * expenditure in minor units, staff time in hours. Proportions are derived,
   * so the driver stays inspectable.
   */
  weight: number;
}

export interface SharedCostInput {
  organisationId: UUID;
  /** What is being apportioned, e.g. "Finance Team". */
  label: string;
  amount: Money;
  basis: AllocationBasis;
  targets: SharedCostTarget[];
  effectiveDate: ISODate;
  transactionId?: UUID;
  budgetLineId?: UUID;
  restricted?: boolean;
  /**
   * Proportion (0..1) held back as genuinely organisational and attributed to
   * no programme. Recording it is better than forcing 100% onto delivery.
   */
  unallocatedShare?: number;
  createdBy?: UUID;
  /** Allocation ids are `${idPrefix}-${n}`, so results are stable in tests. */
  idPrefix: string;
}

export interface SharedCostShare {
  label: string;
  target: AllocationTargetRef;
  weight: number;
  /** Share of the apportioned pool, 0..100, rounded to one decimal. */
  proportionPercent: number;
  amount: Money;
}

export interface SharedCostResult {
  allocations: FinancialAllocation[];
  shares: SharedCostShare[];
  /** Deliberately not attributed to any programme. */
  unallocated: Money;
  basis: AllocationBasis;
  method: AllocationMethod;
  confidence: number;
  /** The sentence shown next to every figure this touches. */
  methodologyNote: string;
}

/**
 * Apportion a shared organisational cost (§5).
 *
 * The split is exact to the minor unit — largest-remainder, not rounding — so
 * a £72,000 finance team splits 42/35/23 into £30,240 / £25,200 / £16,560 and
 * reconciles. The basis travels with every allocation it produces.
 */
export function allocateSharedCost(input: SharedCostInput): SharedCostResult {
  const currency = input.amount.currency;
  const held = input.unallocatedShare ?? 0;
  if (held < 0 || held >= 1) {
    throw new RangeError("unallocatedShare must be in [0, 1).");
  }

  const unallocated = held > 0 ? splitMoney(input.amount, [held, 1 - held])[0] ?? zero(currency) : zero(currency);
  const pool = subtractMoney(input.amount, unallocated);

  const weights = input.targets.map((t) => t.weight);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const amounts = splitMoney(pool, weights);

  const shares: SharedCostShare[] = input.targets.map((target, index) => ({
    label: target.label,
    target: targetFields(target),
    weight: target.weight,
    proportionPercent:
      totalWeight > 0 ? Math.round((target.weight / totalWeight) * 1000) / 10 : 0,
    amount: amounts[index] ?? zero(currency),
  }));

  const confidence = BASIS_CONFIDENCE[input.basis];
  const methodologyNote = `${input.label}: apportioned by ${BASIS_LABELS[input.basis].toLowerCase()}.`;

  const allocations = shares
    .filter((share) => !isZero(share.amount))
    .map((share, index) => ({
      id: `${input.idPrefix}-${index + 1}`,
      organisationId: input.organisationId,
      ...(input.transactionId ? { transactionId: input.transactionId } : {}),
      ...(input.budgetLineId ? { budgetLineId: input.budgetLineId } : {}),
      ...share.target,
      amount: share.amount,
      allocationMethod: "shared_cost" as AllocationMethod,
      allocationBasis: input.basis,
      allocationNote: `${input.label}: ${share.proportionPercent}% by ${BASIS_LABELS[
        input.basis
      ].toLowerCase()}`,
      confidence,
      ...(input.restricted !== undefined ? { restricted: input.restricted } : {}),
      effectiveDate: input.effectiveDate,
      verificationState: "needs_review" as VerificationState,
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    }));

  return {
    allocations,
    shares,
    unallocated,
    basis: input.basis,
    method: "shared_cost",
    confidence,
    methodologyNote,
  };
}

/**
 * Deterministic allocation suggestion for a single transaction.
 *
 * No model involved. A transaction already tied to a grant that funds exactly
 * one programme is a direct attribution; a name match against a programme is a
 * *suggestion* at low confidence; anything else stays `unknown` and
 * unallocated rather than being guessed into a programme, because a wrong
 * allocation silently corrupts every unit cost above it.
 */
export interface AllocationSuggestionInput {
  transaction: FinancialTransaction;
  /** Programmes funded by a grant, keyed by grant id. */
  programmesByGrant?: Record<string, UUID[]>;
  programmes?: Array<{ id: UUID; name: string }>;
  idPrefix: string;
  createdBy?: UUID;
}

export interface AllocationSuggestion {
  allocation?: FinancialAllocation;
  method: AllocationMethod;
  reason: string;
}

export function suggestAllocation(input: AllocationSuggestionInput): AllocationSuggestion {
  const { transaction: txn } = input;

  if (txn.direction !== "expenditure") {
    return { method: "unknown", reason: "Income is allocated through funding records, not cost allocation." };
  }

  const grantProgrammes = txn.grantId ? input.programmesByGrant?.[txn.grantId] ?? [] : [];
  if (txn.grantId && grantProgrammes.length === 1) {
    const programmeId = grantProgrammes[0];
    return {
      allocation: allocateDirect({
        id: `${input.idPrefix}-1`,
        organisationId: txn.organisationId,
        transactionId: txn.id,
        grantId: txn.grantId,
        ...(programmeId ? { programmeId } : {}),
        amount: txn.amount,
        effectiveDate: txn.date,
        restricted: txn.restricted,
        note: "Grant-funded expenditure; the grant funds one programme.",
        ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      }),
      method: "direct",
      reason: "Transaction is tied to a grant that funds exactly one programme.",
    };
  }

  if (txn.grantId && grantProgrammes.length > 1) {
    return {
      method: "unknown",
      reason: "The funding grant supports several programmes; apportionment needs a basis.",
    };
  }

  const haystack = `${txn.description} ${txn.counterparty ?? ""}`.toLowerCase();
  const named = (input.programmes ?? []).filter(
    (p) => p.name.length >= 4 && haystack.includes(p.name.toLowerCase()),
  );
  if (named.length === 1) {
    const match = named[0];
    return {
      allocation: allocateDirect({
        id: `${input.idPrefix}-1`,
        organisationId: txn.organisationId,
        transactionId: txn.id,
        ...(match ? { programmeId: match.id } : {}),
        amount: txn.amount,
        effectiveDate: txn.date,
        restricted: txn.restricted,
        method: "suggested",
        note: `Description mentions "${match?.name}". Suggested, not confirmed.`,
        ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      }),
      method: "suggested",
      reason: `Transaction text names one programme ("${match?.name}").`,
    };
  }

  return {
    method: "unknown",
    reason:
      named.length > 1
        ? "Transaction text names more than one programme."
        : "No rule attributes this transaction; it remains unallocated.",
  };
}

// --- Review transitions --------------------------------------------------

/** Confirming an allocation as correct. The only route to `verified` (§2). */
export function verifyAllocation(
  allocation: FinancialAllocation,
  verifiedBy: UUID,
  verifiedAt: ISODate,
): FinancialAllocation {
  return { ...allocation, verificationState: "verified", verifiedBy, verifiedAt };
}

/**
 * A human changing the amount or target. The result is `provided`, not
 * `verified`: the value became the person's rather than the rule's, and
 * `allocationMethod` becomes `manual` so the roll-up stops crediting the
 * original basis.
 */
export function reviseAllocation(
  allocation: FinancialAllocation,
  revision: { amount?: Money; target?: AllocationTargetRef; note?: string },
  revisedBy: UUID,
  revisedAt: ISODate,
): FinancialAllocation {
  return {
    ...allocation,
    ...(revision.target ? targetFields(revision.target) : {}),
    ...(revision.amount ? { amount: revision.amount } : {}),
    allocationMethod: "manual",
    allocationBasis: allocation.allocationBasis ?? "direct",
    allocationNote: revision.note ?? "Adjusted by a person.",
    confidence: 1,
    verificationState: "provided",
    verifiedBy: revisedBy,
    verifiedAt: revisedAt,
  };
}

// --- Validation ----------------------------------------------------------

export interface AllocationIssue {
  code: "over_allocated" | "under_allocated" | "currency_mismatch" | "no_target";
  message: string;
  transactionId?: UUID;
  allocationId?: UUID;
}

/**
 * Allocations must not exceed the transaction they came from, and must point
 * somewhere. Under-allocation is reported but is not an error: partially
 * allocated expenditure is normal, and is what `coverage` measures.
 */
export function validateAllocations(
  transaction: FinancialTransaction,
  allocations: FinancialAllocation[],
): AllocationIssue[] {
  const issues: AllocationIssue[] = [];
  const mismatched = allocations.filter((a) => a.amount.currency !== transaction.amount.currency);
  for (const a of mismatched) {
    issues.push({
      code: "currency_mismatch",
      message: `Allocation is in ${a.amount.currency} but the transaction is in ${transaction.amount.currency}.`,
      transactionId: transaction.id,
      allocationId: a.id,
    });
  }

  for (const a of allocations) {
    if (!hasTarget(a)) {
      issues.push({
        code: "no_target",
        message: "Allocation does not reference a programme, grant, activity or priority.",
        transactionId: transaction.id,
        allocationId: a.id,
      });
    }
  }

  if (mismatched.length === 0) {
    const allocated = sumMoney(
      allocations.map((a) => a.amount),
      transaction.amount.currency,
    );
    const difference = subtractMoney(allocated, transaction.amount);
    if (difference.minorUnits > 0) {
      issues.push({
        code: "over_allocated",
        message: `Allocations exceed the transaction by ${difference.minorUnits} minor units.`,
        transactionId: transaction.id,
      });
    } else if (difference.minorUnits < 0) {
      issues.push({
        code: "under_allocated",
        message: `${Math.abs(difference.minorUnits)} minor units of this transaction are unallocated.`,
        transactionId: transaction.id,
      });
    }
  }

  return issues;
}

/** Total allocated against a transaction, clamped at zero for display. */
export function allocatedTotal(allocations: FinancialAllocation[], currency: string): Money {
  return floorAtZero(sumMoney(allocations.map((a) => a.amount), currency));
}

export function combineAllocations(a: Money, b: Money): Money {
  return addMoney(a, b);
}

export function emptyMoney(currency: string): Money {
  return money(0, currency);
}

// --- Internals -----------------------------------------------------------

function targetFields(ref: AllocationTargetRef): AllocationTargetRef {
  return {
    ...(ref.programmeId ? { programmeId: ref.programmeId } : {}),
    ...(ref.workstreamId ? { workstreamId: ref.workstreamId } : {}),
    ...(ref.activityId ? { activityId: ref.activityId } : {}),
    ...(ref.outcomeId ? { outcomeId: ref.outcomeId } : {}),
    ...(ref.grantId ? { grantId: ref.grantId } : {}),
    ...(ref.strategicPriorityId ? { strategicPriorityId: ref.strategicPriorityId } : {}),
  };
}

function hasTarget(a: FinancialAllocation): boolean {
  return Boolean(
    a.programmeId || a.workstreamId || a.activityId || a.outcomeId || a.grantId || a.strategicPriorityId,
  );
}
