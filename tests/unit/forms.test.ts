import { beforeEach, describe, expect, it } from "vitest";
import {
  HONEYPOT_FIELD_KEY,
  MINIMUM_RESPONSES_FOR_PERCENTAGE,
  aggregateAnswers,
  answersDueForErasure,
  assessSpam,
  checkPublishable,
  describeAggregate,
  isRequired,
  isVisible,
  mayReachModel,
  partitionForModel,
  peakSensitivity,
  projectSubmission,
  retainUntil,
  validateSubmission,
  visibleFields,
  draftFacts,
} from "@/lib/forms";
import { applyProjection, buildProjection } from "@/server/forms/apply";
import { createRequestContext } from "@/server/context/request-context";
import type { ClaimValue, Form, FormField, SubmissionAnswer } from "@/types/domain";
import { createTwoTenantHarness, ORG_A, type TwoTenantHarness } from "../fixtures/two-tenant";

/**
 * MG-7 — Mission Forms and Data Collection.
 *
 * Two questions decide whether this phase succeeded, and the tests are
 * organised around them.
 *
 * **Did a submission become graph records?** The expansion plan's test is
 * blunt: *if a submission does not become a claim, the phase has built a form
 * builder.* The acceptance block walks a survey response through to an
 * interaction, a measurement and a piece of evidence.
 *
 * **Did beneficiary data arrive by accident?** MG-12 names this phase as the
 * one most likely to reverse §8's decision. The sensitivity block asserts the
 * refusals: special category answers never reach a model, never project into
 * the knowledge layer, cannot be collected without a lawful basis and a
 * retention period, and are erased when that period expires.
 */

const NOW = new Date("2026-07-21T10:00:00Z");
const text = (value: string): ClaimValue => ({ type: "text", text: value });
const bool = (value: boolean): ClaimValue => ({ type: "boolean", boolean: value });
const num = (value: number): ClaimValue => ({ type: "number", number: value });

const field = (overrides: Partial<FormField> & Pick<FormField, "key" | "label">): FormField => ({
  id: `f-${overrides.key}`,
  organisationId: ORG_A,
  versionId: "v1",
  sectionKey: "main",
  type: "text",
  required: false,
  order: 0,
  sensitivity: "internal",
  ...overrides,
});

describe("conditional logic is the automation engine, not a second one", () => {
  const role = field({ key: "role", label: "Role", type: "select", required: true });
  const progressed = field({
    key: "progressed",
    label: "Did you progress?",
    type: "checkbox",
    required: true,
    visibleWhen: { type: "field", field: "role", operator: "eq", value: "participant" },
  });

  it("shows a field only when its condition holds", () => {
    expect(isVisible(progressed.visibleWhen, draftFacts({ role: text("participant") }), NOW)).toBe(
      true,
    );
    expect(isVisible(progressed.visibleWhen, draftFacts({ role: text("mentor") }), NOW)).toBe(
      false,
    );
  });

  /**
   * The three-valued evaluation earns its place here. A condition on a field
   * the respondent has not reached is `unknown`, and unknown must hide the
   * field: showing it would make the form flicker open as somebody scrolls
   * past an unrelated question.
   */
  it("hides a field whose condition cannot yet be decided", () => {
    expect(isVisible(progressed.visibleWhen, draftFacts({}), NOW)).toBe(false);
  });

  /**
   * A form that blocks submission on a question it is not showing is
   * unfillable, and the person who built it cannot see that from the editor.
   */
  it("never requires a hidden field, whatever its required flag says", () => {
    const facts = draftFacts({ role: text("mentor") });
    expect(progressed.required).toBe(true);
    expect(isRequired(progressed, facts, NOW)).toBe(false);
  });

  it("filters the visible field list", () => {
    const shown = visibleFields([role, progressed], draftFacts({ role: text("mentor") }), NOW);
    expect(shown.map((f) => f.key)).toEqual(["role"]);
  });
});

