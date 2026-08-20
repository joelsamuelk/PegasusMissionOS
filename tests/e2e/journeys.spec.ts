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
