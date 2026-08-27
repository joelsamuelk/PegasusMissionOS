import { beforeEach, describe, expect, it } from "vitest";
import type { Claim, ImpactReport, Indicator, ParsedDocumentLike } from "./reporting-engine.types";
import {
  RendererUnavailableError,
  acceptIngestion,
  assessReportCompleteness,
  assessReportReadiness,
  buildReportBriefing,
  buildReportFromDefinition,
  buildReportSnapshot,
  buildReportVersion,
  classifyRequirement,
  cloneDefinition,
  detectDates,
  detectReportDrift,
  detectUncitedFigures,
  detectWordLimit,
  ingestReportTemplate,
  nextVersionNumber,
  publishedVersion,
  renderReport,
  sectionsFromRequirements,
  summariseDrift,
} from "@/lib/reporting";
import { createTwoTenantHarness, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-5 — the Mission Reporting Engine.
 *
 * The phase has one rule and everything here tests some consequence of it:
 *
 *   A published report cannot silently change when underlying live data
 *   changes.
 *
 * The tests that matter most are the ones that would pass if the rule were
 * broken in the easiest ways: a version that shares its array with the live
 * report, a snapshot that stores claim ids without values, an export that
 * substitutes a format it cannot produce, and an extraction that writes
 * straight into an approved template.
 */

const REPORT = "report-youth-2026";

describe("versions are immutable", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * The failure this test exists for is subtle and would pass a naive test:
   * `sections: report.sections` compiles, satisfies the type, and shares the
   * array. Every assertion about the version passes until someone edits the
   * report, at which point the version silently changes too.
   */
  it("does not share its sections with the live report", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const version = buildReportVersion({
      report,
      versionNumber: 1,
      reason: "published",
      createdAt: new Date("2026-07-21"),
    });

    report.sections[0]!.content = "edited after the version was cut";

    expect(version.sections[0]!.content).not.toBe("edited after the version was cut");
  });

  it("numbers monotonically and never reuses a gap", () => {
    const versions = [
      { versionNumber: 1 },
      { versionNumber: 2 },
      { versionNumber: 5 },
    ] as Parameters<typeof nextVersionNumber>[0];
    expect(nextVersionNumber(versions)).toBe(6);
  });

  it("resolves a published report to its published version, not its latest", () => {
    const versions = [
      { versionNumber: 1, reason: "published" },
      { versionNumber: 2, reason: "draft_saved" },
    ] as Parameters<typeof publishedVersion>[0];

    // A draft cut after publication is work in progress. Resolving to it would
    // show a funder something nobody approved.
    expect(publishedVersion(versions)?.versionNumber).toBe(1);
  });
});

describe("snapshots pin values, not only ids", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("records what the report actually said, so drift is computable", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const claims = await h.repo.claims.list(h.ctxA);
    const indicators = await h.repo.programmes.allIndicators(h.ctxA);
    const evidence = await h.repo.evidence.list(h.ctxA);

    // Cite claims explicitly. An earlier version of this test ran against the
    // seeded report, whose sections cite nothing, so it only ever exercised the
    // indicator path and passed with `renderedValue` hard-coded to an empty
    // string. A snapshot test that never sees a claim figure tests nothing.
    report.sections[0]!.claimIds = claims.slice(0, 2).map((claim) => claim.id);

    const snapshot = buildReportSnapshot({
      report,
      claims,
      indicators,
      evidence,
      takenAt: new Date("2026-07-21T10:00:00Z"),
    });

    const claimFigures = snapshot.figures.filter((figure) => figure.claimId);
    expect(claimFigures).toHaveLength(2);
    for (const figure of claimFigures) {
      // A claim id alone resolves to a *chain* once superseded, and the report
      // can no longer say which link it meant. The rendered value is what
      // makes the difference computable.
      expect(figure.renderedValue.trim()).not.toBe("");
      expect(figure.kind).toBeTruthy();
      expect(figure.verification).toBeTruthy();
    }

    const indicatorFigures = snapshot.figures.filter(
      (figure) => figure.subject.type === "indicator",
    );
    expect(indicatorFigures.length).toBeGreaterThan(0);
    for (const figure of indicatorFigures) {
      expect(figure.renderedValue.trim()).not.toBe("");
    }

    expect(snapshot.indicatorValues.length).toBe(report.includedIndicatorIds.length);
    expect(snapshot.claimIds).toHaveLength(2);
  });

  it("pins a claim the report cites but that has since gone missing, rather than dropping it", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    report.sections[0]!.claimIds = ["claim-that-does-not-exist"];

    const snapshot = buildReportSnapshot({
      report,
      claims: [],
      indicators: [],
      evidence: [],
      takenAt: new Date("2026-07-21"),
    });

    const orphan = snapshot.figures.find((f) => f.claimId === "claim-that-does-not-exist");
    expect(orphan).toBeDefined();
    expect(orphan!.renderedValue).toMatch(/could not be resolved/);
  });
});