describe("validation", () => {
  const fields = [
    field({ key: "name", label: "Name", required: true, validation: { maxLength: 5 } }),
    field({ key: "email", label: "Email", type: "email" }),
    field({
      key: "score",
      label: "Score",
      type: "scale",
      validation: { min: 0, max: 10 },
    }),
    field({
      key: "choice",
      label: "Choice",
      type: "select",
      options: [{ value: "a", label: "A" }],
    }),
  ];

  const check = (values: Record<string, ClaimValue | undefined>) =>
    validateSubmission({ fields, values, now: NOW }).map((problem) => problem.message);

  it("requires what is required and checks lengths, ranges and formats", () => {
    expect(check({})).toContain("Name is required.");
    expect(check({ name: text("far too long") })).toContain("Name must be 5 characters or fewer.");
    expect(check({ name: text("ok"), email: text("nope") })).toContain(
      "Email is not an email address.",
    );
    expect(check({ name: text("ok"), score: num(11) })).toContain("Score must be 10 or less.");
    expect(check({ name: text("ok"), choice: text("z") })).toContain(
      "Choice is not one of the offered options.",
    );
    expect(check({ name: text("ok") })).toEqual([]);
  });

  /**
   * A stored answer to a question nobody was shown cannot be explained later,
   * and accepting one is how form branching gets bypassed.
   */
  it("refuses an answer to a field the form's logic hides", () => {
    const hidden = [
      field({ key: "role", label: "Role" }),
      field({
        key: "secret",
        label: "Secret",
        visibleWhen: { type: "field", field: "role", operator: "eq", value: "participant" },
      }),
    ];
    const problems = validateSubmission({
      fields: hidden,
      values: { role: text("mentor"), secret: text("smuggled") },
      now: NOW,
    });
    expect(problems.map((p) => p.message)).toContain(
      "Secret was answered but is not shown by this form's logic.",
    );
  });

  it("refuses an answer to a field the version does not have", () => {
    expect(check({ name: text("ok"), invented: text("x") })).toContain(
      "invented is not a field on this version of the form.",
    );
  });

  it("refuses a validation pattern too long to run safely", () => {
    const problems = validateSubmission({
      fields: [field({ key: "a", label: "A", validation: { pattern: "x".repeat(300) } })],
      values: { a: text("x") },
      now: NOW,
    });
    expect(problems[0]!.message).toMatch(/too long to run safely/);
  });

  it("anchors a pattern so a substring cannot pass", () => {
    const problems = validateSubmission({
      fields: [field({ key: "a", label: "A", validation: { pattern: "\\d{4}" } })],
      values: { a: text("abc1234def") },
      now: NOW,
    });
    expect(problems).toHaveLength(1);
  });
});

