import { expect, test } from "@playwright/test";

/**
 * Critical user journeys for Pegasus Mission OS (mock mode).
 * These cover the definition-of-done flows end to end.
 */

test("1. sign in to the demo workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /continue to workspace/i }).click();
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
