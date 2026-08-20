import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  addMoney,
  formatMoney,
  money,
  subtractMoney,
  sumMoney,
  zero,
} from "@/lib/finance-intelligence/money";
import { computeConcentration } from "@/lib/finance-intelligence/concentration";
import { detectFundingCliffs, type ExpiringFunding } from "@/lib/finance-intelligence/cliffs";
import { computeUnrestrictedRunway, runwayState } from "@/lib/finance-intelligence/runway";
import type {
  Budget,
  BudgetLine,
  CurrencyCode,
  EntityReference,
  FinancialAllocation,
  FinancialTransaction,
  Fund,
  Funder,
  Grant,
  Money,
  Programme,
} from "@/types/domain";

/**
 * The Finance Command Centre, computed.
 *
 * Every figure here is produced by `lib/finance-intelligence`, which this
 * module does not modify and does not reimplement. What it adds is the layer
 * that engine never had: **inputs, and an honest answer when there are none.**
 *
 * The type that carries that is `FinanceFigure`. It is a union, not a number
 * with a nullable field, because the brief's constraint on this phase is
 * absolute: *where a refusal fires, the UI shows the reason. It never shows a
 * blank, and it never shows a zero.* A nullable number lets a caller render
 * `?? 0`, and a zero runway and an unknown runway are opposite statements.
 *
 * Every known figure carries its workings. A finance screen whose numbers
 * cannot be checked is a screen a trustee has to take on trust, and the
 * numbers here are the ones that go into funder reports.
 */

export type FinanceFigure =
  | {
      known: true;
      /** For display. Always formatted at the point of computation. */
      display: string;
      /** The raw value, for comparison and charting. */
      amount?: Money;
      number?: number;
      /** The arithmetic, written so a human can repeat it. */
      workings: string;
      sources: EntityReference[];
      /** Set where the figure rests on an assumption a reader should know. */
      caveat?: string;
    }
  | {
      known: false;
      /** Why it cannot be produced. Never "no data". */
      reason: string;
      /** What the organisation would have to record. */
      requires: string[];
    };

export const unknownFigure = (reason: string, requires: string[]): FinanceFigure => ({
  known: false,
  reason,
  requires,
});

export interface FinancePositionInput {
  organisationId: string;
  currency: CurrencyCode;
  funds: Fund[];
  transactions: FinancialTransaction[];
  allocations: FinancialAllocation[];
  budgets: Budget[];
  budgetLines: BudgetLine[];
  grants: Grant[];
  funders: Funder[];
  programmes: Programme[];
  programmeGrants: { programmeId: string; grantId: string }[];
  now: Date;
}

export interface GrantUtilisation {
  grantId: string;
  title: string;
  awarded: Money;
  allocated: Money;
  remaining: Money;
  percentUsed: number;
  /** Elapsed share of the award period, for comparison. */
  percentElapsed: number;
  workings: string;
  /** True where allocations exceed the award. Reported, never clamped. */
  overspent: boolean;
}

export interface BudgetVariance {
  budgetId: string;
  name: string;
  planned: Money;
  actual: Money;
  variance: Money;
  variancePercent: number;
  workings: string;
}

export interface FinancePosition {
  currency: CurrencyCode;
  cash: FinanceFigure;
  restricted: FinanceFigure;
  unrestricted: FinanceFigure;
  runway: FinanceFigure;
  incomeThisYear: FinanceFigure;
  expenditureThisYear: FinanceFigure;
  concentration: FinanceFigure;
  unallocated: FinanceFigure;
  grantUtilisation: GrantUtilisation[];
  budgetVariance: BudgetVariance[];
  cliffs: ReturnType<typeof detectFundingCliffs>;
  /** Every question this position could not answer, with what would fix it. */
  unanswered: { question: string; reason: string; requires: string[] }[];
}

const NO_LEDGER = (what: string): FinanceFigure =>
  unknownFigure(
    `${what} cannot be calculated because no transactions have been recorded.`,
    ["Import a bank statement, or enter transactions by hand."],
  );

/**
 * Income, expenditure and the resulting balance.
 *
 * `opening` is separate from `income` on purpose, and the distinction is not
 * pedantry: a balance brought forward is part of the balance and is **not**
 * part of the flow. Counting it as income makes a burn rate report that the
 * core covers itself, which is the most flattering possible error and one that
 * only shows up when somebody trusts the runway figure.
 */
function balanceOf(
  transactions: FinancialTransaction[],
  currency: CurrencyCode,
  opening: Money = zero(currency),
): { income: Money; spend: Money; balance: Money; opening: Money } {
  const income = sumMoney(
    transactions.filter((t) => t.direction === "income").map((t) => t.amount),
    currency,
  );
  const spend = sumMoney(
    transactions.filter((t) => t.direction === "expenditure").map((t) => t.amount),
    currency,
  );
  return { income, spend, opening, balance: addMoney(opening, subtractMoney(income, spend)) };
}