describe("sensitivity is a field property with no default", () => {
  it("keeps personal and special category data away from a model", () => {
    expect(mayReachModel("public")).toBe(true);
    expect(mayReachModel("internal")).toBe(true);
    expect(mayReachModel("personal")).toBe(false);
    expect(mayReachModel("special_category")).toBe(false);
  });

  it("partitions answers and says how many were withheld", () => {
    const answers = [
      { fieldKey: "a", sensitivity: "internal" },
      { fieldKey: "b", sensitivity: "personal" },
      { fieldKey: "c", sensitivity: "special_category" },
    ] as SubmissionAnswer[];

    const { visible, withheld } = partitionForModel(answers);
    expect(visible.map((a) => a.fieldKey)).toEqual(["a"]);
    // A context quietly containing one of three answers invites a model to
    // reason as though it saw everything.
    expect(withheld).toHaveLength(2);
  });

  it("takes the peak sensitivity across a form", () => {
    expect(
      peakSensitivity([{ sensitivity: "internal" }, { sensitivity: "special_category" }]),
    ).toBe("special_category");
  });

  const specialForm: Form = {
    id: "form-x",
    organisationId: ORG_A,
    name: "Intake",
    purpose: "beneficiary_intake",
    access: "link",
    status: "draft",
    audit: { createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
  };
  const specialFields = [
    field({ key: "health", label: "Health conditions", sensitivity: "special_category" }),
  ];

  /**
   * These are refusals, not warnings. A form collecting Article 9 data with no
   * lawful basis and no retention period is not a form with a gap in its
   * settings; it is a form that should not exist.
   */
  it("refuses to publish special category collection without a basis or a retention period", () => {
    const problems = checkPublishable(specialForm, specialFields).map((p) => p.code);
    expect(problems).toContain("no_lawful_basis");
    expect(problems).toContain("no_retention");
  });

  it("refuses to serve special category collection at a public URL", () => {
    const problems = checkPublishable(
      { ...specialForm, access: "public", slug: "intake" },
      specialFields,
    ).map((p) => p.code);
    expect(problems).toContain("public_special_category");
  });

  it("publishes once a basis and a retention period are recorded", () => {
    expect(
      checkPublishable(
        {
          ...specialForm,
          // Not `consent`, because this form asks for none. Claiming consent
          // as a basis without collecting any is itself refused below.
          lawfulBasis: { basis: "legal_obligation", jurisdiction: "UK-GDPR" },
          retentionDays: 365,
        },
        specialFields,
      ),
    ).toEqual([]);
  });

  it("refuses a consent field that does not say what to", () => {
    const problems = checkPublishable(
      { ...specialForm, lawfulBasis: { basis: "consent" }, retentionDays: 365 },
      [field({ key: "ok", label: "Do you agree?", type: "consent", sensitivity: "personal" })],
    ).map((p) => p.code);
    expect(problems).toContain("consent_without_purpose");
  });

  it("refuses a form that claims consent as its basis and never asks for any", () => {
    const problems = checkPublishable(
      { ...specialForm, lawfulBasis: { basis: "consent" }, retentionDays: 365 },
      [field({ key: "name", label: "Name", sensitivity: "personal" })],
    ).map((p) => p.code);
    expect(problems).toContain("consent_basis_without_field");
  });
});

describe("retention is enforced, not promised", () => {
  it("stamps a retention date from the form's policy", () => {
    const form = { retentionDays: 30 } as Form;
    expect(retainUntil(form, NOW)).toBe("2026-08-20T10:00:00.000Z");
    expect(retainUntil({} as Form, NOW)).toBeUndefined();
  });

  it("finds the submissions whose retention has expired", () => {
    expect(
      answersDueForErasure(
        [
          { id: "a", retainUntil: "2026-01-01T00:00:00Z" },
          { id: "b", retainUntil: "2030-01-01T00:00:00Z" },
          { id: "c" },
        ],
        NOW,
      ),
    ).toEqual(["a"]);
  });

  it("erases the answers and keeps the submission", async () => {
    const h = createTwoTenantHarness();
    const result = await h.repo.forms.submit(h.ctxA, {
      formId: "form-youth-survey",
      source: "link",
      values: {
        respondent_role: text("mentor"),
        wellbeing_score: num(7),
        quote_consent: bool(true),
      },
    });
    expect(result.ok).toBe(true);

    // Retention on the seeded form is three years; push the clock past it.
    const later = createRequestContext({
      organisationId: ORG_A,
      userId: "user-amara",
      role: "owner",
      now: () => new Date("2031-01-01T00:00:00Z"),
    });

    const erased = await h.repo.forms.redactExpired(later);
    expect(erased.submissions).toBe(1);
    expect(erased.answers).toBeGreaterThan(0);

    // The submission survives. "Somebody submitted this and the answers were
    // deleted under our retention policy" is a true and useful statement;
    // deleting the row would make the erasure unprovable.
    expect(await h.repo.forms.getSubmission(later, result.submissionId!)).not.toBeNull();
    const answers = await h.repo.forms.answers(later, result.submissionId!);
    expect(answers.every((answer) => answer.redacted)).toBe(true);
    expect(answers.every((answer) => renderEmpty(answer))).toBe(true);
  });
});

function renderEmpty(answer: SubmissionAnswer): boolean {
  return answer.value.type === "text" && answer.value.text === "";
}

describe("spam protection prefers a false negative", () => {
  const fields = [field({ key: "message", label: "Message", type: "textarea" })];

  it("catches a filled honeypot", () => {
    const result = assessSpam({ fields, values: {}, honeypotValue: "http://spam" });
    expect(result.suspected).toBe(true);
    expect(result.signals[0]!.code).toBe("honeypot_filled");
  });

  it("catches a submission faster than anyone can read the form", () => {
    const result = assessSpam({
      fields,
      values: { message: text("BUY NOW http://a http://b http://c CHEAP DEALS AMAZING OFFER") },
      secondsOnPage: 1,
    });
    expect(result.suspected).toBe(true);
  });

  /**
   * A missed spam submission costs somebody thirty seconds. A rejected genuine
   * submission from a person who needed help is a failure the organisation
   * never finds out about.
   */
  it("does not flag an ordinary answer", () => {
    const result = assessSpam({
      fields,
      values: {
        message: text(
          "The mentoring helped me most. I felt more confident applying for apprenticeships and started one in June.",
        ),
      },
      secondsOnPage: 120,
    });
    expect(result.suspected).toBe(false);
    expect(result.score).toBe(0);
  });

  it("stores a suspected submission rather than discarding it", async () => {
    const h = createTwoTenantHarness();
    const result = await h.repo.forms.submit(h.ctxA, {
      formId: "form-youth-survey",
      source: "link",
      values: { respondent_role: text("mentor"), quote_consent: bool(true) },
      honeypotValue: "bot",
    });

    expect(result.ok).toBe(true);
    const submission = await h.repo.forms.getSubmission(h.ctxA, result.submissionId!);
    expect(submission?.status).toBe("spam");
    expect(HONEYPOT_FIELD_KEY).toBeTruthy();
  });
});

describe("one response is not a measurement", () => {
  const mapping = { id: "m1", fieldKey: "progressed" } as never;

  const answers = (values: boolean[]): SubmissionAnswer[] =>
    values.map((value, index) => ({
      id: `a${index}`,
      organisationId: ORG_A,
      submissionId: `s${index}`,
      fieldKey: "progressed",
      fieldLabel: "Progressed",
      fieldType: "checkbox",
      sensitivity: "internal",
      value: bool(value),
    }));

  /**
   * Publishing a percentage from a handful of responses is the most common way
   * a survey becomes a misleading impact claim.
   */
  it("refuses a percentage from too few responses, and says the count instead", () => {
    const result = aggregateAnswers({ mapping, answers: answers([true, true, false]) });
    expect(result.value).toBeNull();
    expect(result.cannotCalculate).toMatch(/2 of 3 said yes/);
    expect(result.cannotCalculate).toMatch(new RegExp(`${MINIMUM_RESPONSES_FOR_PERCENTAGE}`));
  });

  it("reports a percentage with its denominator once there are enough", () => {
    const result = aggregateAnswers({
      mapping,
      answers: answers([true, true, true, false, false, false]),
    });
    expect(result.value).toBe(50);
    expect(result.responses).toBe(6);
    expect(describeAggregate(result)).toMatch(/from 6 accepted responses/);
  });

  it("means a numeric scale and shows the arithmetic", () => {
    const numeric: SubmissionAnswer[] = [6, 8, 10].map((value, index) => ({
      id: `n${index}`,
      organisationId: ORG_A,
      submissionId: `s${index}`,
      fieldKey: "score",
      fieldLabel: "Score",
      fieldType: "scale",
      sensitivity: "internal",
      value: num(value),
    }));
    const result = aggregateAnswers({ mapping, answers: numeric });
    expect(result.value).toBe(8);
    expect(result.workings).toMatch(/divided by 3/);
  });

  it("refuses rather than reporting zero when nothing has been accepted", () => {
    const result = aggregateAnswers({ mapping, answers: [] });
    expect(result.value).toBeNull();
    expect(result.cannotCalculate).toMatch(/nothing to measure/);
  });
});

describe("nothing is overwritten silently", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("forces review on a change that would replace a recorded value", async () => {
    const form = (await h.repo.forms.get(h.ctxA, "form-youth-survey"))!;
    const projection = projectSubmission({
      form,
      submission: { id: "s1" } as never,
      answers: [
        {
          id: "a1",
          organisationId: ORG_A,
          submissionId: "s1",
          fieldKey: "what_changed",
          fieldLabel: "What changed",
          fieldType: "textarea",
          sensitivity: "internal",
          value: text("A new account"),
        },
      ],
      mappings: [
        {
          id: "m1",
          organisationId: ORG_A,
          formId: form.id,
          fieldKey: "what_changed",
          target: "evidence",
          requiresReview: false,
          audit: { createdAt: "", updatedAt: "" },
        },
      ],
      existing: { "evidence:what_changed": "Something already recorded" },
    });

    expect(projection.changes).toHaveLength(1);
    // The mapping said no review. The overwrite forces one anyway.
    expect(projection.changes[0]!.requiresReview).toBe(true);
    expect(projection.changes[0]!.existingValue).toBe("Something already recorded");
  });

  it("reports answers nobody mapped rather than discarding them", async () => {
    const form = (await h.repo.forms.get(h.ctxA, "form-youth-survey"))!;
    const projection = projectSubmission({
      form,
      submission: { id: "s1" } as never,
      answers: [
        {
          id: "a1",
          organisationId: ORG_A,
          submissionId: "s1",
          fieldKey: "orphan",
          fieldLabel: "An unmapped question",
          fieldType: "text",
          sensitivity: "internal",
          value: text("goes nowhere"),
        },
      ],
      mappings: [],
    });

    expect(projection.changes).toEqual([]);
    expect(projection.unmapped).toEqual([{ fieldKey: "orphan", label: "An unmapped question" }]);
  });

  /**
   * The knowledge layer is read by report generation and by AI grounding, so a
   * name arriving there is a name in a funder report.
   */
  it("refuses to project special category data into the graph at all", async () => {
    const form = (await h.repo.forms.get(h.ctxA, "form-youth-survey"))!;
    const projection = projectSubmission({
      form,
      submission: { id: "s1" } as never,
      answers: [
        {
          id: "a1",
          organisationId: ORG_A,
          submissionId: "s1",
          fieldKey: "health",
          fieldLabel: "Health conditions",
          fieldType: "textarea",
          sensitivity: "special_category",
          value: text("Sensitive"),
        },
      ],
      mappings: [
        {
          id: "m1",
          organisationId: ORG_A,
          formId: form.id,
          fieldKey: "health",
          target: "claim",
          requiresReview: false,
          audit: { createdAt: "", updatedAt: "" },
        },
      ],
    });

    expect(projection.changes).toEqual([]);
    expect(projection.withheld[0]!.reason).toMatch(/special category/);
  });

  it("refuses to turn a personal answer into a claim", async () => {
    const form = (await h.repo.forms.get(h.ctxA, "form-youth-survey"))!;
    const projection = projectSubmission({
      form,
      submission: { id: "s1" } as never,
      answers: [
        {
          id: "a1",
          organisationId: ORG_A,
          submissionId: "s1",
          fieldKey: "contact_name",
          fieldLabel: "Your name",
          fieldType: "text",
          sensitivity: "personal",
          value: text("A Person"),
        },
      ],
      mappings: [
        {
          id: "m1",
          organisationId: ORG_A,
          formId: form.id,
          fieldKey: "contact_name",
          target: "claim",
          requiresReview: false,
          audit: { createdAt: "", updatedAt: "" },
        },
      ],
    });
    expect(projection.changes).toEqual([]);
    expect(projection.withheld[0]!.reason).toMatch(/personal data/);
  });
});

