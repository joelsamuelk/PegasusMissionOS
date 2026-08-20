import { classifyRows, detectDuplicates, parseStatementCsv } from "@/lib/finance";
import { allocateSharedCost } from "@/lib/finance-intelligence/allocate";
import type {
  Budget,
  BudgetLine,
  CurrencyCode,
  EntityReference,
  FinancialAllocation,
  FinancialTransaction,
  Fund,
  Money,
} from "@/types/domain";
import type {
  FinanceRepository,
  FinancialImport,
  TransactionCandidateRecord,
} from "../../types";
import { ENTITY_TABLES } from "../entity-tables";
import { auditFrom, numberFrom, optionalNumberFrom, type Row } from "../mapping";
import { mapGrant } from "./grants";
import type { Deps, Query } from "../query";

/**
 * Money is two columns, never one.
 *
 * Integer minor units and a currency code. Nothing in the finance layer ever
 * sees a float, which is what makes the largest-remainder split reconcile to
 * the penny.
 */
const money = (minorUnits: unknown, currency: unknown): Money => ({
  minorUnits: numberFrom(minorUnits),
  currency: String(currency) as CurrencyCode,
});

function mapFund(row: Row): Fund {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    ...(row.description ? { description: String(row.description) } : {}),
    restriction: row.restriction as Fund["restriction"],
    currency: String(row.currency) as CurrencyCode,
    ...(row.restriction_purpose ? { restrictionPurpose: String(row.restriction_purpose) } : {}),
    // A balance brought forward is a property of the fund, not something that
    // happened during the period -- which is why it is not a transaction.
    ...(row.opening_balance_minor_units != null
      ? { openingBalance: money(row.opening_balance_minor_units, row.currency) }
      : {}),
    ...(row.origin_type && row.origin_id
      ? { originRef: { type: row.origin_type as EntityReference["type"], id: String(row.origin_id) } }
      : {}),
    ...(row.opened_at ? { openedAt: String(row.opened_at) } : {}),
    ...(row.closed_at ? { closedAt: String(row.closed_at) } : {}),
    status: row.status as Fund["status"],
    audit: auditFrom(row),
  };
}

function mapTransaction(row: Row): FinancialTransaction {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.account_id ? { accountId: String(row.account_id) } : {}),
    date: String(row.date),
    description: String(row.description),
    amount: money(row.amount_minor_units, row.currency),
    direction: row.direction as FinancialTransaction["direction"],
    ...(row.category ? { category: String(row.category) } : {}),
    ...(row.counterparty ? { counterparty: String(row.counterparty) } : {}),
    restricted: Boolean(row.restricted),
    ...(row.grant_id ? { grantId: String(row.grant_id) } : {}),
    ...(row.fund_id ? { fundId: String(row.fund_id) } : {}),
    source: row.source as FinancialTransaction["source"],
    verificationState: row.verification as FinancialTransaction["verificationState"],
  };
}

function transactionColumns(input: Omit<FinancialTransaction, "id" | "organisationId">) {
  return {
    accountId: input.accountId,
    date: input.date,
    description: input.description,
    amountMinorUnits: input.amount.minorUnits,
    currency: input.amount.currency,
    direction: input.direction,
    category: input.category,
    counterparty: input.counterparty,
    restricted: input.restricted,
    grantId: input.grantId,
    fundId: input.fundId,
    source: input.source,
    verification: input.verificationState,
  };
}

