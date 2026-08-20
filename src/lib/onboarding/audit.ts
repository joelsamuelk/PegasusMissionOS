import type { CandidateField, ProfileCandidate } from "@/lib/organisation-intelligence/types";
import { FIELD_LABELS } from "@/lib/organisation-intelligence/types";

/**
 * The Organisation Audit.
 *
 * What Pegasus can say about an organisation once research has run, across the
 * nine areas the MG-3 brief names. Every judgement here is **deterministic**
 * and names the records that produced it. No model is consulted, and none
 * could improve it: these are counts and presence checks over the candidate
 * set, and a model asked to summarise them would only introduce the
 * possibility of being wrong.
 *
 * Two rules the brief states explicitly, both enforced in the types below
 * rather than left to whoever writes the copy.
 *
 * **Do not present inferred gaps as objective failures.** A gap is a statement
 * about *our search*, not about the organisation. `basis` on every observation
 * says what was looked at, and the vocabulary distinguishes "we did not find
 * it" from "it is not there". An organisation with an excellent safeguarding
 * policy that happens not to publish it must not be told it lacks one.
 *
 * **Explain evidence.** Every observation carries `evidence`: the specific
 * things counted. A readiness level with no evidence beneath it is a score,
 * and scores are what this product exists not to produce.
 */

export type ReadinessLevel =
  /** Enough is known to act on. */
  | "ready"
  /** Usable, with named gaps. */
  | "partial"
  /** Too little to act on yet. */
  | "limited"
  /** Nothing was found, and we say where we looked. */
  | "not_established";

export const READINESS_LABELS: Record<ReadinessLevel, string> = {
  ready: "Ready",
  partial: "Partly ready",
  limited: "Limited",
  not_established: "Not established",
};

export interface AuditObservation {
  /** What was counted or found. Shown, never summarised away. */
  statement: string;
  /** The specific values behind it, so the statement can be checked. */
  evidence: string[];
}

export interface AuditSection {
  key: AuditSectionKey;
  title: string;
  level: ReadinessLevel;
  /** One sentence stating what is known. Never a judgement of the organisation. */
  summary: string;
  observations: AuditObservation[];
  /** Where Pegasus looked. Makes "not found" a statement about the search. */
  basis: string;
  /** Concrete and optional. Never phrased as a failing. */
  suggestions: string[];
}

export type AuditSectionKey =
  | "understanding"
  | "needs_verification"
  | "appears_missing"
  | "funding_readiness"
  | "evidence_readiness"
  | "reporting_readiness"
  | "financial_visibility"
  | "impact_maturity"
  | "governance"
  | "digital";

export interface OrganisationAudit {
  sections: AuditSection[];
  /** Counts a person can check against the review screen. */
  totals: {
    established: number;
    fromRegister: number;
    needingConfirmation: number;
    conflicting: number;
    notFound: number;
    documentsRead: number;
  };
}

export interface AuditInput {
  candidates: ProfileCandidate[];
  conflictFields: CandidateField[];
  missingFields: CandidateField[];
  documents: { title: string; status: string; note?: string }[];
  pagesRead: number;
  /** Stages that could not run. Reported rather than hidden. */
  limitations: string[];
}

const has = (candidates: ProfileCandidate[], field: CandidateField) =>
  candidates.some((c) => c.field === field);

const valuesFor = (candidates: ProfileCandidate[], field: CandidateField) =>
  candidates.filter((c) => c.field === field).map((c) => c.value);

const countOf = (candidates: ProfileCandidate[], field: CandidateField) =>
  candidates.filter((c) => c.field === field).length;

/**
 * Grade on how many of a set of fields are present.
 *
 * Deliberately blunt and deliberately explainable: a weighted score would be
 * more precise and completely unjustifiable, because there is no basis for
 * asserting that a mission statement is 1.4 times as important as an operating
 * region.
 */
function grade(present: number, total: number): ReadinessLevel {
  if (present === 0) return "not_established";
  const ratio = present / total;
  if (ratio >= 0.75) return "ready";
  if (ratio >= 0.4) return "partial";
  return "limited";
}

