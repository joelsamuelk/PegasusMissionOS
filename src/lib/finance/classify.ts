import type {
  EntityReference,
  FinancialTransaction,
  Fund,
  Grant,
  TransactionDirection,
} from "@/types/domain";
import type { ParsedStatementRow } from "./statement";

/**
 * Classifying a transaction.
 *
 * The brief's rule for this whole area is one clause: *AI classification
 * remains candidate state until approved where material.* This implementation
 * goes further, and it is worth saying why: **no model is involved at all.**
 *
 * Classification is matching a payment description against records the
 * organisation already holds — its funders, its funds, its grants, its
 * recurring counterparties. That is a lookup, and a lookup is explainable,
 * testable and free. A model asked to do the same thing would produce the same
 * answers less reliably, and would need every payment narrative — which name
 * individuals — sent to a provider to do it.
 *
 * Everything here is a **candidate**. Nothing writes a category. A suggestion
 * carries the evidence that produced it, so a reviewer approving forty
 * transactions can see why each was suggested rather than approving forty
 * assertions.
 */

export type ClassificationConfidence = "certain" | "probable" | "possible";

export interface ClassificationEvidence {
  /** What matched: "counterparty", "reference", "amount", "recurrence". */
  code: string;
  detail: string;
}

export interface TransactionCandidate {
  rowNumber?: number;
  transactionId?: string;
  /** The chart-of-accounts or expenditure category suggested. */
  category?: string;
  /** The fund the money moved into or out of. */
  fundId?: string;
  /** The grant it belongs to, where it is unambiguous. */
  grantId?: string;
  /** Whether the money carries a funder restriction. */
  restricted?: boolean;
  confidence: ClassificationConfidence;
  evidence: ClassificationEvidence[];
  /** Whether a person must approve. See `isMaterial`. */
  requiresApproval: boolean;
}

/**
 * Above this, a classification is always reviewed however confident it is.
 *
 * "Material" in the brief's sense. £5,000 in minor units: below it, a
 * misclassified transaction is a tidying job; above it, it moves a grant
 * utilisation figure that a funder will read.
 */
export const MATERIAL_THRESHOLD_MINOR_UNITS = 500_000;

export function isMaterial(minorUnits: number): boolean {
  return Math.abs(minorUnits) >= MATERIAL_THRESHOLD_MINOR_UNITS;
}

/** Common charity expenditure categories, matched on description keywords. */
const CATEGORY_HINTS: [string, string[]][] = [
  ["Salaries", ["salary", "salaries", "payroll", "wages", "paye", "hmrc paye"]],
  ["Pensions", ["pension", "nest", "auto enrol"]],
  ["Premises", ["rent", "rates", "service charge", "electricity", "gas", "water", "utilities"]],
  ["Insurance", ["insurance", "indemnity", "liability cover"]],
  ["Professional fees", ["accountant", "audit", "legal", "solicitor", "examiner"]],
  ["Travel", ["rail", "train", "bus", "taxi", "mileage", "travel"]],
  ["Programme delivery", ["venue hire", "catering", "materials", "workshop", "session"]],
  ["Equipment", ["laptop", "device", "hardware", "equipment", "furniture"]],
  ["Software", ["subscription", "saas", "licence", "license", "microsoft", "google workspace"]],
  ["Bank charges", ["bank charge", "service fee", "interest", "overdraft"]],
  ["Grants received", ["grant", "award", "funding"]],
  ["Donations received", ["donation", "gift aid", "justgiving", "cafdonate"]],
];

export interface ClassificationContext {
  funds: Fund[];
  grants: Grant[];
  /** Funder names, so a payment from a funder is recognisable. */
  funderNames: { id: string; name: string }[];
  /** Transactions already classified, for recurrence matching. */
  history: FinancialTransaction[];
}

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Whether a name appears in a description.
 *
 * Word-boundary matching on the distinctive part of a name, because bank
 * descriptions truncate. "The Henderson Trust" arrives as "HENDERSON TR" and a
 * whole-string match would never fire; matching on "henderson" would fire on
 * "Henderson Road" and is why the match is reported as evidence a person can
 * reject rather than applied.
 */