function mapAllocation(row: Row): FinancialAllocation {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.transaction_id ? { transactionId: String(row.transaction_id) } : {}),
    ...(row.budget_line_id ? { budgetLineId: String(row.budget_line_id) } : {}),
    ...(row.fund_id ? { fundId: String(row.fund_id) } : {}),
    ...(row.programme_id ? { programmeId: String(row.programme_id) } : {}),
    ...(row.grant_id ? { grantId: String(row.grant_id) } : {}),
    ...(row.activity_id ? { activityId: String(row.activity_id) } : {}),
    ...(row.outcome_id ? { outcomeId: String(row.outcome_id) } : {}),
    ...(row.strategic_priority_id
      ? { strategicPriorityId: String(row.strategic_priority_id) }
      : {}),
    amount: money(row.amount_minor_units, row.currency),
    allocationMethod: row.allocation_method as FinancialAllocation["allocationMethod"],
    ...(row.allocation_basis
      ? { allocationBasis: row.allocation_basis as FinancialAllocation["allocationBasis"] }
      : {}),
    // Shown next to the figure. A figure whose apportionment cannot be
    // explained is what makes cost-per-outcome indefensible.
    ...(row.allocation_note ? { allocationNote: String(row.allocation_note) } : {}),
    ...(row.confidence != null ? { confidence: optionalNumberFrom(row.confidence) } : {}),
    ...(row.restricted != null ? { restricted: Boolean(row.restricted) } : {}),
    effectiveDate: String(row.effective_date),
    verificationState: row.verification as FinancialAllocation["verificationState"],
    ...(row.created_by ? { createdBy: String(row.created_by) } : {}),
    ...(row.verified_by ? { verifiedBy: String(row.verified_by) } : {}),
    ...(row.verified_at ? { verifiedAt: String(row.verified_at) } : {}),
  };
}

function allocationColumns(input: Omit<FinancialAllocation, "id" | "organisationId">) {
  return {
    transactionId: input.transactionId,
    budgetLineId: input.budgetLineId,
    fundId: input.fundId,
    programmeId: input.programmeId,
    grantId: input.grantId,
    activityId: input.activityId,
    outcomeId: input.outcomeId,
    strategicPriorityId: input.strategicPriorityId,
    amountMinorUnits: input.amount.minorUnits,
    currency: input.amount.currency,
    allocationMethod: input.allocationMethod,
    allocationBasis: input.allocationBasis,
    allocationNote: input.allocationNote,
    confidence: input.confidence,
    restricted: input.restricted,
    effectiveDate: input.effectiveDate,
    verification: input.verificationState,
    createdBy: input.createdBy,
    verifiedBy: input.verifiedBy,
    verifiedAt: input.verifiedAt,
  };
}

function mapBudget(row: Row): Budget {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    name: String(row.name),
    ...(row.programme_id ? { programmeId: String(row.programme_id) } : {}),
    ...(row.grant_id ? { grantId: String(row.grant_id) } : {}),
    currency: String(row.currency) as CurrencyCode,
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    status: row.status as Budget["status"],
    ...(row.approved_by ? { approvedBy: String(row.approved_by) } : {}),
    ...(row.approved_at ? { approvedAt: String(row.approved_at) } : {}),
    audit: auditFrom(row),
  };
}

function mapBudgetLine(row: Row): BudgetLine {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    budgetId: String(row.budget_id),
    label: String(row.label),
    ...(row.category ? { category: String(row.category) } : {}),
    plannedAmount: money(row.planned_amount_minor_units, row.currency),
    ...(row.target_type && row.target_id
      ? { target: { type: row.target_type as EntityReference["type"], id: String(row.target_id) } }
      : {}),
    ...(row.note ? { note: String(row.note) } : {}),
  };
}

function mapImport(row: Row): FinancialImport {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    ...(row.file_name ? { fileName: String(row.file_name) } : {}),
    status: row.status as FinancialImport["status"],
    currency: String(row.currency),
    detectedColumns: (row.detected_columns ?? []) as FinancialImport["detectedColumns"],
    // Never silently empty: a row the parser could not read is reported, not
    // dropped.
    problems: (row.problems ?? []) as FinancialImport["problems"],
    rowCount: numberFrom(row.row_count),
    postedCount: numberFrom(row.posted_count),
    duplicateCount: numberFrom(row.duplicate_count),
    dateFormatAmbiguous: Boolean(row.date_format_ambiguous),
    ...(row.uploaded_by ? { uploadedBy: String(row.uploaded_by) } : {}),
    uploadedAt: String(row.uploaded_at),
    ...(row.reviewed_by ? { reviewedBy: String(row.reviewed_by) } : {}),
    ...(row.reviewed_at ? { reviewedAt: String(row.reviewed_at) } : {}),
  };
}