/** The balances funds held before the recorded ledger begins. */
function openingOf(funds: Fund[], currency: CurrencyCode): Money {
  return sumMoney(
    funds.map((fund) => fund.openingBalance).filter((value): value is Money => Boolean(value)),
    currency,
  );
}

export function computeFinancePosition(input: FinancePositionInput): FinancePosition {
  const { currency, funds, transactions, allocations, grants, funders, now } = input;
  const unanswered: FinancePosition["unanswered"] = [];

  const note = (question: string, figure: FinanceFigure) => {
    if (figure.known) return figure;
    unanswered.push({ question, reason: figure.reason, requires: figure.requires });
    return figure;
  };

  // --- Cash --------------------------------------------------------------

  const overall = balanceOf(transactions, currency, openingOf(funds, currency));
  const cash: FinanceFigure =
    transactions.length === 0
      ? NO_LEDGER("The cash position")
      : {
          known: true,
          display: formatMoney(overall.balance),
          amount: overall.balance,
          workings: `${formatMoney(overall.opening)} brought forward, plus ${formatMoney(overall.income)} recorded income, minus ${formatMoney(overall.spend)} recorded expenditure, across ${transactions.length} transactions.`,
          sources: funds.map((fund) => ({ type: "fund" as const, id: fund.id, label: fund.name })),
          caveat:
            "This is the balance of what has been recorded, not a bank balance. Anything not imported is not here.",
        };
  note("What is the cash position?", cash);

  // --- Restricted and unrestricted ---------------------------------------

  const fundsBy = (predicate: (fund: Fund) => boolean) => {
    const matching = funds.filter(predicate);
    const ids = new Set(matching.map((fund) => fund.id));
    return {
      ids,
      opening: openingOf(matching, currency),
      transactions: transactions.filter((t) => t.fundId && ids.has(t.fundId)),
    };
  };

  const restrictedFunds = fundsBy((fund) => fund.restriction === "restricted");
  const unrestrictedFunds = fundsBy((fund) => fund.restriction === "unrestricted");

  const restricted: FinanceFigure =
    restrictedFunds.ids.size === 0
      ? // Not zero. This organisation holds no restricted fund, which is a
        // different statement from holding one with nothing in it.
        unknownFigure("This organisation holds no restricted fund.", [])
      : restrictedFunds.transactions.length === 0
        ? NO_LEDGER("The restricted balance")
        : (() => {
            const b = balanceOf(restrictedFunds.transactions, currency, restrictedFunds.opening);
            return {
              known: true as const,
              display: formatMoney(b.balance),
              amount: b.balance,
              workings: `${formatMoney(b.opening)} brought forward, plus ${formatMoney(b.income)} in, minus ${formatMoney(b.spend)} out, across ${restrictedFunds.ids.size} restricted fund${restrictedFunds.ids.size === 1 ? "" : "s"}.`,
              sources: [...restrictedFunds.ids].map((id) => ({ type: "fund" as const, id })),
            };
          })();
  note("How much is restricted?", restricted);

  const unrestricted: FinanceFigure =
    unrestrictedFunds.ids.size === 0
      ? unknownFigure("This organisation holds no unrestricted fund.", [
          "Record an unrestricted fund if the organisation holds free reserves.",
        ])
      : unrestrictedFunds.transactions.length === 0
        ? NO_LEDGER("The unrestricted balance")
        : (() => {
            const b = balanceOf(unrestrictedFunds.transactions, currency, unrestrictedFunds.opening);
            return {
              known: true as const,
              display: formatMoney(b.balance),
              amount: b.balance,
              workings: `${formatMoney(b.opening)} brought forward, plus ${formatMoney(b.income)} in, minus ${formatMoney(b.spend)} out, across ${unrestrictedFunds.ids.size} unrestricted fund${unrestrictedFunds.ids.size === 1 ? "" : "s"}.`,
              sources: [...unrestrictedFunds.ids].map((id) => ({ type: "fund" as const, id })),
            };
          })();
  note("How much is unrestricted?", unrestricted);

  // --- Runway ------------------------------------------------------------

  let runway: FinanceFigure;
  if (!unrestricted.known || !unrestricted.amount) {
    runway = unknownFigure(
      "Unrestricted runway cannot be calculated without an unrestricted balance.",
      unrestricted.known ? [] : unrestricted.requires,
    );
  } else {
    const dates = unrestrictedFunds.transactions.map((t) => parseISO(t.date).getTime());
    const spanDays = Math.max(
      1,
      differenceInCalendarDays(new Date(Math.max(...dates)), new Date(Math.min(...dates))),
    );
    if (spanDays < 45) {
      // A burn rate from six weeks of ledger is arithmetic, not information.
      runway = unknownFigure(
        `Only ${spanDays} days of transactions have been recorded, which is not enough to establish a burn rate.`,
        ["Import at least three months of statements."],
      );
    } else {
      const months = spanDays / 30.44;
      const b = balanceOf(unrestrictedFunds.transactions, currency);
      const netBurnMinor = Math.round(Math.max(0, b.spend.minorUnits - b.income.minorUnits) / months);
      const result = computeUnrestrictedRunway({
        organisationId: input.organisationId,
        unrestrictedReserves: unrestricted.amount,
        monthlyUnrestrictedBurn: money(netBurnMinor, currency),
        now,
      });
      runway = Number.isFinite(result.runwayMonths)
        ? {
            known: true,
            display: `${result.runwayMonths} months`,
            number: result.runwayMonths,
            workings: `${formatMoney(unrestricted.amount)} unrestricted divided by ${formatMoney(result.monthlyUnrestrictedBurn)} net monthly burn, measured over ${Math.round(months)} months of recorded transactions. State: ${runwayState(result.runwayMonths)}.`,
            sources: [{ type: "organisation", id: input.organisationId }],
            caveat: "Assumes the observed burn rate continues unchanged.",
          }
        : {
            known: true,
            display: "No net burn",
            workings:
              "Unrestricted income currently covers unrestricted costs, so there is no burn rate to divide into.",
            sources: [{ type: "organisation", id: input.organisationId }],
          };
    }
  }
  note("How many months of unrestricted runway remain?", runway);

  // --- Income and expenditure this year ----------------------------------

  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const thisYear = transactions.filter((t) => t.date >= yearStart);
  const yearBalance = balanceOf(thisYear, currency);

  const incomeThisYear: FinanceFigure = thisYear.length
    ? {
        known: true,
        display: formatMoney(yearBalance.income),
        amount: yearBalance.income,
        workings: `Sum of ${thisYear.filter((t) => t.direction === "income").length} income transactions dated on or after ${yearStart}.`,
        sources: [{ type: "organisation", id: input.organisationId }],
      }
    : NO_LEDGER("Income this year");
  const expenditureThisYear: FinanceFigure = thisYear.length
    ? {
        known: true,
        display: formatMoney(yearBalance.spend),
        amount: yearBalance.spend,
        workings: `Sum of ${thisYear.filter((t) => t.direction === "expenditure").length} expenditure transactions dated on or after ${yearStart}.`,
        sources: [{ type: "organisation", id: input.organisationId }],
      }
    : NO_LEDGER("Expenditure this year");
  note("What has been received this year?", incomeThisYear);
  note("What has been spent this year?", expenditureThisYear);

  // --- Concentration ------------------------------------------------------

  const active = grants.filter((grant) => grant.status === "active");
  const funderName = new Map(funders.map((funder) => [funder.id, funder.name]));
  const concentration: FinanceFigure =
    active.length < 2
      ? unknownFigure(
          `Funding concentration needs at least two active grants to mean anything, and there ${active.length === 1 ? "is one" : "are none"}.`,
          ["Record the organisation's active grants."],
        )
      : (() => {
          const position = computeConcentration(
            active.map((grant) => ({
              funderId: grant.funderId,
              funderName: funderName.get(grant.funderId) ?? "Unnamed funder",
              amount: money(Math.round(grant.awardValue * 100), currency),
            })),
            currency,
          );
          const largest = position.largest!;
          return {
            known: true as const,
            display: `${largest.sharePercent}% from ${largest.funderName}`,
            number: largest.sharePercent,
            workings: `${formatMoney(largest.amount)} divided by ${formatMoney(position.total)} of active award value. Top three: ${position.topThreePercent}%. Herfindahl index ${position.herfindahl}.`,
            sources: active.map((grant) => ({
              type: "grant" as const,
              id: grant.id,
              label: grant.title,
            })),
            caveat:
              "Calculated on award value rather than on income received in a period, because a full income ledger has not been recorded.",
          };
        })();
  note("Where are we dependent on one funder?", concentration);

  // --- Unallocated money --------------------------------------------------

  const allocatedByTransaction = new Map<string, number>();
  for (const allocation of allocations) {
    if (!allocation.transactionId) continue;
    allocatedByTransaction.set(
      allocation.transactionId,
      (allocatedByTransaction.get(allocation.transactionId) ?? 0) + allocation.amount.minorUnits,
    );
  }
  const unallocatedRows = transactions.filter(
    (t) =>
      t.direction === "expenditure" &&
      (allocatedByTransaction.get(t.id) ?? 0) < t.amount.minorUnits,
  );
  const unallocatedTotal = unallocatedRows.reduce(
    (sum, t) =>
      addMoney(sum, money(t.amount.minorUnits - (allocatedByTransaction.get(t.id) ?? 0), currency)),
    zero(currency),
  );
  const unallocated: FinanceFigure = transactions.length
    ? {
        known: true,
        display: formatMoney(unallocatedTotal),
        amount: unallocatedTotal,
        workings: `${unallocatedRows.length} expenditure transaction${unallocatedRows.length === 1 ? "" : "s"} with no allocation, or allocated for less than their value.`,
        sources: unallocatedRows
          .slice(0, 20)
          .map((t) => ({ type: "transaction" as const, id: t.id })),
        caveat:
          "Cost per outcome excludes this money entirely. It is not hidden and it is not apportioned.",
      }
    : NO_LEDGER("Unallocated expenditure");
  note("How much money has not been attributed to anything?", unallocated);

  // --- Grant utilisation --------------------------------------------------

  const grantUtilisation: GrantUtilisation[] = active.map((grant) => {
    const forGrant = allocations.filter((allocation) => allocation.grantId === grant.id);
    const allocated = sumMoney(
      forGrant.map((allocation) => allocation.amount),
      currency,
    );
    const awarded = money(Math.round(grant.awardValue * 100), currency);
    const start = parseISO(grant.startDate).getTime();
    const end = parseISO(grant.endDate).getTime();
    const elapsed =
      end > start ? Math.max(0, Math.min(100, ((now.getTime() - start) / (end - start)) * 100)) : 0;

    return {
      grantId: grant.id,
      title: grant.title,
      awarded,
      allocated,
      remaining: subtractMoney(awarded, allocated),
      percentUsed: awarded.minorUnits
        ? Math.round((allocated.minorUnits / awarded.minorUnits) * 1000) / 10
        : 0,
      percentElapsed: Math.round(elapsed * 10) / 10,
      // Read from allocations, never from `Grant.spentToDate`. The scalar
      // cannot be verified: nothing says which transactions produced it.
      workings: `${formatMoney(awarded)} awarded minus ${formatMoney(allocated)} across ${forGrant.length} allocation${forGrant.length === 1 ? "" : "s"}, each naming its transaction and its method.`,
      overspent: allocated.minorUnits > awarded.minorUnits,
    };
  });

  // --- Budget variance ----------------------------------------------------

  const budgetVariance: BudgetVariance[] = input.budgets
    .filter((budget) => budget.status === "approved")
    .map((budget) => {
      const lines = input.budgetLines.filter((line) => line.budgetId === budget.id);
      const planned = sumMoney(
        lines.map((line) => line.plannedAmount),
        budget.currency,
      );
      const actualAllocations = allocations.filter(
        (allocation) =>
          (budget.grantId && allocation.grantId === budget.grantId) ||
          (budget.programmeId && allocation.programmeId === budget.programmeId) ||
          lines.some((line) => line.id === allocation.budgetLineId),
      );
      const actual = sumMoney(
        actualAllocations.map((allocation) => allocation.amount),
        budget.currency,
      );
      const variance = subtractMoney(actual, planned);
      return {
        budgetId: budget.id,
        name: budget.name,
        planned,
        actual,
        variance,
        variancePercent: planned.minorUnits
          ? Math.round((variance.minorUnits / planned.minorUnits) * 1000) / 10
          : 0,
        workings: `${formatMoney(actual)} allocated against ${formatMoney(planned)} planned across ${lines.length} budget line${lines.length === 1 ? "" : "s"}.`,
      };
    });

  // --- Cliffs -------------------------------------------------------------

  const programmeName = new Map(input.programmes.map((p) => [p.id, p.name]));
  const expiring: ExpiringFunding[] = active.map((grant) => {
    const link = input.programmeGrants.find((entry) => entry.grantId === grant.id);
    return {
      grantId: grant.id,
      grantTitle: grant.title,
      funderId: grant.funderId,
      funderName: funderName.get(grant.funderId),
      programmeId: link?.programmeId,
      programmeName: link ? programmeName.get(link.programmeId) : undefined,
      annualAmount: money(Math.round(grant.awardValue * 100), currency),
      endDate: grant.endDate,
      restricted: grant.restricted,
    };
  });
  const cliffs = detectFundingCliffs({ expiring, currency, now });

  return {
    currency,
    cash,
    restricted,
    unrestricted,
    runway,
    incomeThisYear,
    expenditureThisYear,
    concentration,
    unallocated,
    grantUtilisation,
    budgetVariance,
    cliffs,
    unanswered,
  };
}
