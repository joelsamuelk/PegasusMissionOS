/**
 * The Trust Centre, as checkable statements.
 *
 * The brief asks for product architecture covering security, privacy, AI use,
 * data location, subprocessors, availability, backup, retention, permissions
 * and audit — and then adds the line that decides how this is built: **do not
 * claim certifications not actually obtained.**
 *
 * The obvious implementation is a page of reassuring paragraphs. This is a
 * list of statements, each with a status, and **three of the statuses are
 * admissions**. An organisation deciding whether to put their finances into a
 * product learns more from what a vendor is willing to say it has not done
 * than from what it says it has, and a trust page with no `not_yet` rows is a
 * marketing page.
 *
 * `evidence` names where a statement can be checked. A claim with nowhere to
 * check it is a claim, and the test beside this file requires every `upheld`
 * statement to carry one.
 */

export type TrustArea =
  | "security"
  | "privacy"
  | "ai"
  | "data_location"
  | "subprocessors"
  | "availability"
  | "backup"
  | "retention"
  | "permissions"
  | "audit";

export type TrustStatus =
  /** True today, and checkable. */
  | "upheld"
  /** True in the application layer and not yet proven against storage. */
  | "partial"
  /** Not true yet, and here so nobody has to discover it. */
  | "not_yet"
  /** Deliberately not done, with a reason. */
  | "declined";

export interface TrustStatement {
  area: TrustArea;
  statement: string;
  status: TrustStatus;
  /** Where it can be checked, for anything claimed as upheld. */
  evidence?: string;
  /** What would make it true, for anything not. */
  wouldRequire?: string;
}