function mapCandidate(row: Row): TransactionCandidateRecord {
  return {
    id: String(row.id),
    organisationId: String(row.organisation_id),
    importId: String(row.import_id),
    rowNumber: numberFrom(row.row_number),
    date: String(row.transaction_date),
    description: String(row.description),
    amount: { minorUnits: numberFrom(row.amount_minor_units), currency: String(row.currency) },
    direction: row.direction as FinancialTransaction["direction"],
    ...(row.counterparty ? { counterparty: String(row.counterparty) } : {}),
    ...(row.reference ? { reference: String(row.reference) } : {}),
    ...(row.suggested_category ? { suggestedCategory: String(row.suggested_category) } : {}),
    ...(row.suggested_fund_id ? { suggestedFundId: String(row.suggested_fund_id) } : {}),
    ...(row.suggested_grant_id ? { suggestedGrantId: String(row.suggested_grant_id) } : {}),
    ...(row.suggested_restricted != null
      ? { suggestedRestricted: Boolean(row.suggested_restricted) }
      : {}),
    confidence: row.confidence as TransactionCandidateRecord["confidence"],
    evidence: (row.evidence ?? []) as TransactionCandidateRecord["evidence"],
    requiresApproval: Boolean(row.requires_approval),
    ...(row.duplicate_of ? { duplicateOf: String(row.duplicate_of) } : {}),
    ...(row.duplicate_reason ? { duplicateReason: String(row.duplicate_reason) } : {}),
    ...(row.posted_transaction_id
      ? { postedTransactionId: String(row.posted_transaction_id) }
      : {}),
    ...(row.decided_by ? { decidedBy: String(row.decided_by) } : {}),
    ...(row.decided_at ? { decidedAt: String(row.decided_at) } : {}),
  };
}