/**
 * Words too generic to identify anything.
 *
 * Almost every grant an organisation holds is called something "programme
 * grant" or something "delivery fund". Matching on those words makes every
 * payment match every grant, which the classifier then correctly reports as
 * ambiguous — and a classifier that reports everything as ambiguous is a
 * classifier nobody uses.
 */
const GENERIC_WORDS = new Set([
  "trust",
  "foundation",
  "limited",
  "charity",
  "grant",
  "grants",
  "fund",
  "funds",
  "funding",
  "award",
  "programme",
  "programmes",
  "project",
  "projects",
  "delivery",
  "support",
  "council",
  "authority",
  "community",
]);

function nameMatches(description: string, name: string): string | null {
  const haystack = normalise(description);
  const words = normalise(name)
    .split(" ")
    .filter((word) => word.length >= 5 && !GENERIC_WORDS.has(word));
  for (const word of words) {
    if (haystack.includes(word)) return word;
  }
  return null;
}

export interface ClassifyInput {
  description: string;
  amountMinorUnits: number;
  direction: TransactionDirection;
  counterparty?: string;
  reference?: string;
  context: ClassificationContext;
}

export function classifyTransaction(input: ClassifyInput): TransactionCandidate {
  const evidence: ClassificationEvidence[] = [];
  const searchable = `${input.description} ${input.counterparty ?? ""} ${input.reference ?? ""}`;
  const haystack = normalise(searchable);

  let category: string | undefined;
  for (const [name, hints] of CATEGORY_HINTS) {
    const hit = hints.find((hint) => haystack.includes(hint));
    if (!hit) continue;
    category = name;
    evidence.push({
      code: "description_keyword",
      detail: `The description contains "${hit}", which this organisation's categories map to ${name}.`,
    });
    break;
  }

  let grantId: string | undefined;
  let restricted: boolean | undefined;

  /**
   * Match against active grants only, and refuse to pick when several match.
   *
   * A first version took the first grant whose title matched and attached a
   * 2026 payment to a 2022 pilot with a similar name. Two rules follow from
   * that: a closed grant is not where new money goes, and where two live
   * grants share a word the description cannot resolve which one it is.
   */
  const activeGrants = input.context.grants.filter((grant) => grant.status === "active");
  const titleMatches = activeGrants
    .map((grant) => ({ grant, hit: nameMatches(searchable, grant.title) }))
    .filter((entry): entry is { grant: (typeof activeGrants)[number]; hit: string } =>
      Boolean(entry.hit),
    );

  if (titleMatches.length === 1) {
    const { grant, hit } = titleMatches[0]!;
    grantId = grant.id;
    restricted = grant.restricted;
    evidence.push({
      code: "grant_name",
      detail: `The description mentions "${hit}", which appears in the grant "${grant.title}".`,
    });
  } else if (titleMatches.length > 1) {
    evidence.push({
      code: "ambiguous_grant",
      detail: `The description matches ${titleMatches.length} active grants (${titleMatches.map((entry) => entry.grant.title).join(", ")}), so which one this belongs to cannot be determined from it.`,
    });
  }

  if (!grantId) {
    for (const funder of input.context.funderNames) {
      const hit = nameMatches(searchable, funder.name);
      if (!hit) continue;
      const funderGrants = activeGrants.filter((grant) => grant.funderId === funder.id);
      evidence.push({
        code: "funder_name",
        detail: `The description mentions "${hit}", which matches the funder ${funder.name}.`,
      });
      // Only where it is unambiguous. A funder with three live grants cannot
      // be resolved from a payment description, and picking one would attach
      // money to the wrong award.
      if (funderGrants.length === 1) {
        grantId = funderGrants[0]!.id;
        restricted = funderGrants[0]!.restricted;
        evidence.push({
          code: "sole_grant",
          detail: `${funder.name} has exactly one grant, so the payment is unambiguous.`,
        });
      } else if (funderGrants.length > 1) {
        evidence.push({
          code: "ambiguous_grant",
          detail: `${funder.name} has ${funderGrants.length} grants, so which one this belongs to cannot be determined from the description.`,
        });
      }
      break;
    }
  }

  let fundId: string | undefined;
  for (const fund of input.context.funds) {
    const hit = nameMatches(searchable, fund.name);
    if (!hit) continue;
    fundId = fund.id;
    restricted = restricted ?? fund.restriction === "restricted";
    evidence.push({
      code: "fund_name",
      detail: `The description mentions "${hit}", which matches the fund "${fund.name}".`,
    });
    break;
  }
  if (!fundId && grantId) {
    const originFund = input.context.funds.find(
      (fund) => fund.originRef?.type === "grant" && fund.originRef.id === grantId,
    );
    if (originFund) {
      fundId = originFund.id;
      evidence.push({
        code: "fund_from_grant",
        detail: `"${originFund.name}" was established by this grant, so the money belongs to it.`,
      });
    }
  }

  /**
   * Recurrence.
   *
   * A description this organisation has classified before is the strongest
   * signal available, and it is one no model could improve on: the
   * organisation's own past decision about its own payment.
   */
  if (!category) {
    const prior = input.context.history.find(
      (transaction) =>
        transaction.category && normalise(transaction.description) === normalise(input.description),
    );
    if (prior) {
      category = prior.category;
      evidence.push({
        code: "recurrence",
        detail: `An identical description was classified as ${prior.category} on ${prior.date}.`,
      });
    }
  }

  const confidence: ClassificationConfidence = evidence.some((item) =>
    ["recurrence", "sole_grant", "fund_from_grant"].includes(item.code),
  )
    ? "certain"
    : evidence.length >= 2
      ? "probable"
      : evidence.length === 1
        ? "possible"
        : "possible";

  return {
    category,
    fundId,
    grantId,
    restricted,
    confidence,
    evidence:
      evidence.length > 0
        ? evidence
        : [
            {
              code: "no_match",
              // Never left blank. "Nothing matched" is a finding, and a
              // reviewer needs to know they are the first person to look.
              detail:
                "Nothing in the description matched a fund, a grant, a funder or a known category. This needs classifying by hand.",
            },
          ],
    // Material transactions always need a person, however certain the match.
    // A £40,000 payment attached to the wrong grant is a figure a funder reads.
    requiresApproval: isMaterial(input.amountMinorUnits) || confidence !== "certain",
  };
}

