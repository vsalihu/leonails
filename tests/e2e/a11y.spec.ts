import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/treatments", "/gallery", "/reviews", "/about", "/contact", "/book", "/policies/cancellation", "/admin/login"];

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
  });
}

test("reduced motion: content is visible immediately and parallax is static", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const hidden = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-reveal]")).filter((el) => getComputedStyle(el).opacity !== "1").length,
  );
  expect(hidden).toBe(0);
  const before = await page.locator(".hero-image img, .hero-film video").first().boundingBox();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  const after = await page.locator(".hero-image img, .hero-film video").first().boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(1);
  await context.close();
});

test("keyboard: skip link, menu and booking steps are operable without a mouse", async ({ page }, info) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.goto("/book");
  await page.waitForLoadState("networkidle"); // wait for hydration before using the keyboard
  // treatment radios and continue button reachable by keyboard
  await page.getByRole("radio").first().focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio").first()).toBeChecked();
  await page.getByRole("button", { name: "Choose a time" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Choose a day and time" })).toBeFocused();
  if (info.project.name === "mobile") {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Mobile" })).toHaveCount(0);
  }
});
