import { beforeEach, describe, expect, it } from "vitest";
import { OrganisationResearchService } from "@/server/onboarding/research-service";
import { DocumentDiscoveryService } from "@/server/onboarding/document-service";
import { buildOnboardingContext } from "@/lib/onboarding/context-builder";
import { buildOrganisationAudit } from "@/lib/onboarding/audit";
import { buildRecommendations } from "@/lib/onboarding/recommendations";
import { reconcile } from "@/lib/organisation-intelligence/reconcile";
import { parseRobots } from "@/server/onboarding/fetcher";
import { createFixtureFetcher, createIdFactory, FIXED_NOW } from "../fixtures/fixture-website";
import {
  createFixtureRegister,
  FIXTURE_CHARITY_NUMBER,
  FIXTURE_RECORD,
} from "../fixtures/registry";
import { createTwoTenantHarness, type TwoTenantHarness } from "../fixtures/two-tenant";
import { buildDocx, buildPdf } from "../fixtures/documents";

/**
 * MG-3, zero-to-useful onboarding.
 *
 * The acceptance test the brief sets:
 *
 *   A new organisation can enter name + website + registration information and
 *   Mission OS creates a useful candidate organisational context without
 *   requiring them to manually populate dozens of forms. Human review remains
 *   the boundary between extracted information and trusted organisational
 *   truth.
 *
 * Both halves are asserted here. The first is easy to satisfy and easy to
 * fake; the second is what makes it safe, so most of this file is about the
 * boundary rather than about the extraction.
 */

const INPUT = {
  name: "Northstar Community Foundation",
  websiteUrl: "https://northstarcf.org.uk",
  country: "GB",
  registrationNumber: FIXTURE_CHARITY_NUMBER,
};

function createService(
  harness: TwoTenantHarness,
  options: {
    register?: ReturnType<typeof createFixtureRegister>;
    fetcher?: ReturnType<typeof createFixtureFetcher>;
    fetchBytes?: (url: string) => Promise<Uint8Array | null>;
  } = {},
) {
  return new OrganisationResearchService({
    repo: harness.repo,
    fetcher: options.fetcher ?? createFixtureFetcher(),
    registers: [options.register ?? createFixtureRegister()],
    now: FIXED_NOW,
    makeId: createIdFactory(),
    fetchBytes: options.fetchBytes,
  });
}

describe("the acceptance test: four fields in, organisational context out", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("produces a useful candidate context from name, website and registration alone", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);

    // "Useful" is not a feeling. It means the fields a funding application
    // actually asks for were established without anyone typing them.
    const fields = new Set(result.candidates.map((c) => c.field));
    expect(fields.has("legalName")).toBe(true);
    expect(fields.has("registrationNumber")).toBe(true);
    expect(fields.has("registeredAddress")).toBe(true);
    expect(fields.has("missionStatement")).toBe(true);
    expect(fields.has("annualIncome")).toBe(true);

    expect(result.candidates.length).toBeGreaterThan(10);
    expect(result.sources.length).toBeGreaterThan(1);
  });

  it("reads both the register and the website, and says which said what", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);

    const fromRegister = result.candidates.filter((c) => c.method === "registry");
    const fromWebsite = result.candidates.filter((c) => c.method !== "registry");

    expect(fromRegister.length).toBeGreaterThan(0);
    expect(fromWebsite.length).toBeGreaterThan(0);
    // Every value knows where it came from and where in it.
    expect(result.candidates.every((c) => c.sourceUrl && c.locator)).toBe(true);
  });

  it("persists the run, so refreshing does not re-crawl someone's website", async () => {
    await createService(h).run(h.ctxA, INPUT);

    const run = await h.repo.onboarding.latestRun(h.ctxA);
    expect(run).not.toBeNull();
    expect(run!.status).toBe("awaiting_review");
    expect(run!.counts.candidatesFound).toBeGreaterThan(0);

    const stored = await h.repo.onboarding.candidates(h.ctxA, run!.id);
    expect(stored.length).toBe(run!.counts.candidatesFound);
  });

  it("groups findings so a person can review them rather than face a list", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const context = buildOnboardingContext({
      candidates: result.candidates,
      reconciliation: result.reconciliation,
    });

    expect(context.byGroup.verified.length).toBeGreaterThan(0);
    expect(context.findings.every((f) => f.reason.length > 0)).toBe(true);
    // Missing is a group, not an absence.
    expect(Array.isArray(context.missing)).toBe(true);
  });

  it("reads a headed list without swallowing the paragraph beneath it", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const programmes = result.candidates
      .filter((c) => c.field === "programme")
      .map((c) => c.value);

    expect(programmes).toEqual(
      expect.arrayContaining(["Youth Futures", "Digital Bridge", "Family Anchor"]),
    );
    // A heading followed by prose is a section title, not a list. Taking the
    // paragraph as a fourth programme is the classic failure here.
    expect(programmes.some((p) => p.length > 120)).toBe(false);
    expect(programmes.some((p) => /delivered with local partners/i.test(p))).toBe(false);
  });

  it("proposes graph entities rather than creating them", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const context = buildOnboardingContext({
      candidates: result.candidates,
      reconciliation: result.reconciliation,
    });

    // Programmes appear on the website, so they are proposed.
    expect(context.proposals.length).toBeGreaterThan(0);

    // And nothing was written to the graph by research.
    const programmesBefore = await h.repo.programmes.list(h.ctxA);
    expect(programmesBefore.every((p) => p.id.startsWith("prog-"))).toBe(true);
  });
});