describe("drift is reported, never applied", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * The acceptance criterion, verbatim from the build spec: *a claim
   * superseded after publication surfaces as a flagged change rather than
   * silently altering the published report*.
   */
  it("flags a superseded claim as a material change and leaves the report alone", async () => {
    const claims = await h.repo.claims.list(h.ctxA);
    const original = claims.find((c) => !c.supersededBy && c.value.type === "number");
    expect(original, "the seed needs at least one numeric claim").toBeDefined();

    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    report.sections[0]!.content = "As published.";
    report.sections[0]!.claimIds = [original!.id];

    const snapshot = buildReportSnapshot({
      report,
      claims,
      indicators: [],
      evidence: [],
      takenAt: new Date("2026-07-21"),
    });
    const publishedValue = snapshot.figures.find((f) => f.claimId === original!.id)!.renderedValue;

    // Correct the figure the way the product requires: supersede, never edit.
    const corrected = await h.repo.claims.supersede(h.ctxA, original!.id, {
      ...structuredClone(original!),
      id: "claim-corrected",
      value: { type: "number", number: 999, unit: (original!.value as { unit?: string }).unit },
      text: "999 corrected",
      supersedes: original!.id,
    } as Claim);
    expect(corrected).not.toBeNull();

    const after = await h.repo.claims.list(h.ctxA);
    const drift = detectReportDrift({
      snapshot,
      versionId: "ver-1",
      claims: after,
      indicators: [],
    });

    const flagged = drift.find((d) => d.publishedValue === publishedValue);
    expect(flagged).toBeDefined();
    expect(flagged!.severity).toBe("material");
    expect(flagged!.supersededByClaimId).toBeTruthy();

    // The published text is untouched. That is the whole point.
    expect(snapshot.figures.find((f) => f.claimId === original!.id)!.renderedValue).toBe(
      publishedValue,
    );
  });

  it("treats an indicator moving on as minor, because delivery continuing is not an error", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const indicators = await h.repo.programmes.allIndicators(h.ctxA);
    const snapshot = buildReportSnapshot({
      report,
      claims: [],
      indicators,
      evidence: [],
      takenAt: new Date("2026-07-21"),
    });

    const moved: Indicator[] = indicators.map((indicator) => ({
      ...indicator,
      currentValue: indicator.currentValue + 5,
    }));

    const drift = detectReportDrift({ snapshot, versionId: "v", claims: [], indicators: moved });
    expect(drift.length).toBeGreaterThan(0);
    expect(drift.every((d) => d.severity === "minor")).toBe(true);
    expect(summariseDrift(drift).material).toBe(0);
  });

  it("reports no drift when nothing has changed", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const claims = await h.repo.claims.list(h.ctxA);
    const indicators = await h.repo.programmes.allIndicators(h.ctxA);
    const snapshot = buildReportSnapshot({
      report,
      claims,
      indicators,
      evidence: [],
      takenAt: new Date("2026-07-21"),
    });

    expect(detectReportDrift({ snapshot, versionId: "v", claims, indicators })).toEqual([]);
  });
});

