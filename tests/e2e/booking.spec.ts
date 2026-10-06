import { expect, test } from "@playwright/test";
import { latestCodeFor, db } from "./db";

test.afterAll(async () => {
  await db.end();
});

test("a guest books, verifies their email, sees the private address and can cancel", async ({ page }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.test`;
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: "Book an appointment" })).toBeVisible();

  await page.getByRole("radio", { name: /Gel manicure/ }).check();
  await page.getByRole("checkbox", { name: /French finish/ }).check();
  await expect(page.getByLabel("Booking summary")).toContainText("£35");
  await page.getByRole("button", { name: "Choose a time" }).click();

  // first available day, then a time
  // a day beyond the 24 h change cutoff, so the customer can still cancel online
  const day = page.getByRole("grid").getByRole("button", { name: /times? available/ }).nth(2);
  await day.click();
  await page.locator("fieldset button[aria-pressed]").first().click();

  await expect(page.getByRole("heading", { name: "Your details" })).toBeFocused();
  await expect(page.getByText(/Your time is reserved until/)).toBeVisible();
  await page.getByLabel("Full name").fill("Ema Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill("07700 900456");
  await page.getByRole("button", { name: "Send my code" }).click();
  await expect(page.getByText(/sent a 6-digit code/)).toBeVisible();

  const code = await latestCodeFor(email);
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Check and confirm" })).toBeVisible();
  await page.getByLabel("Offer code").fill("welcome20");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator("#promo-note")).toContainText("£28");

  // terms are required
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await expect(page.getByText(/confirm you've read the booking terms/)).toBeVisible();
  await page.getByRole("checkbox", { name: /booking terms/ }).check();
  await page.getByRole("button", { name: "Confirm appointment" }).click();

  await expect(page).toHaveURL(/\/appointment\/[A-Za-z0-9_-]{43}/);
  await expect(page.getByText("You're booked in.")).toBeVisible();
  await expect(page.getByText(/PLACEHOLDER ADDRESS|Secret|Lane|Road|Street/i).first()).toBeVisible();
  await expect(page.getByText("£28")).toBeVisible();

  const [b] = await db`SELECT status, total_pence FROM bookings WHERE customer_email = ${email}`;
  expect(b).toMatchObject({ status: "confirmed", total_pence: 2800 });

  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByText("This appointment was cancelled.")).toBeVisible();
  await expect(page.getByText(/PLACEHOLDER ADDRESS/)).toHaveCount(0);
});

test("the public site never exposes the private address", async ({ page, request }) => {
  const [loc] = await db`SELECT address_lines FROM private_location WHERE id = 1`;
  const needle = String(loc.address_lines).slice(0, 24);
  for (const path of ["/", "/book", "/treatments", "/gallery", "/reviews", "/about", "/contact", "/policies/privacy"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBeLessThan(400);
    expect(await res.text(), path).not.toContain(needle);
  }
  await page.goto("/");
  const scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.src).filter(Boolean));
  for (const src of scripts) {
    const res = await request.get(src);
    expect(await res.text(), src).not.toContain(needle);
  }
});

test("guessing a booking link reveals nothing", async ({ request }) => {
  for (const path of ["/appointment/1", `/appointment/${"A".repeat(43)}`, `/api/appointment/${"B".repeat(43)}/availability`]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(await res.text()).not.toMatch(/Secret|PLACEHOLDER ADDRESS/);
  }
});