describe("the acceptance test", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  const respond = (h: TwoTenantHarness, progressed: boolean, score: number, story: string) =>
    h.repo.forms.submit(h.ctxA, {
      formId: "form-youth-survey",
      source: "link",
      values: {
        respondent_role: text("participant"),
        progressed_to_eet: bool(progressed),
        wellbeing_score: num(score),
        what_changed: text(story),
        contact_email: text(`p${score}${progressed}@example.org`),
        quote_consent: bool(true),
      },
      secondsOnPage: 180,
    });

  /**
   * *A programme survey response can become participant interaction +
   * indicator measurement + evidence without someone re-entering the
   * information elsewhere.*
   */
  it("turns survey responses into an interaction, a measurement and evidence", async () => {
    // Enough responses for a rate to be defensible. Each is reviewed and
    // accepted before it counts: an unreviewed response must not move an
    // indicator, which is why the aggregate reads accepted submissions only.
    const submissions: string[] = [];
    for (const [index, progressed] of [true, true, true, false, false, true].entries()) {
      const result = await respond(h, progressed, 6 + (index % 4), `Account ${index}`);
      expect(result.ok, JSON.stringify(result.problems)).toBe(true);
      submissions.push(result.submissionId!);
    }
    for (const id of submissions.slice(0, -1)) {
      await h.repo.forms.reviewSubmission(h.ctxA, id, "accepted");
    }

    const last = submissions.at(-1)!;
    const projection = await buildProjection(h.ctxA, h.repo, last);
    expect(projection).not.toBeNull();

    // Interaction, evidence, person and consent from this response;
    // measurements aggregated across all of them.
    expect(projection!.changes.map((change) => change.target).sort()).toEqual([
      "consent",
      "evidence",
      "interaction",
      "person",
    ]);
    expect(projection!.aggregates).toHaveLength(2);

    const beforeEvidence = (await h.repo.evidence.list(h.ctxA)).length;
    const beforeInteractions = (await h.repo.relationships.listInteractions(h.ctxA)).length;

    const applied = await applyProjection(
      h.ctxA,
      h.repo,
      last,
      [
        ...projection!.changes.map((change) => change.mappingId),
        ...projection!.aggregates.map((aggregate) => aggregate.mapping.id),
      ],
    );

    expect(applied.ok).toBe(true);
    expect(applied.applied.length).toBeGreaterThanOrEqual(4);

    // Evidence.
    const evidence = await h.repo.evidence.list(h.ctxA);
    expect(evidence.length).toBe(beforeEvidence + 1);
    const added = evidence.find((item) => item.title.includes("Youth Futures outcome survey"))!;
    // Somebody wrote it in a form. Nobody has corroborated it.
    expect(added.verification).toBe("provided");

    // Interaction, linked to the programme.
    const interactions = await h.repo.relationships.listInteractions(h.ctxA);
    expect(interactions.length).toBe(beforeInteractions + 1);
    expect(
      interactions.some((interaction) =>
        interaction.links.some((link) => link.id === "prog-youth"),
      ),
    ).toBe(true);

    // Measurement, carrying its denominator. Found by its note rather than by
    // position: the seeded workspace already holds readings, and a reading
    // that displaced them would be the bug rather than the feature.
    const measurements = await h.repo.programmes.measurements(h.ctxA, "ind-eet");
    const fromSurvey = measurements.find((measurement) =>
      measurement.note?.includes("Youth Futures outcome survey"),
    )!;
    expect(fromSurvey).toBeDefined();
    expect(fromSurvey.value).toBe(66.7);
    expect(fromSurvey.note).toMatch(/from 6 accepted responses/);
    // The earlier readings survive. A measurement that overwrote its
    // predecessor would make a published report unresolvable.
    expect(measurements.length).toBeGreaterThan(1);

    // Person, from the email.
    expect(applied.applied.some((entry) => entry.ref?.type === "person")).toBe(true);
  });

  it("does not record a rate until there are enough responses", async () => {
    const first = await respond(h, true, 8, "One account");
    const projection = await buildProjection(h.ctxA, h.repo, first.submissionId!);
    const progression = projection!.aggregates.find(
      (aggregate) => aggregate.fieldKey === "progressed_to_eet",
    )!;

    expect(progression.value).toBeNull();
    expect(progression.cannotCalculate).toMatch(/1 of 1 said yes/);
    // And the withheld list says so, rather than the measurement simply being
    // absent from the reviewer's screen.
    expect(projection!.withheld.some((item) => item.fieldKey === "progressed_to_eet")).toBe(true);
  });

  it("records consent verbatim from the version answered", async () => {
    const result = await respond(h, true, 8, "An account");
    const consent = await h.repo.forms.consent(h.ctxA, result.submissionId!);

    expect(consent).toHaveLength(1);
    expect(consent[0]!.granted).toBe(true);
    expect(consent[0]!.purpose).toMatch(/Quoting your answer anonymously/);
    expect(consent[0]!.versionId).toBe("formv-youth-survey-1");
  });

  it("keeps a withdrawal rather than deleting the record", async () => {
    const result = await respond(h, true, 8, "An account");
    const [consent] = await h.repo.forms.consent(h.ctxA, result.submissionId!);
    await h.repo.forms.withdrawConsent(h.ctxA, consent!.id);

    const after = await h.repo.forms.consent(h.ctxA, result.submissionId!);
    expect(after).toHaveLength(1);
    expect(after[0]!.withdrawnAt).toBeTruthy();
    // Still granted. It was granted, and then withdrawn; rewriting the first
    // fact would lose the second.
    expect(after[0]!.granted).toBe(true);
  });

  it("applies only what the reviewer accepted", async () => {
    const result = await respond(h, true, 8, "An account");
    const projection = await buildProjection(h.ctxA, h.repo, result.submissionId!);
    const evidenceMapping = projection!.changes.find((c) => c.target === "evidence")!;

    const applied = await applyProjection(h.ctxA, h.repo, result.submissionId!, [
      evidenceMapping.mappingId,
    ]);

    expect(applied.applied).toHaveLength(1);
    expect(applied.skipped.length).toBeGreaterThan(0);
    expect(applied.skipped.every((entry) => entry.reason.length > 0)).toBe(true);
  });
});

