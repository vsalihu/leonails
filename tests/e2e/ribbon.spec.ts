import { expect, test } from "@playwright/test";
import { db } from "./db";

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "rugile@example.test";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "dev-password-1234";

test("the admin publishes a rotating ribbon with a copyable code; visitors can pause and close it", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop");
  const [before] = await db`SELECT is_enabled, messages FROM announcement_ribbon WHERE id = 1`;
  try {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto("/admin/settings?tab=ribbon");
    await page.getByLabel("Show the ribbon on the website").check();
    const rows = page.locator("fieldset");
    await rows.nth(0).getByLabel("Message").fill("Autumn appointments are open");
    await rows.nth(0).getByLabel("Link (optional)").fill("/book");
    await rows.nth(1).getByLabel("Message").fill("First visit? 20% off your treatment");
    await rows.nth(1).getByLabel("Offer code (optional)").fill("welcome20");
    await rows.nth(2).getByLabel("Message").fill("Bad link");
    await rows.nth(2).getByLabel("Link (optional)").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Use a page on this site")).toBeVisible();
    for (const i of [2, 3, 4]) {
      await rows.nth(i).getByLabel("Message").fill("");
      await rows.nth(i).getByLabel("Offer code (optional)").fill("");
      await rows.nth(i).getByLabel("Link (optional)").fill("");
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("The ribbon is live.")).toBeVisible();

    await page.goto("/");
    const ribbon = page.getByRole("region", { name: "Announcements" });
    await expect(ribbon).toContainText("Autumn appointments are open");
    await expect(ribbon.getByRole("link", { name: /Autumn appointments/ })).toHaveAttribute("href", "/book");
    // rotates to the second message, with the code normalised to capitals
    await expect(ribbon.getByRole("button", { name: "Copy code WELCOME20" })).toBeVisible({ timeout: 10_000 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await ribbon.getByRole("button", { name: "Copy code WELCOME20" }).click();
    await expect(ribbon.getByRole("button", { name: "Code WELCOME20 copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("WELCOME20");

    await ribbon.getByRole("button", { name: "Pause announcements" }).click();
    await expect(ribbon.getByRole("button", { name: "Play announcements" })).toBeVisible();
    await ribbon.getByRole("button", { name: "Close announcements" }).click();
    await expect(ribbon).toHaveCount(0);
    await page.goto("/gallery");
    await expect(page.getByRole("region", { name: "Announcements" })).toHaveCount(0); // stays closed for the visit
  } finally {
    await db`UPDATE announcement_ribbon SET is_enabled = ${before.is_enabled}, messages = ${db.json(before.messages)} WHERE id = 1`;
  }
});