function evidenceFor(candidates: ProfileCandidate[], fields: CandidateField[]): string[] {
  return fields
    .filter((field) => has(candidates, field))
    .map((field) => {
      const values = valuesFor(candidates, field);
      const shown = values.length > 1 ? `${values.length} found` : truncate(values[0]!);
      return `${FIELD_LABELS[field]}: ${shown}`;
    });
}

function truncate(value: string, length = 90): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function buildOrganisationAudit(input: AuditInput): OrganisationAudit {
  const { candidates, conflictFields, missingFields, documents, pagesRead } = input;

  const parsedDocuments = documents.filter((d) => d.status === "parsed");
  const unreadableDocuments = documents.filter((d) => d.status !== "parsed");

  const basis = describeBasis(pagesRead, parsedDocuments.length, candidates);

  const sections: AuditSection[] = [
    understanding(candidates, basis),
    needsVerification(candidates, conflictFields, basis),
    appearsMissing(missingFields, input.limitations, basis),
    fundingReadiness(candidates, basis),
    evidenceReadiness(candidates, documents, basis),
    reportingReadiness(candidates, documents, basis),
    financialVisibility(candidates, documents, basis),
    impactMaturity(candidates, basis),
    governance(candidates, basis),
    digital(candidates, pagesRead, unreadableDocuments, basis),
  ];

  return {
    sections,
    totals: {
      established: new Set(candidates.map((c) => c.field)).size,
      fromRegister: candidates.filter((c) => c.authority === "regulator").length,
      needingConfirmation: candidates.filter(
        (c) => c.authority !== "regulator" && !c.injectionSuspected,
      ).length,
      conflicting: conflictFields.length,
      notFound: missingFields.length,
      documentsRead: parsedDocuments.length,
    },
  };
}

function describeBasis(pages: number, documents: number, candidates: ProfileCandidate[]): string {
  const parts: string[] = [];
  if (pages > 0) parts.push(`${pages} page${pages === 1 ? "" : "s"} of your website`);
  if (documents > 0) parts.push(`${documents} document${documents === 1 ? "" : "s"}`);
  if (candidates.some((c) => c.authority === "regulator")) parts.push("the official register");
  if (parts.length === 0) return "no sources could be read";
  return parts.join(", ");
}

// --- Sections -------------------------------------------------------------

const IDENTITY_FIELDS: CandidateField[] = [
  "legalName",
  "missionStatement",
  "description",
  "communityServed",
  "operatingRegions",
  "programme",
];

function understanding(candidates: ProfileCandidate[], basis: string): AuditSection {
  const present = IDENTITY_FIELDS.filter((field) => has(candidates, field));

  return {
    key: "understanding",
    title: "What we understand",
    level: grade(present.length, IDENTITY_FIELDS.length),
    summary:
      present.length === 0
        ? "Pegasus could not establish the basics of what your organisation does."
        : `Pegasus established ${present.length} of ${IDENTITY_FIELDS.length} core facts about your organisation.`,
    observations: [
      { statement: "Established from your public information", evidence: evidenceFor(candidates, present) },
    ].filter((o) => o.evidence.length > 0),
    basis: `Read from ${basis}.`,
    suggestions: [],
  };
}

