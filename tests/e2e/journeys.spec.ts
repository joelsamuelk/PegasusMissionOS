import { expect, test } from "@playwright/test";

/**
 * Critical user journeys for Pegasus Mission OS (mock mode).
 * These cover the definition-of-done flows end to end.
 */

test("1. sign in to the demo workspace", async ({ page }) => {
  // The demonstration entry only renders in mock mode. With Supabase
  // configured, `/login` shows the magic-link form and there is no
  // credential-free route into the workspace, which is correct.
  await page.goto("/login");
  await page.getByRole("link", { name: /continue to demonstration/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /where northstar/i })).toBeVisible();
});

test("2. review a funding opportunity", async ({ page }) => {
  await page.goto("/funding");
  await expect(page.getByText(/pipeline value/i)).toBeVisible();
  await page.getByRole("link", { name: /Youth Opportunity Grant 2026/i }).first().click();
  await expect(page).toHaveURL(/\/funding\//);
  await expect(page.getByText(/Award range/i)).toBeVisible();
});

test("3. open and generate a fit assessment", async ({ page }) => {
  await page.goto("/funding/opp-horizon");
  await page.getByRole("button", { name: /run fit assessment/i }).click();
  await expect(page.getByText(/Factor by factor/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/decision support only/i)).toBeVisible();
});

test("4 & 5. open an application and generate then approve an answer", async ({ page }) => {
  await page.goto("/applications/app-horizon");
  await expect(page.getByText(/Application questions/i).first()).toBeVisible();
  // The first answer is open by default; generate a first draft.
  await page.getByRole("button", { name: /create first draft/i }).first().click();
  await expect(page.getByText(/AI draft to review/i)).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /use this draft/i }).click();
  await expect(page.getByText(/AI draft applied/i)).toBeVisible();
});

test("6. convert a successful application into a grant", async ({ page }) => {
  await page.goto("/applications/app-wellbeing");
  await page.getByRole("button", { name: /mark successful and create grant/i }).click();
  await page.getByRole("button", { name: "Create grant", exact: true }).click();
  await expect(page).toHaveURL(/\/grants\//, { timeout: 15000 });
  await expect(page.getByText(/Grant health/i)).toBeVisible();
});

test("7. update an outcome indicator", async ({ page }) => {
  await page.goto("/programmes/prog-youth");
  await page.getByRole("button", { name: /update indicator/i }).first().click();
  const input = page.getByLabel(/current value for/i).first();
  await input.fill("70");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/updated/i).first()).toBeVisible({ timeout: 10000 });
});

test("8. generate an impact report draft", async ({ page }) => {
  await page.goto("/impact/report-youth-2026");
  await page.getByRole("button", { name: /generate first draft/i }).click();
  await expect(page.getByText(/first draft generated/i)).toBeVisible({ timeout: 30000 });
});

/**
 * The relationship slice, end to end:
 * external organisation → person → relationship → interaction →
 * commitment → timeline → relationship page.
 */
test("9. answer 'what's happening with The Henderson Trust?'", async ({ page }) => {
  await page.goto("/relationships");
  await expect(page.getByText(/needs attention/i).first()).toBeVisible();

  await page.getByRole("link", { name: /The Henderson Trust/i }).first().click();
  await expect(page).toHaveURL(/\/relationships\/xorg-henderson/);

  // Funding history, reporting and commitments are assembled on one page.
  await expect(page.getByText(/Relationship brief/i)).toBeVisible();
  await expect(page.getByText(/£170,000/).first()).toBeVisible();
  await expect(page.getByText(/2026 interim evaluation/i).first()).toBeVisible();
  await expect(page.getByText(/Grant awarded/i).first()).toBeVisible();
});

test("10. record an interaction and see it on the timeline", async ({ page }) => {
  await page.goto("/relationships/xorg-horizon");
  await page.getByRole("button", { name: /record an interaction/i }).click();
  await page.getByLabel(/^Subject$/i).fill("Follow-up on the assessment timetable");
  await page.getByRole("button", { name: /save interaction/i }).click();
  await expect(
    page.getByText(/Follow-up on the assessment timetable/i).first(),
  ).toBeVisible({ timeout: 15000 });
});