describe("Invariant 5: a number typed into prose is not a citation", () => {
  const section = (content: string, claimIds: string[] = []) => ({
    key: "executive_summary",
    title: "Executive summary",
    type: "narrative" as const,
    content,
    claimIds,
  });

  it("finds money and percentages nothing accounts for", () => {
    const figures = detectUncitedFigures({
      sections: [section("We supported young people and spent £42,000, reaching 58% of target.")],
      claims: [],
    });

    expect(figures.map((f) => f.token)).toEqual(
      expect.arrayContaining([expect.stringContaining("42,000"), expect.stringContaining("58")]),
    );
    expect(figures.every((f) => f.context.length > 0)).toBe(true);
  });

  it("does not fire on a figure the section cites", () => {
    const claim = {
      id: "c1",
      text: "58% progressed into education, employment or training",
      value: { type: "number", number: 58, unit: "%" },
      workings: undefined,
    } as unknown as Claim;

    const figures = detectUncitedFigures({
      sections: [section("58% progressed into a positive destination.", ["c1"])],
      claims: [claim],
    });
    expect(figures).toEqual([]);
  });

  /**
   * The exclusions are the part of this most likely to be wrong, so they are
   * tested explicitly. A warning list that fires on every year and every
   * street number is a list nobody reads.
   */
  it("ignores years and dates", () => {
    const figures = detectUncitedFigures({
      sections: [section("Between 2024 and 2025 we ran the programme, ending 15 March.")],
      claims: [],
    });
    expect(figures).toEqual([]);
  });

  it("ignores small counts in prose but never small sums of money", () => {
    const counts = detectUncitedFigures({
      sections: [section("We work across 3 boroughs with 4 partners.")],
      claims: [],
    });
    expect(counts).toEqual([]);

    const money = detectUncitedFigures({
      sections: [section("We spent £4 on this.")],
      claims: [],
    });
    expect(money).toHaveLength(1);
  });

  it("blocks approval of a report whose prose carries an uncited financial figure", async () => {
    const h = createTwoTenantHarness();
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    for (const s of report.sections) s.content = "Drafted.";
    report.sections[0]!.content = "We spent £42,000 delivering the programme.";

    const readiness = assessReportReadiness({
      report,
      claims: await h.repo.claims.list(h.ctxA),
      indicators: [],
      evidence: await h.repo.evidence.list(h.ctxA),
      now: new Date("2026-07-21"),
    });

    const uncited = readiness.issues.filter((issue) => issue.kind === "uncited_figure");
    expect(uncited.length).toBeGreaterThan(0);
    expect(uncited.some((issue) => issue.severity === "blocker")).toBe(true);
    expect(readiness.readyForApproval).toBe(false);
  });
});