/**
 * The half of the acceptance test that makes the other half safe.
 */
describe("human review is the boundary", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("writes no claim until a person decides", async () => {
    const before = (await h.repo.claims.list(h.ctxA)).length;
    await createService(h).run(h.ctxA, INPUT);

    expect((await h.repo.claims.list(h.ctxA)).length).toBe(before);
  });

  it("never marks an extracted value verified, however confident", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);

    // The register's own number is extracted at 0.99 confidence and is still
    // `ai_extracted`. Confidence is not verification.
    const registrationNumber = result.candidates.find((c) => c.field === "registrationNumber");
    expect(registrationNumber!.confidence).toBeGreaterThan(0.95);
    expect(registrationNumber!.verificationState).toBe("ai_extracted");

    expect(result.candidates.every((c) => c.verificationState !== "verified")).toBe(true);
  });

  it("a confirmation produces a verified claim attributed to the reviewer", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const run = (await h.repo.onboarding.latestRun(h.ctxA))!;
    const candidate = (await h.repo.onboarding.candidates(h.ctxA, run.id))[0]!;

    const decision = await h.repo.onboarding.decide(h.ctxA, candidate.id, "confirm");
    expect(decision?.claimId).toBeTruthy();

    const claim = await h.repo.claims.get(h.ctxA, decision!.claimId!);
    expect(claim!.verification).toBe("verified");
    expect(claim!.verifiedBy).toBe(h.ctxA.userId);
    // The source survives the confirmation, so the value stays traceable.
    expect(claim!.sources.length).toBeGreaterThan(0);
    void result;
  });

  it("an edit is `provided`, because the value became the human's", async () => {
    await createService(h).run(h.ctxA, INPUT);
    const run = (await h.repo.onboarding.latestRun(h.ctxA))!;
    const candidate = (await h.repo.onboarding.candidates(h.ctxA, run.id))[0]!;

    const decision = await h.repo.onboarding.decide(
      h.ctxA,
      candidate.id,
      "edit",
      "A corrected value",
    );
    const claim = await h.repo.claims.get(h.ctxA, decision!.claimId!);

    expect(claim!.verification).toBe("provided");
    expect(claim!.text).toBe("A corrected value");
  });

  it("a rejection writes nothing but the decision", async () => {
    await createService(h).run(h.ctxA, INPUT);
    const run = (await h.repo.onboarding.latestRun(h.ctxA))!;
    const candidate = (await h.repo.onboarding.candidates(h.ctxA, run.id))[0]!;

    const before = (await h.repo.claims.list(h.ctxA)).length;
    const decision = await h.repo.onboarding.decide(h.ctxA, candidate.id, "reject");

    expect(decision?.claimId).toBeUndefined();
    expect((await h.repo.claims.list(h.ctxA)).length).toBe(before);

    const decisions = await h.repo.onboarding.decisions(h.ctxA, run.id);
    expect(decisions[candidate.id]!.decision).toBe("reject");
  });

  it("records every decision against an actor", async () => {
    await createService(h).run(h.ctxA, INPUT);
    const run = (await h.repo.onboarding.latestRun(h.ctxA))!;
    const candidate = (await h.repo.onboarding.candidates(h.ctxA, run.id))[0]!;

    await h.repo.onboarding.decide(h.ctxA, candidate.id, "confirm");
    const decisions = await h.repo.onboarding.decisions(h.ctxA, run.id);

    expect(decisions[candidate.id]!.by).toBe(h.ctxA.userId);
  });

  it("does not decide on another tenant's candidate", async () => {
    await createService(h).run(h.ctxA, INPUT);
    const run = (await h.repo.onboarding.latestRun(h.ctxA))!;
    const candidate = (await h.repo.onboarding.candidates(h.ctxA, run.id))[0]!;

    expect(await h.repo.onboarding.decide(h.ctxB, candidate.id, "confirm")).toBeNull();
  });

  it("does not show one tenant's research to another", async () => {
    await createService(h).run(h.ctxA, INPUT);

    expect(await h.repo.onboarding.latestRun(h.ctxB)).toBeNull();
    expect(await h.repo.onboarding.runs(h.ctxB)).toEqual([]);
  });
});