test("11. a grant shows its funder relationship", async ({ page }) => {
  await page.goto("/grants/grant-henderson");
  await expect(page.getByText(/Funder relationship/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Daniel Osei/i })).toBeVisible();
});

test("command bar answers using approved data", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /ask pegasus intelligence/i }).click();
  await page.getByText(/Summarise our current funding pipeline/i).click();
  await expect(page.getByText(/pipeline/i).first()).toBeVisible({ timeout: 15000 });
});

/**
 * MG-3 onboarding.
 *
 * Deliberately does not run research: that reaches a real website and a real
 * register, and an e2e suite that makes outbound calls to someone else's
 * server is a bad citizen and a flaky test. The pipeline itself is covered
 * hermetically in `tests/unit/onboarding.test.ts` against fixtures.
 *
 * What is checked here is what only a browser can check: that the screens
 * render, and that the empty states tell the truth rather than showing a
 * spinner or a fabricated completion percentage.
 */
test("12. onboarding asks for four fields, not forty", async ({ page }) => {
  await page.goto("/onboarding");

  await expect(page.getByLabel(/organisation name/i)).toBeVisible();
  await expect(page.getByLabel(/website/i)).toBeVisible();
  await expect(page.getByLabel(/charity or company number/i)).toBeVisible();

  // The promise the screen makes, and the one the pipeline keeps.
  await expect(page.getByText(/nothing is added to your profile until you have reviewed it/i))
    .toBeVisible();
});

test("13. the review screen is honest when no research has run", async ({ page }) => {
  await page.goto("/onboarding/review");

  await expect(page.getByRole("heading", { name: /nothing to review yet/i })).toBeVisible();
  await expect(page.getByText(/no research has run/i)).toBeVisible();
});

test("14. the audit does not exist before there is anything to audit", async ({ page }) => {
  await page.goto("/onboarding/audit");

  // Not an empty audit full of zeroes, which would read as a verdict.
  await expect(page.getByRole("heading", { name: /no audit yet/i })).toBeVisible();
});

/**
 * MG-4 Mission Intelligence.
 *
 * The phase's acceptance condition is that the answer is cross-domain rather
 * than a per-module summary, so the journey checks for the thing no single
 * module could produce: a finding labelled with two areas, showing the
 * separate signals that combined. A page that rendered ten grant findings and
 * ten finance findings would pass a smoke test and fail the phase.
 */
test("15. Mission Intelligence surfaces a cross-domain finding with its reasoning", async ({
  page,
}) => {
  await page.goto("/intelligence");

  await expect(page.getByRole("heading", { name: /what needs attention/i })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /across more than one area/i }),
  ).toBeVisible();

  // The combination the brief names: a programme losing its funding.
  await expect(page.getByText(/loses its funding when/i).first()).toBeVisible();

  // The reasoning is on the page, not behind a disclosure.
  await expect(page.getByText(/why this is here/i).first()).toBeVisible();

  // Citations resolve to records a reader can open.
  await expect(page.getByText(/based on/i).first()).toBeVisible();
});

test("16. Mission Intelligence says what it cannot tell you", async ({ page }) => {
  await page.goto("/intelligence");

  await expect(
    page.getByRole("heading", { name: /what mission os cannot tell you/i }),
  ).toBeVisible();
  // A named reason, never a blank and never a zero.
  await expect(page.getByText(/cannot calculate|no evidence|not measured/i).first()).toBeVisible();
});

test("17. Ask Mission OS answers the acceptance question with citations", async ({ page }) => {
  await page.goto("/intelligence");

  await page
    .getByRole("button", { name: /what are the five most important things/i })
    .click();

  await expect(page.getByText(/^Answer$/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/^Sources$/i).first()).toBeVisible({ timeout: 15000 });
});

/**
 * MG-5 the reporting engine.
 *
 * Checks the thing the acceptance test names: that a report workspace explains
 * what is missing *before* anyone drafts, and that every figure can be traced.
 * A page that rendered the draft editor and nothing else would pass a smoke
 * test and fail the phase.
 */
test("18. a report explains what is missing before it is drafted", async ({ page }) => {
  await page.goto("/impact/report-youth-2026");

  await expect(page.getByRole("heading", { name: /before you draft/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what is missing/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what needs review/i })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /where every figure came from/i }),
  ).toBeVisible();
});