function needsVerification(
  candidates: ProfileCandidate[],
  conflictFields: CandidateField[],
  basis: string,
): AuditSection {
  const lowConfidence = candidates.filter((c) => c.confidence < 0.6);
  const injection = candidates.filter((c) => c.injectionSuspected);
  const extracted = candidates.filter((c) => c.authority !== "regulator");

  const observations: AuditObservation[] = [];

  if (extracted.length > 0) {
    observations.push({
      statement: `${extracted.length} values were read from sources rather than confirmed by a register, so each needs your confirmation before Pegasus treats it as true.`,
      evidence: [...new Set(extracted.map((c) => FIELD_LABELS[c.field]))].slice(0, 8),
    });
  }
  if (conflictFields.length > 0) {
    observations.push({
      statement: `${conflictFields.length} field${conflictFields.length === 1 ? "" : "s"} where your sources disagree. Pegasus will not choose for you.`,
      evidence: conflictFields.map((field) => FIELD_LABELS[field]),
    });
  }
  if (lowConfidence.length > 0) {
    observations.push({
      statement: `${lowConfidence.length} values Pegasus is not confident it read correctly.`,
      evidence: [...new Set(lowConfidence.map((c) => FIELD_LABELS[c.field]))].slice(0, 8),
    });
  }
  if (injection.length > 0) {
    observations.push({
      statement: `${injection.length} came from a page containing text shaped like an instruction. The text was neutralised; the values are worth reading.`,
      evidence: injection.map((c) => `${FIELD_LABELS[c.field]} (${c.sourceUrl})`),
    });
  }

  return {
    key: "needs_verification",
    title: "What needs verification",
    // Not a readiness judgement — this section counts work, and work is not a
    // failing. `partial` whenever there is any, so the level never reads as a
    // grade on the organisation.
    level: observations.length === 0 ? "ready" : "partial",
    summary:
      observations.length === 0
        ? "Nothing is waiting on you."
        : "These are Pegasus's readings, not established facts. Confirming them takes a few minutes and only has to happen once.",
    observations,
    basis: `Read from ${basis}.`,
    suggestions: [],
  };
}

function appearsMissing(
  missingFields: CandidateField[],
  limitations: string[],
  basis: string,
): AuditSection {
  const observations: AuditObservation[] = [];

  if (missingFields.length > 0) {
    observations.push({
      // The phrasing carries the rule: this is about what was found, not about
      // what exists.
      statement: `Pegasus did not find ${missingFields.length} thing${missingFields.length === 1 ? "" : "s"} it looked for. You may well have them. They may simply not be published.`,
      evidence: missingFields.map((field) => FIELD_LABELS[field]),
    });
  }
  if (limitations.length > 0) {
    observations.push({
      statement: "Some sources could not be read, so this picture is incomplete for reasons that are ours rather than yours.",
      evidence: limitations,
    });
  }

  return {
    key: "appears_missing",
    title: "What appears missing",
    level: missingFields.length === 0 ? "ready" : "partial",
    summary:
      missingFields.length === 0
        ? "Everything Pegasus looked for, it found."
        : "Not found in public sources. This is a statement about what Pegasus could see, not about your organisation.",
    observations,
    basis: `Searched ${basis}.`,
    suggestions:
      missingFields.length > 0
        ? ["Add these directly, or upload a recent annual report and let Pegasus read them from it."]
        : [],
  };
}

const FUNDING_FIELDS: CandidateField[] = [
  "missionStatement",
  "communityServed",
  "operatingRegions",
  "registrationNumber",
  "annualIncome",
  "programme",
];

function fundingReadiness(candidates: ProfileCandidate[], basis: string): AuditSection {
  const present = FUNDING_FIELDS.filter((field) => has(candidates, field));
  const absent = FUNDING_FIELDS.filter((field) => !has(candidates, field));

  return {
    key: "funding_readiness",
    title: "Funding readiness",
    level: grade(present.length, FUNDING_FIELDS.length),
    summary:
      present.length === 0
        ? "Pegasus cannot yet assess funding fit, because none of the fields funders match on were established."
        : `${present.length} of ${FUNDING_FIELDS.length} fields funders commonly match on are in place.`,
    observations: [
      { statement: "In place", evidence: evidenceFor(candidates, present) },
      {
        statement: "Not yet established. Each one is an eligibility question Pegasus cannot answer for you",
        evidence: absent.map((field) => FIELD_LABELS[field]),
      },
    ].filter((o) => o.evidence.length > 0),
    basis: `Assessed from ${basis}.`,
    suggestions: absent.length > 0 ? ["Completing these lets Pegasus assess fit automatically rather than asking you each time."] : [],
  };
}