describe("submissions answer the version they were shown", () => {
  let h: TwoTenantHarness;
  beforeEach(() => {
    h = createTwoTenantHarness();
  });

  it("stores the version answered, not the current one", async () => {
    const result = await h.repo.forms.submit(h.ctxA, {
      formId: "form-youth-survey",
      source: "link",
      values: { respondent_role: text("mentor"), quote_consent: bool(false) },
    });
    const submission = await h.repo.forms.getSubmission(h.ctxA, result.submissionId!);
    expect(submission?.versionId).toBe("formv-youth-survey-1");
  });

  it("carries each field's sensitivity onto its answer", async () => {
    const result = await h.repo.forms.submit(h.ctxA, {
      formId: "form-youth-survey",
      source: "link",
      values: {
        respondent_role: text("mentor"),
        contact_email: text("someone@example.org"),
        quote_consent: bool(true),
      },
    });
    const answers = await h.repo.forms.answers(h.ctxA, result.submissionId!);
    expect(answers.find((a) => a.fieldKey === "respondent_role")!.sensitivity).toBe("internal");
    expect(answers.find((a) => a.fieldKey === "contact_email")!.sensitivity).toBe("personal");
  });

  it("refuses a submission that fails validation, with the field named", async () => {
    const result = await h.repo.forms.submit(h.ctxA, {
      formId: "form-youth-survey",
      source: "link",
      // A participant must answer the progression question, and has not.
      values: { respondent_role: text("participant"), quote_consent: bool(true) },
    });
    expect(result.ok).toBe(false);
    expect(result.problems?.map((p) => p.fieldKey)).toContain("progressed_to_eet");
  });

  it("keeps one tenant out of another's forms and submissions", async () => {
    await h.repo.forms.submit(h.ctxA, {
      formId: "form-youth-survey",
      source: "link",
      values: { respondent_role: text("mentor"), quote_consent: bool(true) },
    });

    expect(await h.repo.forms.list(h.ctxB)).toEqual([]);
    expect(await h.repo.forms.get(h.ctxB, "form-youth-survey")).toBeNull();
    expect(await h.repo.forms.getBySlug(h.ctxB, "youth-futures-outcomes")).toBeNull();
    expect(await h.repo.forms.submissions(h.ctxB)).toEqual([]);
    expect(await h.repo.forms.fields(h.ctxB, "formv-youth-survey-1")).toEqual([]);
    expect(
      await h.repo.forms.submit(h.ctxB, {
        formId: "form-youth-survey",
        source: "link",
        values: {},
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("special category answers are withheld from a role that may not read them", () => {
  it("returns the submission without them rather than refusing outright", async () => {
    const h = createTwoTenantHarness();
    const result = await h.repo.forms.submit(h.ctxA, {
      formId: "form-youth-survey",
      source: "link",
      values: { respondent_role: text("mentor"), quote_consent: bool(true) },
    });

    // Plant a special category answer directly, since the seeded form has none
    // by design and shipping one to demonstrate a control would be strange.
    h.state.submissionAnswers.push({
      id: "suba-special",
      organisationId: ORG_A,
      submissionId: result.submissionId!,
      fieldKey: "health",
      fieldLabel: "Health conditions",
      fieldType: "textarea",
      sensitivity: "special_category",
      value: text("Sensitive"),
    });

    const programmeLead = createRequestContext({
      organisationId: ORG_A,
      userId: "user-priya",
      role: "programme_lead",
      now: () => NOW,
    });

    const forLead = await h.repo.forms.answers(programmeLead, result.submissionId!);
    expect(forLead.some((answer) => answer.fieldKey === "health")).toBe(false);
    // Refusing the whole submission would make ordinary review impossible.
    expect(forLead.length).toBeGreaterThan(0);

    const forOwner = await h.repo.forms.answers(h.ctxA, result.submissionId!);
    expect(forOwner.some((answer) => answer.fieldKey === "health")).toBe(true);
  });
});
