import type { UUID } from "@/types/domain";
import { formatMoney, percentOf, subtractMoney, sumMoney, zero } from "./money";
import type { ConcentrationPosition, ConcentrationProjection } from "./concentration";
import { projectConcentration } from "./concentration";
import type { CurrencyCode, FundingNeed, Money } from "./types";

/**
 * Funding portfolio construction (§19).
 *
 * The output of this module is a **scenario**. It is modelled as one — the
 * literal `status: "proposed_scenario"`, a `securedTotal` that only counts
 * components backed by an actual award, and a disclaimer that travels with the
 * object — because a plausible-looking table of numbers adding up to the gap
 * is the easiest thing in this entire system to mistake for money.
 */

export const SCENARIO_DISCLAIMER =
  "This is a proposed funding strategy, not secured funding. Amounts shown against unsecured components are targets.";

export type PortfolioComponentKind =
  | "trust_or_foundation"
  | "statutory_contract"
  | "corporate_partnership"
  | "individual_giving"
  | "earned_income"
  | "unrestricted_contribution"
  | "other";

export const COMPONENT_KIND_LABELS: Record<PortfolioComponentKind, string> = {
  trust_or_foundation: "Trust or foundation grant",
  statutory_contract: "Statutory contract",
  corporate_partnership: "Corporate partnership",
  individual_giving: "Individual giving",
  earned_income: "Earned income",
  unrestricted_contribution: "Unrestricted contribution",
  other: "Other",
};

export interface PortfolioComponent {
  id: string;
  label: string;
  kind: PortfolioComponentKind;
  amount: Money;
  /** True only where an award or contract already exists. */
  isSecured: boolean;
  funderId?: UUID;
  funderName?: string;
  opportunityId?: UUID;
  likelihood?: "high" | "medium" | "low";
  note?: string;
}

export interface FundingPortfolioScenario {
  /** Literal, so no view can render this as a funding position. */
  status: "proposed_scenario";
  needId: UUID;
  needTitle: string;
  gap: Money;
  currency: CurrencyCode;
  components: PortfolioComponent[];
  /** Components backed by an actual award. */
  securedTotal: Money;
  /** Components that are targets. */
  proposedTotal: Money;
  total: Money;
  /** gap − total. Positive means the scenario does not yet reach the gap. */
  residual: Money;
  coveragePercent: number;
  concentration?: ConcentrationProjection[];
  warnings: string[];
  disclaimer: string;
}

export interface PortfolioInput {
  need: FundingNeed;
  components: PortfolioComponent[];
  /** Current funder concentration, so the scenario can show what it would do to it. */
  concentration?: ConcentrationPosition;
}

export function buildPortfolioScenario(input: PortfolioInput): FundingPortfolioScenario {
  const currency = input.need.fundingGap.currency;
  const secured = input.components.filter((c) => c.isSecured);
  const proposed = input.components.filter((c) => !c.isSecured);

  const securedTotal = sumMoney(secured.map((c) => c.amount), currency);
  const proposedTotal = sumMoney(proposed.map((c) => c.amount), currency);
  const total = sumMoney([securedTotal, proposedTotal], currency);
  const residual = subtractMoney(input.need.fundingGap, total);
  const coverage = percentOf(total, input.need.fundingGap) ?? 0;

  const warnings: string[] = [];
  if (residual.minorUnits > 0) {
    warnings.push(`${formatMoney(residual)} of the gap is not covered by this scenario.`);
  }
  if (residual.minorUnits < 0) {
    warnings.push(
      `This scenario exceeds the gap by ${formatMoney({ ...residual, minorUnits: -residual.minorUnits })}; check for double-counted income.`,
    );
  }

  const dominant = input.components
    .filter((c) => !c.isSecured)
    .find((c) => (percentOf(c.amount, input.need.fundingGap) ?? 0) >= 50);
  if (dominant) {
    warnings.push(
      `${dominant.label} carries ${Math.round(percentOf(dominant.amount, input.need.fundingGap) ?? 0)}% of this scenario. If it does not land, most of the gap remains.`,
    );
  }

  const lowLikelihood = proposed.filter((c) => c.likelihood === "low");
  if (lowLikelihood.length > 0) {
    warnings.push(
      `${lowLikelihood.length} component(s) are assessed as low likelihood: ${lowLikelihood.map((c) => c.label).join(", ")}.`,
    );
  }

  const concentration = input.concentration
    ? proposed
        .filter((c) => c.funderId && c.funderName)
        .map((c) =>
          projectConcentration(input.concentration as ConcentrationPosition, {
            funderId: c.funderId as UUID,
            funderName: c.funderName as string,
            amount: c.amount,
          }),
        )
        .filter((p) => Boolean(p.warning))
    : [];

  for (const projection of concentration) {
    if (projection.warning) warnings.push(projection.warning);
  }

  return {
    status: "proposed_scenario",
    needId: input.need.id,
    needTitle: input.need.title,
    gap: input.need.fundingGap,
    currency,
    components: input.components,
    securedTotal,
    proposedTotal,
    total,
    residual,
    coveragePercent: coverage,
    ...(concentration.length > 0 ? { concentration } : {}),
    warnings,
    disclaimer: SCENARIO_DISCLAIMER,
  };
}

/** An empty scenario for a need, so the builder always has something to show. */
export function emptyScenario(need: FundingNeed): FundingPortfolioScenario {
  return buildPortfolioScenario({ need, components: [] });
}

export function scenarioTotalBySecurity(scenario: FundingPortfolioScenario): {
  secured: Money;
  proposed: Money;
  unmet: Money;
} {
  return {
    secured: scenario.securedTotal,
    proposed: scenario.proposedTotal,
    unmet: scenario.residual.minorUnits > 0 ? scenario.residual : zero(scenario.currency),
  };
}