function evidenceReadiness(
  candidates: ProfileCandidate[],
  documents: { title: string; status: string }[],
  basis: string,
): AuditSection {
  const reports = documents.filter((d) => d.status === "parsed").length;
  const outcomes = countOf(candidates, "outcome");
  const indicators = countOf(candidates, "indicator");

  const signals = [reports > 0, outcomes > 0, indicators > 0].filter(Boolean).length;

  return {
    key: "evidence_readiness",
    title: "Evidence readiness",
    level: grade(signals, 3),
    summary:
      signals === 0
        ? "No published evidence was found, so applications and reports would currently start from a blank page."
        : "Some evidence exists to draw on. Applications and reports can cite it rather than starting from nothing.",
    observations: [
      {
        statement: "Documents Pegasus could read",
        evidence: documents.filter((d) => d.status === "parsed").map((d) => d.title),
      },
      { statement: "Outcomes described publicly", evidence: valuesFor(candidates, "outcome").map(truncate) },
      { statement: "Indicators found", evidence: valuesFor(candidates, "indicator").map(truncate) },
    ].filter((o) => o.evidence.length > 0),
    basis: `Assessed from ${basis}.`,
    suggestions:
      signals < 3
        ? ["Uploading an evaluation or impact report gives Pegasus evidence to attach to outcomes."]
        : [],
  };
}

function reportingReadiness(
  candidates: ProfileCandidate[],
  documents: { title: string; status: string }[],
  basis: string,
): AuditSection {
  const publishedReports = documents.filter(
    (d) => d.status === "parsed" && /report|impact|annual/i.test(d.title),
  );
  const indicators = countOf(candidates, "indicator");

  const level: ReadinessLevel =
    publishedReports.length > 0 && indicators > 0
      ? "ready"
      : publishedReports.length > 0 || indicators > 0
        ? "partial"
        : "not_established";

  return {
    key: "reporting_readiness",
    title: "Reporting readiness",
    level,
    summary:
      level === "not_established"
        ? "Pegasus found no published reporting, so it cannot yet tell what a funder report from you looks like."
        : "Pegasus can see how you report, which is what report drafting will build on.",
    observations: [
      { statement: "Reports Pegasus read", evidence: publishedReports.map((d) => d.title) },
      {
        statement: "Measures a report could be built around",
        evidence: valuesFor(candidates, "indicator").map(truncate),
      },
    ].filter((o) => o.evidence.length > 0),
    basis: `Assessed from ${basis}.`,
    suggestions: [],
  };
}

function financialVisibility(
  candidates: ProfileCandidate[],
  documents: { title: string; status: string }[],
  basis: string,
): AuditSection {
  const income = valuesFor(candidates, "annualIncome");
  const expenditure = valuesFor(candidates, "annualExpenditure");
  const yearEnd = valuesFor(candidates, "financialYearEnd");
  const accounts = documents.filter((d) => d.status === "parsed" && /account/i.test(d.title));

  const signals = [income.length > 0, expenditure.length > 0, yearEnd.length > 0].filter(
    Boolean,
  ).length;

  return {
    key: "financial_visibility",
    title: "Financial visibility",
    level: grade(signals, 3),
    summary:
      signals === 0
        ? "No financial information was found, so runway, budgets and cost per outcome cannot be calculated."
        : "Headline figures are known. Transaction-level visibility comes from connecting your accounts.",
    observations: [
      { statement: "Income", evidence: income },
      { statement: "Expenditure", evidence: expenditure },
      { statement: "Financial year end", evidence: yearEnd },
      { statement: "Accounts read", evidence: accounts.map((d) => d.title) },
    ].filter((o) => o.evidence.length > 0),
    basis: `Assessed from ${basis}.`,
    // The honest limit, stated rather than implied: published totals are a
    // year old and cannot answer a question about this month.
    suggestions: [
      "Published figures are annual and historic. Runway and cost per outcome need transaction-level data, which Pegasus does not have yet.",
    ],
  };
}