describe("evidence completeness separates seven states", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("grades included evidence by trust rather than counting it", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const completeness = assessReportCompleteness({
      report,
      claims: await h.repo.claims.list(h.ctxA),
      evidence: await h.repo.evidence.list(h.ctxA),
      indicators: await h.repo.programmes.allIndicators(h.ctxA),
      now: new Date("2026-07-21"),
    });

    expect(completeness.verifiedEvidence.length).toBeGreaterThan(0);
    expect(completeness.providedEvidence.length).toBeGreaterThan(0);
    // Verified and provided are different states and must not be merged.
    const verifiedIds = completeness.verifiedEvidence.map((e) => e.ref?.id);
    const providedIds = completeness.providedEvidence.map((e) => e.ref?.id);
    expect(verifiedIds.some((id) => providedIds.includes(id))).toBe(false);
  });

  it("reports outdated evidence as well as its trust state, not instead of it", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const completeness = assessReportCompleteness({
      report,
      claims: [],
      evidence: await h.repo.evidence.list(h.ctxA),
      indicators: [],
      now: new Date("2030-01-01"),
      outdatedAfterDays: 365,
    });

    expect(completeness.outdatedEvidence.length).toBeGreaterThan(0);
    // A verified evaluation from years ago is both verified and outdated. A
    // reader told only the first has been misled.
    const outdatedIds = new Set(completeness.outdatedEvidence.map((e) => e.ref?.id));
    const alsoGraded = [
      ...completeness.verifiedEvidence,
      ...completeness.providedEvidence,
    ].filter((entry) => outdatedIds.has(entry.ref?.id));
    expect(alsoGraded.length).toBeGreaterThan(0);
  });

  it("names missing requirements when a funder template has been ingested", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const requirements = await h.repo.reports.requirements(h.ctxA, "repdef-henderson-interim");
    expect(requirements.length).toBeGreaterThan(0);

    const completeness = assessReportCompleteness({
      report,
      claims: [],
      evidence: [],
      indicators: [],
      requirements,
      now: new Date("2026-07-21"),
    });

    // A generic "this section is empty" understates the gap every time a
    // funder asks two questions in one section.
    expect(completeness.missingEvidence.length).toBeGreaterThan(0);
    expect(completeness.missingEvidence.some((e) => e.label.includes("?"))).toBe(true);
  });

  it("reports an AI-drafted section as AI-drafted", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    await h.repo.reports.saveSection(h.ctxA, REPORT, "executive_summary", "A draft.", {
      used: [],
      unused: [],
      assumptions: [],
      couldNotVerify: [],
      model: "pegasus-mock-1",
      promptVersion: "2026-07-01",
      usedFallback: false,
      generatedAt: "2026-07-21T10:00:00Z",
    });

    const updated = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const completeness = assessReportCompleteness({
      report: updated,
      claims: [],
      evidence: [],
      indicators: [],
      now: new Date("2026-07-21"),
    });

    expect(completeness.aiAssistedNarrative).toHaveLength(1);
    expect(completeness.aiAssistedNarrative[0]!.detail).toMatch(/pegasus-mock-1/);
    void report;
  });
});

describe("report intelligence answers the six questions before drafting", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("refuses to call a report ready to draft while its indicators are stale", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const indicators = await h.repo.programmes.allIndicators(h.ctxA);

    const briefing = buildReportBriefing({
      report,
      claims: await h.repo.claims.list(h.ctxA),
      evidence: await h.repo.evidence.list(h.ctxA),
      indicators,
      now: new Date("2030-01-01"),
    });

    expect(briefing.readyToDraft).toBe(false);
    expect(briefing.blockers.join(" ")).toMatch(/no recent measurement/);
    expect(briefing.indicatorCurrency.every((c) => c.state === "stale")).toBe(true);
  });

  it("says which numbers are trusted using the effective kind, not the stated one", async () => {
    const claims = await h.repo.claims.list(h.ctxA);
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    report.sections[0]!.claimIds = claims.slice(0, 3).map((c) => c.id);

    const briefing = buildReportBriefing({
      report,
      claims,
      evidence: [],
      indicators: [],
      now: new Date("2026-07-21"),
    });

    expect(briefing.trustedFigures.length).toBeGreaterThan(0);
    for (const figure of briefing.trustedFigures) {
      expect(typeof figure.honest).toBe("boolean");
      expect(figure.kind).toBeTruthy();
    }
  });

  it("names what changed since the last published report", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const indicators = await h.repo.programmes.allIndicators(h.ctxA);
    const previousSnapshot = buildReportSnapshot({
      report,
      claims: [],
      indicators,
      evidence: [],
      takenAt: new Date("2026-01-01"),
    });

    const moved = indicators.map((indicator) => ({
      ...indicator,
      currentValue: indicator.currentValue + 12,
    }));

    const briefing = buildReportBriefing({
      report,
      claims: [],
      evidence: [],
      indicators: moved,
      previousSnapshot,
      now: new Date("2026-07-21"),
    });

    expect(briefing.changedSinceLastReport.length).toBeGreaterThan(0);
    for (const change of briefing.changedSinceLastReport) {
      expect(change.previousValue).not.toBe(change.currentValue);
      expect(change.corrected).toBe(false);
    }
  });

  it("lists what was promised, from funder requirements and open commitments", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const briefing = buildReportBriefing({
      report,
      claims: [],
      evidence: [],
      indicators: [],
      funderRequirements: await h.repo.requirements.forGrant(h.ctxA, "grant-henderson"),
      commitments: await h.repo.relationships.listCommitments(h.ctxA),
      now: new Date("2026-07-21"),
    });

    expect(briefing.commitments.length).toBeGreaterThan(0);
    expect(briefing.commitments.some((c) => c.origin === "funder_requirement")).toBe(true);
    expect(briefing.commitments.some((c) => c.origin === "commitment")).toBe(true);
  });
});