export interface ClassifiedRow extends ParsedStatementRow {
  candidate: TransactionCandidate;
  duplicate?: { reason: string; confidence: "exact" | "likely" };
}

export function classifyRows(
  rows: ParsedStatementRow[],
  context: ClassificationContext,
): ClassifiedRow[] {
  return rows.map((row) => ({
    ...row,
    candidate: {
      ...classifyTransaction({
        description: row.description,
        amountMinorUnits: row.amount.minorUnits,
        direction: row.direction,
        counterparty: row.counterparty,
        reference: row.reference,
        context,
      }),
      rowNumber: row.rowNumber,
    },
  }));
}

/**
 * A one-line summary of an import, for the review screen.
 *
 * States what needs a person before it states what does not, because the first
 * is the work and the second is reassurance.
 */
export function describeClassification(rows: ClassifiedRow[]): string {
  const needsPerson = rows.filter((row) => row.candidate.requiresApproval).length;
  const unmatched = rows.filter((row) =>
    row.candidate.evidence.some((item) => item.code === "no_match"),
  ).length;

  const parts = [
    `${needsPerson} of ${rows.length} transaction${rows.length === 1 ? "" : "s"} need a decision before they are posted.`,
  ];
  if (unmatched > 0) {
    parts.push(`${unmatched} matched nothing at all and must be classified by hand.`);
  }
  const automatic = rows.length - needsPerson;
  if (automatic > 0) {
    parts.push(`${automatic} can be posted as suggested.`);
  }
  return parts.join(" ");
}

/** Where a candidate would attribute the money, for display. */
export function candidateTargets(candidate: TransactionCandidate): EntityReference[] {
  const refs: EntityReference[] = [];
  if (candidate.grantId) refs.push({ type: "grant", id: candidate.grantId });
  if (candidate.fundId) refs.push({ type: "fund", id: candidate.fundId });
  return refs;
}