function impactMaturity(candidates: ProfileCandidate[], basis: string): AuditSection {
  const framework = valuesFor(candidates, "impactFramework");
  const outcomes = valuesFor(candidates, "outcome");
  const indicators = valuesFor(candidates, "indicator");

  const level: ReadinessLevel =
    framework.length > 0 && outcomes.length > 0 && indicators.length > 0
      ? "ready"
      : outcomes.length > 0 && indicators.length > 0
        ? "partial"
        : outcomes.length > 0 || indicators.length > 0
          ? "limited"
          : "not_established";

  return {
    key: "impact_maturity",
    title: "Impact measurement maturity",
    level,
    summary:
      level === "not_established"
        ? "Pegasus found no published outcomes or indicators. Many organisations measure carefully without publishing it."
        : level === "ready"
          ? "A framework, outcomes and indicators were all found, which is an unusually complete public picture."
          : "Some measurement is described publicly, with gaps between the parts.",
    observations: [
      { statement: "Framework named", evidence: framework },
      { statement: "Outcomes described", evidence: outcomes.map(truncate) },
      { statement: "Indicators found", evidence: indicators.map(truncate) },
    ].filter((o) => o.evidence.length > 0),
    basis: `Assessed from ${basis}.`,
    suggestions: [],
  };
}

const GOVERNANCE_FIELDS: CandidateField[] = [
  "registrationNumber",
  "trustee",
  "safeguardingStatus",
  "policy",
  "registeredAddress",
];

function governance(candidates: ProfileCandidate[], basis: string): AuditSection {
  const present = GOVERNANCE_FIELDS.filter((field) => has(candidates, field));
  const status = valuesFor(candidates, "regulatorStatus");

  return {
    key: "governance",
    title: "Governance information",
    level: grade(present.length, GOVERNANCE_FIELDS.length),
    summary:
      present.length === 0
        ? "No governance information was found in public sources."
        : `${present.length} of ${GOVERNANCE_FIELDS.length} governance details were found.`,
    observations: [
      { statement: "Found", evidence: evidenceFor(candidates, present) },
      { statement: "Register status", evidence: status },
      {
        statement: "Not found in public sources",
        evidence: GOVERNANCE_FIELDS.filter((f) => !has(candidates, f)).map((f) => FIELD_LABELS[f]),
      },
    ].filter((o) => o.evidence.length > 0),
    basis: `Assessed from ${basis}.`,
    suggestions: [],
  };
}

function digital(
  candidates: ProfileCandidate[],
  pagesRead: number,
  unreadableDocuments: { title: string; note?: string }[],
  basis: string,
): AuditSection {
  const observations: AuditObservation[] = [];

  if (pagesRead > 0) {
    observations.push({
      statement: `Pegasus read ${pagesRead} page${pagesRead === 1 ? "" : "s"} of your website.`,
      evidence: [],
    });
  }

  const structured = candidates.filter((c) => c.method === "json-ld" || c.method === "microdata");
  if (structured.length > 0) {
    observations.push({
      statement:
        `Your site publishes ${structured.length} values as structured data, which search engines and ` +
        "funder directories read directly.",
      evidence: [...new Set(structured.map((c) => FIELD_LABELS[c.field]))],
    });
  } else if (pagesRead > 0) {
    observations.push({
      // An observation, with the reason it might matter. Not a fault.
      statement:
        "Your site does not publish structured organisation data. Adding it helps search engines and " +
        "directories describe you accurately, and it is a change to your site rather than to Pegasus.",
      evidence: [],
    });
  }

  if (unreadableDocuments.length > 0) {
    observations.push({
      statement: `${unreadableDocuments.length} document${unreadableDocuments.length === 1 ? "" : "s"} could not be read.`,
      evidence: unreadableDocuments.map((d) => `${d.title}${d.note ? `: ${d.note}` : ""}`),
    });
  }

  return {
    key: "digital",
    title: "Digital and operational observations",
    level: pagesRead > 0 ? "ready" : "not_established",
    summary:
      pagesRead === 0
        ? "Pegasus could not read your website, so it has no observations about it."
        : "Observations about your public presence, offered as information rather than as a checklist.",
    observations,
    basis: `Observed from ${basis}.`,
    suggestions: [],
  };
}