describe("identity resolution", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("raises a discrepancy when the register holds a different name", async () => {
    const register = createFixtureRegister({
      record: { ...FIXTURE_RECORD, legalName: "Completely Different Trust" },
    });
    const result = await createService(h, { register }).run(h.ctxA, INPUT);

    expect(result.identity.discrepancies.some((d) => d.field === "name")).toBe(true);
  });

  it("tolerates ordinary naming variation without crying wolf", async () => {
    const register = createFixtureRegister({
      record: { ...FIXTURE_RECORD, legalName: "NORTHSTAR COMMUNITY FOUNDATION (THE)" },
    });
    const result = await createService(h, { register }).run(h.ctxA, INPUT);

    expect(result.identity.discrepancies.some((d) => d.field === "name")).toBe(false);
  });

  it("flags a removed charity rather than proceeding quietly", async () => {
    const register = createFixtureRegister({
      record: { ...FIXTURE_RECORD, status: "removed" },
    });
    const result = await createService(h, { register }).run(h.ctxA, INPUT);

    expect(result.identity.discrepancies.some((d) => d.field === "status")).toBe(true);
  });

  it("reports an unreachable register as an outage, not as an absent record", async () => {
    // The distinction that matters most in this file. An outage reported as
    // "not registered" is a false statement about a charity on a page funders
    // will read.
    const register = createFixtureRegister({ unreachable: true });
    const result = await createService(h, { register }).run(h.ctxA, INPUT);

    expect(result.identity.records).toEqual([]);
    expect(result.identity.unavailableRegisters).toHaveLength(1);
    expect(result.identity.unavailableRegisters[0]!.reason).toMatch(/could not be reached/i);
    // And it is surfaced, not swallowed.
    expect(result.limitations.some((l) => /could not be reached/i.test(l))).toBe(true);
  });

  it("says so when no register is connected for the country", async () => {
    const result = await createService(h).run(h.ctxA, { ...INPUT, country: "FR" });

    expect(result.identity.unavailableRegisters).toHaveLength(1);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("continues without a register when none was asked for", async () => {
    const result = await createService(h).run(h.ctxA, {
      ...INPUT,
      registrationNumber: undefined,
    });

    expect(result.identity.records).toEqual([]);
    // The website still produced something.
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

describe("degrading rather than failing", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("still finishes when the website cannot be read", async () => {
    const result = await createService(h, { fetcher: createFixtureFetcher({ fail: true }) }).run(
      h.ctxA,
      INPUT,
    );

    // The register carried it.
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.limitations.length).toBeGreaterThan(0);

    const run = await h.repo.onboarding.latestRun(h.ctxA);
    expect(run!.status).toBe("awaiting_review");
  });

  it("marks a run degraded when nothing at all could be established", async () => {
    const result = await createService(h, {
      fetcher: createFixtureFetcher({ fail: true }),
      register: createFixtureRegister({ record: null }),
    }).run(h.ctxA, { name: "Nowhere Trust" });

    expect(result.candidates).toEqual([]);
    const run = await h.repo.onboarding.latestRun(h.ctxA);
    // "We could not look" and "there is nothing" are different, and the run
    // says which.
    expect(run!.degraded).toBeDefined();
    expect(run!.degraded!.guidance).toBeTruthy();
  });
});

describe("document ingestion", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const service = (harness: TwoTenantHarness) =>
    new DocumentDiscoveryService({
      repo: harness.repo,
      now: FIXED_NOW,
      makeId: createIdFactory(),
    });

  const REPORT = [
    "Northstar Community Foundation annual report 2026",
    "Our mission is to help young people aged sixteen to twenty five in West Yorkshire move into education, employment or training.",
    "Our vision is a city region where no young person is written off before they have begun.",
    "Total income for the year was £482,000 and total expenditure was £449,000.",
    "Our programmes",
    "Youth Futures",
    "Digital Bridge",
    "Family Anchor",
  ];

  it("parses an uploaded document and extracts located candidates", async () => {
    const result = await service(h).ingest(h.ctxA, {
      bytes: buildDocx(REPORT),
      fileName: "annual-report-2026.docx",
      kind: "annual_report",
      origin: "upload",
      authority: "organisation",
    });

    expect(result.parse.status).toBe("parsed");
    const fields = result.candidates.map((c) => c.field);
    expect(fields).toContain("missionStatement");
    expect(fields).toContain("vision");
    expect(fields).toContain("annualIncome");
    expect(fields).toContain("programme");

    // Each carries a locator into the document, so a reviewer can check it.
    expect(result.candidates.every((c) => c.locator.length > 0)).toBe(true);
    expect(result.candidates.every((c) => c.documentId === result.documentId)).toBe(true);
  });

  it("records extracted claims against the document as well as the profile", async () => {
    const result = await service(h).ingest(h.ctxA, {
      bytes: buildDocx(REPORT),
      fileName: "annual-report-2026.docx",
      kind: "annual_report",
      origin: "upload",
      authority: "organisation",
    });

    const claims = await h.repo.documents.extractedClaims(h.ctxA, result.documentId);
    expect(claims.length).toBe(result.candidates.length);
    // Pending until reviewed. Extraction does not approve itself.
    expect(claims.every((c) => c.status === "pending")).toBe(true);
    expect(claims.every((c) => c.claimId === undefined)).toBe(true);
  });

  it("does not duplicate the review queue when the same file is uploaded twice", async () => {
    const bytes = buildDocx(REPORT);
    const first = await service(h).ingest(h.ctxA, {
      bytes,
      fileName: "report.docx",
      kind: "annual_report",
      origin: "upload",
      authority: "organisation",
    });
    const second = await service(h).ingest(h.ctxA, {
      bytes,
      fileName: "report-copy.docx",
      kind: "annual_report",
      origin: "upload",
      authority: "organisation",
    });

    expect(second.deduplicated).toBe(true);
    expect(second.documentId).toBe(first.documentId);
    expect(second.candidates).toEqual([]);
    expect((await h.repo.documents.list(h.ctxA))).toHaveLength(1);
  });

  it("records an unreadable document with its reason rather than dropping it", async () => {
    const result = await service(h).ingest(h.ctxA, {
      // A PDF with no readable text: the scanned-document case.
      bytes: buildPdf(["x"]),
      fileName: "scan.pdf",
      kind: "annual_report",
      origin: "upload",
      authority: "organisation",
    });

    expect(result.parse.status).not.toBe("parsed");
    expect(result.candidates).toEqual([]);

    const version = await h.repo.documents.currentVersion(h.ctxA, result.documentId);
    expect(version!.parseStatus).not.toBe("parsed");
    // The reason is on the record, so the user can act on it.
    expect(version!.parseNote).toBeTruthy();
  });

  it("defaults documents likely to name individuals to personal data", async () => {
    const result = await service(h).ingest(h.ctxA, {
      bytes: buildDocx(REPORT),
      fileName: "evaluation.docx",
      kind: "evaluation",
      origin: "upload",
      authority: "organisation",
    });

    const document = await h.repo.documents.get(h.ctxA, result.documentId);
    // The cautious answer is the automatic one; a person can lower it.
    expect(document!.containsPersonalData).toBe(true);
  });

  it("keeps documents inside the tenant that uploaded them", async () => {
    const result = await service(h).ingest(h.ctxA, {
      bytes: buildDocx(REPORT),
      fileName: "report.docx",
      kind: "annual_report",
      origin: "upload",
      authority: "organisation",
    });

    expect(await h.repo.documents.get(h.ctxB, result.documentId)).toBeNull();
    expect(await h.repo.documents.list(h.ctxB)).toEqual([]);
    expect(await h.repo.documents.extractedClaims(h.ctxB, result.documentId)).toEqual([]);
  });

  it("finds document links on pages rather than guessing at URLs", () => {
    const discovered = service(h).discoverFromPages(
      [
        {
          url: "https://northstarcf.org.uk/reports",
          html: `<a href="/downloads/annual-report-2026.pdf">Annual report 2026</a>
                 <a href="https://elsewhere.org/thing.pdf">A partner's report</a>
                 <a href="/about">About us</a>`,
        },
      ],
      "https://northstarcf.org.uk",
    );

    expect(discovered).toHaveLength(2);
    // A document on the organisation's own site speaks for the organisation;
    // one hosted elsewhere is only supporting.
    const own = discovered.find((d) => d.url.includes("northstarcf"));
    const other = discovered.find((d) => d.url.includes("elsewhere"));
    expect(own!.authority).toBe("organisation");
    expect(other!.authority).toBe("supporting");
    // The HTML page is not a document.
    expect(discovered.every((d) => !d.url.endsWith("/about"))).toBe(true);
  });
});

describe("the organisation audit", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("covers every section the brief names", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const context = buildOnboardingContext({
      candidates: result.candidates,
      reconciliation: result.reconciliation,
    });

    const audit = buildOrganisationAudit({
      candidates: result.candidates,
      conflictFields: result.reconciliation.conflicts.map((c) => c.field),
      missingFields: context.missing.map((m) => m.field),
      documents: [],
      pagesRead: result.run.counts.pagesRead,
      limitations: result.limitations,
    });

    expect(audit.sections.map((s) => s.key)).toEqual([
      "understanding",
      "needs_verification",
      "appears_missing",
      "funding_readiness",
      "evidence_readiness",
      "reporting_readiness",
      "financial_visibility",
      "impact_maturity",
      "governance",
      "digital",
    ]);
  });

  it("states what it looked at, so a gap is about the search", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const context = buildOnboardingContext({
      candidates: result.candidates,
      reconciliation: result.reconciliation,
    });
    const audit = buildOrganisationAudit({
      candidates: result.candidates,
      conflictFields: [],
      missingFields: context.missing.map((m) => m.field),
      documents: [],
      pagesRead: result.run.counts.pagesRead,
      limitations: [],
    });

    // Every section says where it looked. Without this, "not found" reads as
    // "you do not have one".
    expect(audit.sections.every((s) => s.basis.length > 0)).toBe(true);

    const missing = audit.sections.find((s) => s.key === "appears_missing")!;
    expect(missing.summary).toMatch(/what Pegasus could see/i);
  });

  it("shows the evidence behind every observation", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const audit = buildOrganisationAudit({
      candidates: result.candidates,
      conflictFields: [],
      missingFields: [],
      documents: [],
      pagesRead: result.run.counts.pagesRead,
      limitations: [],
    });

    const understanding = audit.sections.find((s) => s.key === "understanding")!;
    expect(understanding.observations.length).toBeGreaterThan(0);
    expect(understanding.observations[0]!.evidence.length).toBeGreaterThan(0);
  });

  it("is honest that published figures cannot answer a question about this month", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const audit = buildOrganisationAudit({
      candidates: result.candidates,
      conflictFields: [],
      missingFields: [],
      documents: [],
      pagesRead: 3,
      limitations: [],
    });

    const finance = audit.sections.find((s) => s.key === "financial_visibility")!;
    expect(finance.suggestions.join(" ")).toMatch(/annual and historic/i);
  });
});