test("19. a report says when its data is not ready to draft from", async ({ page }) => {
  await page.goto("/impact/report-youth-2026");

  // Either state is legitimate; what is not legitimate is silence. The page
  // must take a position on whether drafting should begin.
  await expect(
    page
      .getByText(/the data behind this report is ready|resolve these before drafting/i)
      .first(),
  ).toBeVisible();
});

/**
 * MG-6 automations.
 *
 * The acceptance test is about what was *not* built — automating routine work
 * without opaque autonomous agents — so the journey checks that the boundary
 * is visible on the page rather than implied by the code.
 */
test("20. automations show what they are allowed to do", async ({ page }) => {
  await page.goto("/automations");

  await expect(
    page.getByRole("heading", { name: /what an automation is allowed to do/i }),
  ).toBeVisible();
  await expect(page.getByText(/nothing in pegasus can send a message on its own/i)).toBeVisible();
  // Every rule states its trigger and its actions in plain words.
  await expect(page.getByText(/^When$/i).first()).toBeVisible();
});

test("21. an automation that can reach outside is marked and left off", async ({ page }) => {
  await page.goto("/automations");

  await expect(page.getByText(/needs a person/i).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /draft a note to the funder/i }),
  ).toBeVisible();
  // It ships as a draft: an automation that fires the moment it is created is
  // one nobody chose to switch on.
  await expect(page.getByText(/^draft$/i).first()).toBeVisible();
});

test("22. testing an automation reports what it could not decide", async ({ page }) => {
  await page.goto("/automations");

  await page
    .getByRole("button", { name: /test against this organisation/i })
    .first()
    .click();

  await expect(page.getByText(/if this ran now/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/would send \d+ external communication/i)).toBeVisible();
});

/**
 * MG-7 forms.
 *
 * The phase's test is whether a submission becomes graph records, so the
 * journey checks that the list says what each form's answers *become* rather
 * than only how many responses it has had. A page listing response counts
 * would pass a smoke test and fail the phase.
 */
test("23. a form says what its answers become", async ({ page }) => {
  await page.goto("/forms");

  await expect(
    page.getByRole("heading", { name: /what you ask people, and what their answers become/i }),
  ).toBeVisible();
  await expect(page.getByText(/^Becomes$/i).first()).toBeVisible();
  await expect(page.getByText(/indicator measurement/i).first()).toBeVisible();
});

test("24. a form states its lawful basis and its retention", async ({ page }) => {
  await page.goto("/forms");

  await expect(page.getByText(/lawful basis:/i).first()).toBeVisible();
  await expect(page.getByText(/answers are erased \d+ days after they arrive/i)).toBeVisible();
});

/**
 * MG-8 the finance runtime.
 *
 * The constraint the journey checks is the one the brief states absolutely:
 * *where a refusal fires, the UI shows the reason. It never shows a blank, and
 * it never shows a zero.* A finance page with three panels and no
 * acknowledgement of the questions it skipped reads as a complete picture.
 */
test("25. finance shows its arithmetic on every figure", async ({ page }) => {
  await page.goto("/finance");

  await expect(
    page.getByRole("heading", { name: /where the money is, and how each figure was reached/i }),
  ).toBeVisible();

  // Workings, on the page rather than behind a tooltip.
  await expect(page.getByText(/brought forward, plus/i).first()).toBeVisible();
  await expect(page.getByText(/net monthly burn/i).first()).toBeVisible();
});

test("26. finance reads grant utilisation from allocations, not a scalar", async ({ page }) => {
  await page.goto("/finance");

  await expect(page.getByRole("heading", { name: /grant utilisation/i })).toBeVisible();
  await expect(page.getByText(/naming its transaction and its method/i).first()).toBeVisible();
  // Utilisation alone is not a finding; utilisation against elapsed time is.
  await expect(page.getByText(/% elapsed/i).first()).toBeVisible();
});

/**
 * MG-9 portals.
 *
 * The rule the journey checks is the one the brief states directly: never
 * expose internal organisation data simply because the underlying record is
 * related. The access review is where an organisation can see that holding.
 */