describe("creation carries structure forward and content never", () => {
  it("creates every section empty", () => {
    const report = buildReportFromDefinition({
      id: "r1",
      organisationId: "org-a",
      title: "Interim report",
      reportingPeriod: "2026",
      type: "funder",
      now: new Date("2026-07-21"),
    });

    expect(report.sections.length).toBeGreaterThan(0);
    // Pre-filling from last period is the single worst thing this could do:
    // a pre-filled section is indistinguishable from a drafted one.
    expect(report.sections.every((section) => section.content === "")).toBe(true);
    expect(report.status).toBe("draft");
  });

  it("clones a template with its requirements, preserving confirmation", async () => {
    const h = createTwoTenantHarness();
    const definition = (await h.repo.reports.getDefinition(
      h.ctxA,
      "repdef-henderson-interim",
    ))!;
    const requirements = await h.repo.reports.requirements(h.ctxA, definition.id);

    const cloned = cloneDefinition({
      definition,
      requirements,
      newDefinitionId: "repdef-clone",
      name: "Our version",
      now: new Date("2026-07-21"),
      requirementId: (index) => `req-clone-${index}`,
    });

    expect(cloned.definition.origin).toBe("cloned");
    expect(cloned.requirements).toHaveLength(requirements.length);
    expect(cloned.requirements.every((r) => r.definitionId === "repdef-clone")).toBe(true);
    // The confirmation was about the funder's question and the question has
    // not changed, so it survives the clone.
    expect(cloned.requirements.every((r) => r.verification === "provided")).toBe(true);
  });
});

describe("rendering refuses rather than substitutes", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("renders markdown with citations beside the section that used them", async () => {
    const claims = await h.repo.claims.list(h.ctxA);
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    report.sections[0]!.content = "As published.";
    report.sections[0]!.claimIds = [claims[0]!.id];

    const rendered = renderReport(report, claims, "markdown", new Date("2026-07-21"));
    const text = rendered.content as string;

    expect(text).toContain(report.title);
    expect(text).toContain("Figures cited in this section");
    // Citations sit with the section, not in an endnote forty lines away.
    const sectionIndex = text.indexOf(report.sections[0]!.title);
    const citationIndex = text.indexOf("Figures cited in this section");
    expect(citationIndex).toBeGreaterThan(sectionIndex);
  });

  it("says which sections were not drafted rather than rendering a gap", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    const rendered = renderReport(report, [], "markdown", new Date("2026-07-21"));
    expect(rendered.content as string).toContain("has not been drafted");
  });

  it("escapes tenant content in the HTML renderer", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    report.sections[0]!.content = '<script>alert("x")</script>';
    const rendered = renderReport(report, [], "html", new Date("2026-07-21"));
    expect(rendered.content as string).not.toContain("<script>");
    expect(rendered.content as string).toContain("&lt;script&gt;");
  });

  /**
   * The failure this prevents is discovered by a funder rather than by a test:
   * an HTML file delivered under a `.pdf` name.
   */
  it("refuses a format it cannot produce, naming what would be needed", async () => {
    const report = (await h.repo.reports.get(h.ctxA, REPORT))!;
    expect(() => renderReport(report, [], "pdf", new Date("2026-07-21"))).toThrow(
      RendererUnavailableError,
    );
    try {
      renderReport(report, [], "docx", new Date("2026-07-21"));
    } catch (error) {
      expect((error as Error).message).toMatch(/OOXML writer/);
    }
  });
});