describe("first-value recommendations", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("grounds every recommendation in something that was found", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const context = buildOnboardingContext({
      candidates: result.candidates,
      reconciliation: result.reconciliation,
    });

    const recommendations = buildRecommendations({
      candidates: result.candidates,
      conflictFields: result.reconciliation.conflicts.map((c) => c.field),
      missingFields: context.missing.map((m) => m.field),
      opportunities: await h.repo.funding.listOpportunities(h.ctxA),
      grants: await h.repo.grants.list(h.ctxA),
      grantReports: await h.repo.grants.allReports(h.ctxA),
      now: FIXED_NOW(),
      makeId: createIdFactory(),
    });

    expect(recommendations.length).toBeGreaterThan(0);
    // The rule the whole module exists for.
    expect(recommendations.every((r) => r.grounds.length > 0)).toBe(true);
    expect(recommendations.every((r) => r.title.length > 0 && r.detail.length > 0)).toBe(true);
  });

  it("invents no funding opportunity that is not already in the workspace", async () => {
    const result = await createService(h).run(h.ctxA, INPUT);
    const opportunities = await h.repo.funding.listOpportunities(h.ctxA);

    const recommendations = buildRecommendations({
      candidates: result.candidates,
      conflictFields: [],
      missingFields: [],
      opportunities,
      grants: [],
      grantReports: [],
      now: FIXED_NOW(),
      makeId: createIdFactory(),
    });

    const known = new Set(opportunities.map((o) => o.id));
    for (const recommendation of recommendations) {
      if (recommendation.kind !== "funding_opportunity") continue;
      const reference = recommendation.references.find((r) => r.type === "funding_opportunity");
      expect(known.has(reference!.id)).toBe(true);
    }
  });

  it("recommends nothing at all when nothing was found", () => {
    const recommendations = buildRecommendations({
      candidates: [],
      conflictFields: [],
      missingFields: [],
      opportunities: [],
      grants: [],
      grantReports: [],
      now: FIXED_NOW(),
      makeId: createIdFactory(),
    });

    // An empty list is the honest answer. Filler advice on a first screen is
    // how a product teaches people to ignore its recommendations.
    expect(recommendations).toEqual([]);
  });

  it("does not compute a concentration risk from a single grant", () => {
    const recommendations = buildRecommendations({
      candidates: [],
      conflictFields: [],
      missingFields: [],
      opportunities: [],
      grants: [
        {
          id: "g1",
          organisationId: "org-northstar",
          funderId: "f1",
          title: "One grant",
          awardValue: 100_000,
          currency: "GBP",
          restricted: true,
          startDate: "2026-01-01",
          endDate: "2027-01-01",
          spentToDate: 0,
          conditions: [],
          status: "active",
          audit: { createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        },
      ],
      grantReports: [],
      now: FIXED_NOW(),
      makeId: createIdFactory(),
    });

    expect(recommendations.some((r) => r.kind === "concentration_risk")).toBe(false);
  });
});