export function createFinanceRepository(
  q: Query,
  deps: Pick<Deps, "audit">,
): FinanceRepository {
  type Ctx = Parameters<FinanceRepository["funds"]>[0];

  async function entityExists(ctx: Ctx, ref: EntityReference): Promise<boolean> {
    const table = ENTITY_TABLES[ref.type];
    if (!table) return false;
    return (await q.maybeOne(ctx, table, { id: ref.id })) !== null;
  }

  return {
    async funds(ctx) {
      const rows = await q.many(ctx, "funds", {}, { order: { column: "name" }, liveOnly: true });
      return rows.map(mapFund);
    },

    async getFund(ctx, id) {
      const row = await q.maybeOne(ctx, "funds", { id });
      return row ? mapFund(row) : null;
    },

    async transactions(ctx) {
      const rows = await q.many(ctx, "financial_transactions", {}, {
        order: { column: "date", ascending: false },
      });
      return rows.map(mapTransaction);
    },

    async transactionsForFund(ctx, fundId) {
      const rows = await q.many(ctx, "financial_transactions", { fund_id: fundId }, {
        order: { column: "date", ascending: false },
      });
      return rows.map(mapTransaction);
    },

    async getTransaction(ctx, id) {
      const row = await q.maybeOne(ctx, "financial_transactions", { id });
      return row ? mapTransaction(row) : null;
    },

    async allocations(ctx) {
      const rows = await q.many(ctx, "financial_allocations", {}, {
        order: { column: "effective_date", ascending: false },
      });
      return rows.map(mapAllocation);
    },

    async allocationsFor(ctx, entity) {
      // Allocations name their target by a typed column rather than a generic
      // pair, so the entity kind decides which column to filter on. A kind
      // with no column has no allocations, which is the safe answer.
      const column = {
        programme: "programme_id",
        activity: "activity_id",
        grant: "grant_id",
        outcome: "outcome_id",
        fund: "fund_id",
        strategic_priority: "strategic_priority_id",
        budget_line: "budget_line_id",
        transaction: "transaction_id",
      }[entity.type as string];
      if (!column) return [];
      const rows = await q.many(ctx, "financial_allocations", { [column]: entity.id });
      return rows.map(mapAllocation);
    },

    async budgets(ctx) {
      const rows = await q.many(ctx, "budgets", {}, { liveOnly: true });
      return rows.map(mapBudget);
    },

    async budgetLines(ctx, budgetId) {
      const rows = await q.many(ctx, "budget_lines", { budget_id: budgetId });
      return rows.map(mapBudgetLine);
    },

    async recordTransaction(ctx, input) {
      const row = await q.insert(ctx, "financial_transactions", transactionColumns(input));
      return String(row.id);
    },

    async allocate(ctx, input) {
      // The target is checked before the row is written. A correctly scoped
      // allocation naming another tenant's programme is still a cross-tenant
      // pointer.
      for (const [type, id] of [
        ["programme", input.programmeId],
        ["activity", input.activityId],
        ["grant", input.grantId],
        ["outcome", input.outcomeId],
        ["fund", input.fundId],
        ["strategic_priority", input.strategicPriorityId],
      ] as const) {
        if (id && !(await entityExists(ctx, { type, id }))) return null;
      }
      const row = await q.insert(ctx, "financial_allocations", allocationColumns(input), {
        audit: false,
      });
      return String(row.id);
    },

    async allocateShared(ctx, input) {
      const transactionRow = await q.maybeOne(ctx, "financial_transactions", {
        id: input.transactionId,
      });
      if (!transactionRow) return null;
      const transaction = mapTransaction(transactionRow);

      // Endpoints are checked before any arithmetic runs. Apportioning a cost
      // across a programme in another tenant would be a correctly scoped
      // allocation row pointing somewhere it must not.
      for (const target of input.targets) {
        if (
          target.programmeId &&
          !(await entityExists(ctx, { type: "programme", id: target.programmeId }))
        ) {
          return null;
        }
        if (
          target.activityId &&
          !(await entityExists(ctx, { type: "activity", id: target.activityId }))
        ) {
          return null;
        }
      }

      // Delegates to the calculation engine so the persisted path runs that
      // arithmetic rather than a second copy of it. Largest-remainder, so it
      // reconciles to the penny.
      const result = allocateSharedCost({
        organisationId: ctx.organisationId,
        label: input.label,
        amount: transaction.amount,
        basis: input.basis ?? "equal",
        targets: input.targets.map((target) => ({
          label: target.label,
          weight: target.weight,
          programmeId: target.programmeId,
          activityId: target.activityId,
        })),
        effectiveDate: transaction.date,
        transactionId: transaction.id,
        restricted: transaction.restricted,
        unallocatedShare: input.unallocatedShare,
        idPrefix: crypto.randomUUID(),
        createdBy: ctx.userId,
      });

      const allocationIds: string[] = [];
      for (const allocation of result.allocations) {
        const row = await q.insert(
          ctx,
          "financial_allocations",
          allocationColumns(allocation),
          { audit: false },
        );
        allocationIds.push(String(row.id));
      }

      await deps.audit.record(ctx, {
        action: "finance.cost.apportioned",
        entityType: "transaction",
        entityId: transaction.id,
        summary: `Apportioned ${input.label} across ${input.targets.length} targets. ${result.methodologyNote}`,
      });

      return { allocationIds, unallocatedMinorUnits: result.unallocated.minorUnits };
    },

    async importStatement(ctx, input) {
      const now = ctx.now().toISOString();
      const currency = input.currency ?? "GBP";
      const parsed = parseStatementCsv(input.csv, { currency });

      const [fundRows, grantRows, funderRows, historyRows] = await Promise.all([
        q.many(ctx, "funds"),
        q.many(ctx, "grants"),
        q.many(ctx, "funders"),
        q.many(ctx, "financial_transactions"),
      ]);

      const classified = classifyRows(parsed.rows, {
        funds: fundRows.map(mapFund),
        grants: grantRows.map(mapGrant),
        funderNames: funderRows.map((row) => ({ id: String(row.id), name: String(row.name) })),
        history: historyRows.map(mapTransaction),
      });
      const duplicates = detectDuplicates(parsed.rows, historyRows.map(mapTransaction));
      const duplicateByRow = new Map(duplicates.map((match) => [match.rowNumber, match]));

      const importRow = await q.insert(
        ctx,
        "financial_imports",
        {
          fileName: input.fileName,
          format: "csv",
          // Never `posted`. An import that parsed is an import awaiting a
          // person; the only path to `posted` is through `postCandidates`.
          status: parsed.rows.length === 0 ? "failed" : "awaiting_review",
          currency,
          detectedColumns: parsed.columns,
          problems: parsed.problems,
          rowCount: parsed.rows.length,
          postedCount: 0,
          duplicateCount: duplicates.length,
          dateFormatAmbiguous: parsed.dateFormatAmbiguous,
          uploadedBy: ctx.userId,
          uploadedAt: now,
        },
        { audit: false },
      );
      const record = mapImport(importRow);

      for (const row of classified) {
        const duplicate = duplicateByRow.get(row.rowNumber);
        await q.insert(
          ctx,
          "transaction_candidates",
          {
            importId: record.id,
            rowNumber: row.rowNumber,
            transactionDate: row.date,
            description: row.description,
            amountMinorUnits: row.amount.minorUnits,
            currency: row.amount.currency,
            direction: row.direction,
            counterparty: row.counterparty,
            reference: row.reference,
            suggestedCategory: row.candidate.category,
            suggestedFundId: row.candidate.fundId,
            suggestedGrantId: row.candidate.grantId,
            suggestedRestricted: row.candidate.restricted,
            confidence: row.candidate.confidence,
            evidence: row.candidate.evidence,
            // A duplicate always needs a person, whatever the classifier made
            // of it: posting the same payment twice moves a grant utilisation
            // figure a funder reads.
            requiresApproval: row.candidate.requiresApproval || duplicate !== undefined,
            duplicateOf: duplicate?.existingTransactionId || undefined,
            duplicateReason: duplicate?.reason,
          },
          { audit: false },
        );
      }

      await deps.audit.record(ctx, {
        action: "finance.statement.imported",
        entityType: "transaction",
        entityId: record.id,
        summary: `Read ${parsed.rows.length} rows from ${input.fileName ?? "a statement"}, ${parsed.problems.length} unreadable, ${duplicates.length} possible duplicates. Nothing posted.`,
      });

      return record;
    },

    async imports(ctx) {
      const rows = await q.many(ctx, "financial_imports", {}, {
        order: { column: "uploaded_at", ascending: false },
      });
      return rows.map(mapImport);
    },

    async getImport(ctx, id) {
      const row = await q.maybeOne(ctx, "financial_imports", { id });
      return row ? mapImport(row) : null;
    },

    async candidates(ctx, importId) {
      const rows = await q.many(ctx, "transaction_candidates", { import_id: importId }, {
        order: { column: "row_number" },
      });
      return rows.map(mapCandidate);
    },

    async postCandidates(ctx, importId, acceptedRowNumbers) {
      const record = await q.maybeOne(ctx, "financial_imports", { id: importId });
      if (!record) return { posted: [], skipped: [] };

      const accepted = new Set(acceptedRowNumbers);
      const posted: string[] = [];
      const skipped: { rowNumber: number; reason: string }[] = [];

      const candidates = (
        await q.many(ctx, "transaction_candidates", { import_id: importId }, {
          order: { column: "row_number" },
        })
      ).map(mapCandidate);

      for (const candidate of candidates) {
        if (!accepted.has(candidate.rowNumber)) {
          skipped.push({ rowNumber: candidate.rowNumber, reason: "Not accepted by the reviewer." });
          continue;
        }
        if (candidate.postedTransactionId) {
          skipped.push({ rowNumber: candidate.rowNumber, reason: "Already posted." });
          continue;
        }

        const row = await q.insert(ctx, "financial_transactions", {
          date: candidate.date,
          description: candidate.description,
          amountMinorUnits: candidate.amount.minorUnits,
          currency: candidate.amount.currency,
          direction: candidate.direction,
          category: candidate.suggestedCategory,
          counterparty: candidate.counterparty,
          restricted: candidate.suggestedRestricted ?? false,
          grantId: candidate.suggestedGrantId,
          fundId: candidate.suggestedFundId,
          source: "import",
          // A person accepted the classification, so the transaction is
          // `provided` rather than `verified`: they confirmed a suggestion,
          // nobody reconciled it against a bank statement line by line.
          verification: "provided",
        });
        await q.update(
          ctx,
          "transaction_candidates",
          candidate.id,
          {
            postedTransactionId: String(row.id),
            decidedBy: ctx.userId,
            decidedAt: ctx.now().toISOString(),
          },
          { audit: false },
        );
        posted.push(String(row.id));
      }

      await q.update(
        ctx,
        "financial_imports",
        importId,
        {
          postedCount: numberFrom(record.posted_count) + posted.length,
          reviewedBy: ctx.userId,
          reviewedAt: ctx.now().toISOString(),
          status: posted.length > 0 ? "posted" : "rejected",
        },
        { audit: false },
      );

      await deps.audit.record(ctx, {
        action: "finance.statement.posted",
        entityType: "transaction",
        entityId: importId,
        summary: `Posted ${posted.length} transactions from an import, ${skipped.length} left unposted`,
      });

      return { posted, skipped };
    },
  };
}