describe("funder template ingestion produces candidates, never requirements", () => {
  const parsed = (blocks: string[]): ParsedDocumentLike => ({
    status: "parsed",
    text: blocks.join("\n"),
    blocks: blocks.map((text, index) => ({ text, locator: `paragraph ${index + 1}` })),
    wordCount: blocks.join(" ").split(/\s+/).length,
  });

  const ingest = (blocks: string[]) =>
    ingestReportTemplate({
      id: "ing-1",
      organisationId: "org-a",
      definitionId: "def-1",
      parsed: parsed(blocks) as never,
      now: new Date("2026-07-21"),
      requirementId: (index) => `cand-${index}`,
    });

  it("recognises numbered, interrogative and imperative questions", () => {
    const ingestion = ingest([
      "Interim report form",
      "1. Describe what the grant has delivered.",
      "How many people did you support?",
      "Please explain any variance against budget.",
    ]);

    expect(ingestion.status).toBe("awaiting_review");
    expect(ingestion.candidates).toHaveLength(3);
  });

  it("marks every candidate as needing review", () => {
    const ingestion = ingest(["1. Describe delivery.", "2. How many participants?"]);
    expect(ingestion.candidates.every((c) => c.verification === "needs_review")).toBe(true);
  });

  it("classifies what the funder is asking for", () => {
    expect(classifyRequirement("How many young people did you support?")).toBe("indicator");
    expect(classifyRequirement("State expenditure against the budget.")).toBe("financial");
    expect(classifyRequirement("Provide an independent evaluation.")).toBe("evidence");
    expect(classifyRequirement("Please attach your latest accounts.")).toBe("attachment");
    expect(classifyRequirement("Tell us about your governance approach.")).toBe("narrative");
  });

  it("reads a word limit from the guidance under a question", () => {
    const ingestion = ingest([
      "1. Describe what the grant has delivered.",
      "Maximum 500 words.",
    ]);
    expect(ingestion.candidates[0]!.wordLimit).toBe(500);
  });

  it("does not mistake a heading number for a word limit", () => {
    expect(detectWordLimit("Section 4 words about impact")).toBeUndefined();
    expect(detectWordLimit("no more than 250 words")).toBe(250);
  });

  it("finds deadlines in either date format", () => {
    expect(detectDates("Return by 2026-08-28.")).toEqual(["2026-08-28"]);
    expect(detectDates("Return by 28 August 2026.")).toEqual(["2026-08-28"]);
  });

  /**
   * A template that yielded three questions out of twelve must say so. An
   * ingestion whose notes are empty reads as a complete extraction.
   */
  it("says plainly when it recognised nothing", () => {
    const ingestion = ingest(["A block of prose with no questions in it at all."]);
    expect(ingestion.candidates).toHaveLength(0);
    expect(ingestion.notes.join(" ")).toMatch(/No questions were recognised/);
  });

  it("fails honestly on an unreadable document", () => {
    const ingestion = ingestReportTemplate({
      id: "ing-2",
      organisationId: "org-a",
      definitionId: "def-1",
      parsed: { status: "unreadable", note: "Encrypted PDF.", text: "", blocks: [], wordCount: 0 } as never,
      now: new Date("2026-07-21"),
      requirementId: (index) => `cand-${index}`,
    });

    expect(ingestion.status).toBe("failed");
    expect(ingestion.candidates).toEqual([]);
    expect(ingestion.notes[0]).toBe("Encrypted PDF.");
  });

  it("promotes accepted candidates to provided, never to verified", () => {
    const ingestion = ingest(["1. Describe delivery.", "2. How many participants?"]);
    const { ingestion: reviewed, requirements } = acceptIngestion(
      ingestion,
      [ingestion.candidates[0]!.id],
      "user-amara",
      new Date("2026-07-21"),
    );

    expect(reviewed.status).toBe("accepted");
    expect(requirements).toHaveLength(1);
    // Nobody has checked the reading against the funder. `verified` would be a
    // promotion by convenience, which is what assertProducerMayAssign exists
    // to stop elsewhere.
    expect(requirements[0]!.verification).toBe("provided");
    expect(reviewed.notes.join(" ")).toMatch(/1 of 2 candidates accepted, 1 discarded/);
  });

  it("builds report sections from accepted requirements", () => {
    const ingestion = ingest([
      "1. Describe what the grant has delivered.",
      "2. State expenditure against the budget.",
    ]);
    const sections = sectionsFromRequirements(ingestion.candidates);

    expect(sections).toHaveLength(2);
    expect(sections[1]!.type).toBe("financial");
  });
});