/**
 * The crawler is a guest on someone else's server. These are the manners.
 */
describe("robots.txt", () => {
  const AGENT = "PegasusMissionOS/1.0";

  it("honours a disallow for all agents", () => {
    const allowed = parseRobots("User-agent: *\nDisallow: /private", AGENT);
    expect(allowed("/about")).toBe(true);
    expect(allowed("/private/board-papers")).toBe(false);
  });

  it("prefers the longest matching rule, so an allow can carve out an exception", () => {
    const allowed = parseRobots(
      "User-agent: *\nDisallow: /docs\nAllow: /docs/public",
      AGENT,
    );
    expect(allowed("/docs/internal")).toBe(false);
    expect(allowed("/docs/public/report.pdf")).toBe(true);
  });

  it("treats an empty disallow as permission rather than as a block", () => {
    const allowed = parseRobots("User-agent: *\nDisallow:", AGENT);
    expect(allowed("/anything")).toBe(true);
  });

  it("applies a rule written for us over the wildcard group", () => {
    const allowed = parseRobots(
      "User-agent: *\nDisallow:\n\nUser-agent: PegasusMissionOS\nDisallow: /",
      AGENT,
    );
    expect(allowed("/about")).toBe(false);
  });

  it("allows everything when the file says nothing about us", () => {
    const allowed = parseRobots("User-agent: SomeOtherBot\nDisallow: /", AGENT);
    expect(allowed("/about")).toBe(true);
  });
});