export const TRUST_STATEMENTS: TrustStatement[] = [
  // --- Security ---------------------------------------------------------
  {
    area: "security",
    statement:
      "Every read and write is scoped to one organisation, enforced in the data layer and proven by a two-tenant test suite that runs on every build.",
    status: "upheld",
    evidence:
      "`tests/fixtures/two-tenant.ts` and the isolation assertions across every phase suite. Removing the scoping filter fails 25 tests across 6 files.",
  },
  {
    area: "security",
    statement:
      "Row level security is enabled on every table, so tenant isolation does not rest on the application alone.",
    status: "partial",
    evidence:
      "`tests/unit/schema-invariants.test.ts` fails the build if a migration creates a table without enabling it.",
    wouldRequire:
      "A provisioned Postgres database. The policies are reviewed SQL and no code has ever executed them, so today this is one layer of defence rather than two.",
  },
  {
    area: "security",
    statement:
      "No server action mutates anything without checking a capability first, and a deliberately public one must declare itself with a reason.",
    status: "upheld",
    evidence:
      "`tests/unit/data-boundary.test.ts` counts actions against gates and fails the build on a shortfall. The two public form actions live in their own file so the exemption covers only them.",
  },
  {
    area: "security",
    statement:
      "Provider credentials are never stored in a tenant-readable row. The integration schema has nowhere to put one.",
    status: "upheld",
    evidence:
      "`integration_connections.credential_ref` is a pointer, and the migration records why a column that could hold a secret eventually would.",
  },
  {
    area: "security",
    statement: "Pegasus has completed an independent security audit or certification.",
    // The line the brief draws. Saying nothing here would be read as yes.
    status: "not_yet",
    wouldRequire:
      "An audit. Nothing here is certified against ISO 27001, SOC 2 or Cyber Essentials, and no part of this product should be described as if it were.",
  },

  // --- Privacy ----------------------------------------------------------
  {
    area: "privacy",
    statement:
      "Every form field states how sensitive it is before anybody answers it, and the classification decides whether the answer can reach a model, what retention applies and who can read it.",
    status: "upheld",
    evidence: "`FieldSensitivity` is not nullable and has no default. `tests/unit/forms.test.ts`.",
  },
  {
    area: "privacy",
    statement:
      "There is no beneficiary record. Impact is measured through indicators and evidence, which is both safer and sufficient.",
    status: "upheld",
    evidence:
      "`MISSION_GRAPH_ARCHITECTURE.md` §8. `Person` carries no date of birth, address, household or wealth field; the one address in the product is on a Gift Aid declaration, because Gift Aid is the lawful basis for holding it.",
  },
  {
    area: "privacy",
    statement:
      "A form collecting special category data cannot be published without a lawful basis and an explicit retention period, and cannot be served at a public URL.",
    status: "upheld",
    evidence: "`checkPublishable` refuses. Three tests assert each refusal.",
  },
  {
    area: "privacy",
    statement:
      "An organisation can export everything it holds, in a structured form it can read without this product.",
    status: "upheld",
    evidence: "`buildDataExport`, covering every repository the boundary exposes.",
  },
  {
    area: "privacy",
    statement:
      "An organisation can delete its data, and is told beforehand exactly what will survive and why.",
    status: "partial",
    evidence: "`planDeletion` produces the honest answer before anything is removed.",
    wouldRequire:
      "Execution against a real database. The plan is accurate and nothing performs it yet.",
  },

  // --- AI ---------------------------------------------------------------
  {
    area: "ai",
    statement:
      "Every place AI is used is listed, with what it sees, what it can never see, and what it produces.",
    status: "upheld",
    evidence:
      "`AI_REGISTER`. A test fails the build if a feature is added without an entry, which is the only way a register like this stays true.",
  },
  {
    area: "ai",
    statement: "No AI output changes a record. Every one is a draft a person reads first.",
    status: "upheld",
    evidence:
      "Every register entry declares `writesWithoutReview: false`, and the type admits no other value. In automations, the one action that produces something external drafts it and creates a task; nothing in the product can send it.",
  },
  {
    area: "ai",
    statement:
      "A generation claiming a source it was never offered has its output discarded rather than recorded with false provenance.",
    status: "upheld",
    evidence: "`GroundingViolationError`, thrown by `observeGrounding`.",
  },
  {
    area: "ai",
    statement: "Turning AI off stops context being assembled at all.",
    status: "upheld",
    evidence:
      "`authoriseAi` checks the workspace setting before any context builder runs. A test asserts a complete brief with no prose when it is off.",
  },
  {
    area: "ai",
    statement:
      "The model provider's data retention has been configured, and a data processing agreement is in place.",
    status: "not_yet",
    wouldRequire:
      "A live provider. Every generation in this build runs against a deterministic local mock, so there is no provider relationship to configure and nothing has left this system.",
  },

  // --- Data location and subprocessors ----------------------------------
  {
    area: "data_location",
    statement: "Where customer data is stored is documented and chosen.",
    status: "not_yet",
    wouldRequire:
      "A provisioned database. There is no customer data anywhere: the product runs against a seeded in-memory workspace.",
  },
  {
    area: "subprocessors",
    statement: "The list of subprocessors is published and kept current.",
    status: "not_yet",
    wouldRequire:
      "Subprocessors. None is engaged: no AI provider, no email provider, no payment provider and no storage provider is connected in this build.",
  },

  // --- Availability and backup ------------------------------------------
  {
    area: "availability",
    statement: "Uptime is monitored and an availability commitment is published.",
    status: "not_yet",
    wouldRequire: "A production deployment with real users.",
  },
  {
    area: "backup",
    statement: "Backups are taken and restores are tested.",
    status: "not_yet",
    wouldRequire:
      "A database. This is the item most often claimed and least often tested, and the honest status is that neither has happened.",
  },

  // --- Retention, permissions, audit -------------------------------------
  {
    area: "retention",
    statement: "What is kept, for how long, and what cannot be deleted is written down.",
    status: "upheld",
    evidence: "`RETENTION_RULES`, including the one entry that records a gap rather than a policy.",
  },
  {
    area: "permissions",
    statement:
      "Seven roles map to explicit capabilities, and approving is a different capability from editing.",
    status: "upheld",
    evidence:
      "`lib/permissions`. A trustee reviewer holds `reports:approve` and not `reports:manage`, and an automation cannot move a report into `approved` at all.",
  },
  {
    area: "permissions",
    statement:
      "External parties reach data through a separate identity model, one record at a time, projected through a field allowlist.",
    status: "upheld",
    evidence:
      "`lib/portals`. Access is never inherited from a related record, and a field nobody listed never appears.",
  },
  {
    area: "audit",
    statement:
      "Every consequential action is recorded, and the audit trail cannot be edited or deleted.",
    status: "partial",
    evidence: "Append-only row level security on `audit_events`, with no update or delete policy.",
    wouldRequire:
      "A database to enforce it. In the current build the append-only property is a convention of the adapter rather than a constraint.",
  },
  {
    area: "audit",
    statement:
      "Anything a machine did without a person present is recorded, including the runs that did nothing.",
    status: "upheld",
    evidence:
      "`automation_runs` records a run whether or not it matched, with the condition trace. `sync_runs` records a refusal as readily as a success.",
  },

  // --- Enterprise -------------------------------------------------------
  {
    area: "security",
    statement: "Single sign-on, SCIM provisioning and SAML are available.",
    status: "declined",
    wouldRequire:
      "Demand. The brief is explicit that expensive enterprise features should not be built before anybody has asked, and no customer has. The permission model is designed so that adding them later is a change to authentication rather than to authorisation.",
  },
  {
    area: "data_location",
    statement: "Data residency can be chosen per customer.",
    status: "declined",
    wouldRequire:
      "A commercial reason. Building multi-region storage for a product with no customers would be the most expensive way available to demonstrate seriousness.",
  },
];

export function unmetStatements(): TrustStatement[] {
  return TRUST_STATEMENTS.filter(
    (statement) => statement.status === "not_yet" || statement.status === "partial",
  );
}
