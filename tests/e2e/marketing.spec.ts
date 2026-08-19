import { expect, test } from "@playwright/test";

/**
 * The public marketing site.
 *
 * These cover the two things a visual review misses: whether the interactive
 * sections work by keyboard, and whether the page still tells the truth. The
 * second is the reason this file exists — a marketing claim cannot be checked
 * by a type, and the failure mode is silent.
 *
 * The site is two routes. `/` answers what Pegasus is and stays short;
 * `/product` carries the walkthrough, the four intelligence demos and the
 * explorer. Tests are grouped by the page they belong to, and the link between
 * them is tested too, because a short home page is only an improvement if the
 * detail is still reachable.
 */

test("the page answers what Pegasus is, above the fold", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: /run your whole mission from one place/i,
      level: 1,
    }),
  ).toBeVisible();

  await expect(page.getByText(/one organisation\./i).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /get early access/i }).first(),
  ).toBeVisible();

  // The demo-data disclaimer must survive any rewrite of the hero.
  await expect(page.getByText(/fictional uk charity/i).first()).toBeVisible();

});

test("the home page leads to the detail without repeating it", async ({ page }) => {
  await page.goto("/");

  // The homepage explains the connected context once; the full domain
  // walkthrough remains on the product page.
  await expect(
    page.getByRole("heading", { name: /your mission is connected/i }),
  ).toBeVisible();

  await page.getByRole("link", { name: /see how the context connects/i }).click();
  await expect(page).toHaveURL(/\/product#operating-system$/);
  await expect(
    page.getByRole("heading", { name: /one model of your organisation/i, level: 1 }),
  ).toBeVisible();
});

test("the operating-system map is operable by keyboard", async ({ page }) => {
  await page.goto("/product");
  await page.setViewportSize({ width: 1440, height: 900 });

  const tablist = page.getByRole("tablist", { name: /mission os domains/i });
  await expect(tablist).toBeVisible();

  const firstTab = tablist.getByRole("tab").first();
  await firstTab.focus();
  await expect(firstTab).toHaveAttribute("aria-selected", "true");

  // Arrow keys move selection, and the panel follows.
  await page.keyboard.press("ArrowRight");
  const second = tablist.getByRole("tab").nth(1);
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#domain-panel")).toContainText(/runway|concentration/i);

  await page.keyboard.press("End");
  await expect(tablist.getByRole("tab").last()).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("the mobile menu traps focus and closes on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /open menu/i });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: /site menu/i });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("a figure opens its provenance", async ({ page }) => {
  await page.goto("/product#impact");

  // The seeded fact: a participant count read from an independent evaluation.
  const forecast = page.getByRole("button", { name: /funding gap/i });
  await expect(forecast).toBeVisible();
  await forecast.click();

  const panel = page.getByRole("region", { name: /provenance detail/i });
  // A forecast standing on an assumption is labelled a forecast, whatever its
  // arithmetic looks like. That distinction is the point of the section.
  await expect(panel).toContainText(/forecast/i);
  await expect(panel).toContainText(/deriveFundingNeed/i);
});

test("the homepage names the work the connected system supports", async ({ page }) => {
  await page.goto("/#context");

  await expect(page.getByLabel(/less system-wrangling/i).getByText(/funding, programmes, finance, relationships, evidence, impact and reporting/i)).toBeVisible();
  await expect(page.getByText(/tell pegasus once\. use it everywhere/i)).toBeVisible();
});

test("the product explorer renders real seeded data", async ({ page }) => {
  await page.goto("/product#explore");

  const tablist = page.getByRole("tablist", { name: /product previews/i });
  await tablist.getByRole("tab", { name: /^funding$/i }).click();

  const panel = page.getByRole("tabpanel", { name: /^funding$/i });
  // Seeded opportunities, not invented ones.
  await expect(panel).toContainText(/Youth Opportunity Grant 2026/i);
  await expect(panel).toContainText(/Horizon Fund for Youth/i);
});

test("the homepage labels its demo data as fictional", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/fictional UK charity/i).first()).toBeVisible();
  await expect(page.getByText(/every record in it is labelled as sample data/i).first()).toBeVisible();
});

test("robots keeps the demo workspace out of the index", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  expect(body).toContain("Disallow: /dashboard");
  expect(body).toContain("Sitemap:");
});