describe("the acceptance test", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  /**
   * The build spec's criterion for this phase, walked end to end:
   *
   *   Given a grant with programme, budget, transactions, indicators,
   *   evidence, commitments and report requirements, Mission OS can assemble a
   *   funder report workspace and explain what is ready, what is missing, what
   *   needs review, and where every important claim originated.
   */
  it("assembles a funder workspace and explains what is ready and what is missing", async () => {
    const definition = (await h.repo.reports.getDefinition(
      h.ctxA,
      "repdef-henderson-interim",
    ))!;
    const requirements = await h.repo.reports.requirements(h.ctxA, definition.id);

    const reportId = await h.repo.reports.create(h.ctxA, {
      title: "Henderson Trust interim report, 2026",
      type: "funder",
      reportingPeriod: "January to June 2026",
      definitionId: definition.id,
      programmeId: "prog-youth",
      grantId: "grant-henderson",
      includedIndicatorIds: ["ind-eet"],
      includedEvidenceIds: ["ev-eval-2025"],
    });

    const report = (await h.repo.reports.get(h.ctxA, reportId))!;
    // The workspace is the funder's questions, not Pegasus's generic sections.
    expect(report.sections.map((s) => s.key)).toEqual(
      definition.sections.map((s) => s.key),
    );

    const briefing = buildReportBriefing({
      report,
      claims: await h.repo.claims.list(h.ctxA),
      evidence: await h.repo.evidence.list(h.ctxA),
      indicators: await h.repo.programmes.allIndicators(h.ctxA),
      requirements,
      funderRequirements: await h.repo.requirements.forGrant(h.ctxA, "grant-henderson"),
      commitments: await h.repo.relationships.listCommitments(h.ctxA),
      now: new Date("2026-07-21"),
    });

    // What is missing, named by the funder's own question rather than by a
    // generic "this section is empty".
    expect(briefing.completeness.missingEvidence.length).toBeGreaterThan(0);
    expect(
      briefing.completeness.missingEvidence.some((entry) =>
        entry.label.includes("State expenditure against the awarded budget"),
      ),
      "a financial requirement is not satisfied by an empty section",
    ).toBe(true);
    expect(
      briefing.completeness.missingEvidence.some((entry) =>
        entry.label.includes("Describe what the grant has delivered"),
      ),
    ).toBe(true);

    // And what is *not* missing: the funder asked for a progression figure,
    // the report includes that indicator, and the indicator has been measured.
    // A completeness check that flagged it anyway would be noise.
    expect(
      briefing.completeness.missingEvidence.some((entry) =>
        entry.label.includes("How many young people"),
      ),
    ).toBe(false);

    // What we hold.
    expect(briefing.completeness.verifiedEvidence.length).toBeGreaterThan(0);

    // What we promised.
    expect(briefing.commitments.some((c) => c.origin === "funder_requirement")).toBe(true);

    // Where every figure came from: pinned, with the value as rendered.
    const version = await h.repo.reports.cutVersion(h.ctxA, reportId, "draft_saved");
    const snapshot = await h.repo.reports.getSnapshot(h.ctxA, version!.snapshotId!);
    expect(snapshot!.indicatorValues.map((v) => v.indicatorId)).toEqual(["ind-eet"]);
  });

  it("keeps another tenant out of every new surface", async () => {
    const { repo, ctxB } = h;
    expect(await repo.reports.getDefinition(ctxB, "repdef-henderson-interim")).toBeNull();
    expect(await repo.reports.requirements(ctxB, "repdef-henderson-interim")).toEqual([]);
    expect(await repo.reports.versions(ctxB, REPORT)).toEqual([]);
    expect(await repo.reports.approvals(ctxB, REPORT)).toEqual([]);
    expect(await repo.reports.contributors(ctxB, REPORT)).toEqual([]);
    expect(await repo.reports.cutVersion(ctxB, REPORT, "published")).toBeNull();
  });
});