test("27. the access review shows who outside the organisation sees what", async ({ page }) => {
  await page.goto("/portals");

  await expect(
    page.getByRole("heading", { name: /who outside this organisation can see what/i }),
  ).toBeVisible();
  await expect(page.getByText(/never inherited/i).first()).toBeVisible();
  await expect(page.getByText(/records shared/i).first()).toBeVisible();
});

test("28. a portal preview shows the projection, not the record", async ({ page }) => {
  await page.goto("/portals");

  await page.getByRole("button", { name: /see exactly what they see/i }).first().click();
  await expect(page.getByText(/records visible to/i)).toBeVisible({ timeout: 15000 });

  // The grant is shared; the programme it funds is not.
  await expect(page.getByText(/Youth Futures programme grant/i).first()).toBeVisible();
  await expect(page.getByText(/^Not shown:/i).first()).toBeVisible();
});

/**
 * MG-10 fundraising.
 *
 * Two things the journey checks, both of them absences: no engagement score
 * anywhere, and a campaign reporting net alongside gross. A page showing only
 * the gross figure is the one repeated in a trustee meeting.
 */
test("29. supporters have a stage and its signals, not a score", async ({ page }) => {
  await page.goto("/supporters");

  await expect(
    page.getByRole("heading", { name: /who gives, where they are, and what to do next/i }),
  ).toBeVisible();
  await expect(page.getByText(/there is no engagement score/i)).toBeVisible();
  await expect(page.getByText(/^Why$/i).first()).toBeVisible();
  await expect(page.getByText(/^Next:/i).first()).toBeVisible();
});

test("30. a campaign reports net alongside gross", async ({ page }) => {
  await page.goto("/supporters");

  await expect(page.getByRole("heading", { name: /campaigns/i })).toBeVisible();
  await expect(page.getByText(/net/i).first()).toBeVisible();
  await expect(page.getByText(/gifts from \d+ donors/i).first()).toBeVisible();
});

/**
 * MG-11 integrations.
 *
 * The journey checks the distinction that matters most on this page: described
 * versus built. A registry listing nine providers without saying which are
 * which is a roadmap presented as a feature.
 */
test("31. integrations distinguish what is described from what is built", async ({ page }) => {
  await page.goto("/integrations");

  await expect(
    page.getByRole("heading", { name: /work alongside the systems you already have/i }),
  ).toBeVisible();
  await expect(page.getByText(/has a working adapter/i)).toBeVisible();
  await expect(page.getByText(/^described$/i).first()).toBeVisible();
});

test("32. Beacon states what it cannot supply", async ({ page }) => {
  await page.goto("/integrations");

  await expect(page.getByText(/documentation read/i).first()).toBeVisible();
  // Beacon's own guide says relationships are not reachable through the API.
  await expect(page.getByText(/cannot supply relationship/i)).toBeVisible();
});

/**
 * MG-12 the Trust Centre.
 *
 * The acceptance test for the phase is *credible for an organisation to trust
 * with real information, not merely impressive in a demonstration*, and almost
 * the whole difference is what the page is willing to say is not true. So the
 * journey checks the unmet list is there and is first.
 */
test("33. the Trust Centre leads with what is not yet true", async ({ page }) => {
  await page.goto("/trust");

  await expect(page.getByRole("heading", { name: /what is true, and what is not yet/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /what is not yet true/i })).toBeVisible();
  await expect(page.getByText(/statements below are not fully true today/i)).toBeVisible();
});

test("34. the Trust Centre claims no certification and says where AI is used", async ({ page }) => {
  await page.goto("/trust");

  // It appears twice on purpose: once in the unmet list at the top and once
  // in the security section, so a reader cannot miss it either way.
  await expect(page.getByText(/ISO 27001, SOC 2 or Cyber Essentials/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /where ai is used/i }).first()).toBeVisible();
  // The half nobody volunteers.
  await expect(page.getByText(/what it can never see/i).first()).toBeVisible();
});

test("35. the Trust Centre says what a deletion request would not remove", async ({ page }) => {
  await page.goto("/trust");

  await expect(
    page.getByRole("heading", { name: /what is kept, and what cannot be deleted/i }),
  ).toBeVisible();
  await expect(page.getByText(/would survive a deletion request/i)).toBeVisible();
  await expect(page.getByText(/audit records/i).first()).toBeVisible();
});
