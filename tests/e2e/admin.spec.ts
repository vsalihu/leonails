import { expect, test } from "@playwright/test";
import { db } from "./db";

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "rugile@example.test";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "dev-password-1234";


test("admin pages require a session", async ({ request }) => {
  for (const path of ["/admin", "/admin/bookings", "/admin/settings?tab=address", "/admin/customers"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers()["location"]).toContain("/admin/login");
  }
  // even with a forged cookie, the server rejects it
  const res = await request.get("/admin/settings?tab=address", { headers: { cookie: "admin_session=forged" } });
  expect(await res.text()).not.toContain("PLACEHOLDER ADDRESS");
  const up = await request.post("/api/admin/media", { headers: { origin: "http://localhost:3000" }, multipart: { file: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } } });
  expect(up.status()).toBe(401);
});

test("admin signs in, books a client manually, completes and records payment", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // manual booking on a date 9 days ahead at a free time
  const [slot] = await db`
    WITH d AS (SELECT (now() AT TIME ZONE 'Europe/London')::date + 9 AS day)
    SELECT to_char(day, 'YYYY-MM-DD') AS day FROM d`;
  await page.goto("/admin/bookings/new");
  await page.getByLabel("Customer name").fill("Walk In Client");
  await page.getByLabel("Email", { exact: true }).fill(`walkin-${Date.now()}@example.test`);
  await page.getByLabel("Date", { exact: true }).fill(slot.day);
  await page.getByLabel("Start time").fill("16:15");
  await page.getByLabel("Allow outside working hours").check();
  await page.getByLabel("Email a confirmation").uncheck();
  await page.getByRole("button", { name: "Create booking" }).click();
  await expect(page.getByText("Booking created.")).toBeVisible();

  // an overlapping manual booking is refused
  const url = page.url();
  await page.goto("/admin/bookings/new");
  await page.getByLabel("Customer name").fill("Overlap Client");
  await page.getByLabel("Email", { exact: true }).fill(`overlap-${Date.now()}@example.test`);
  await page.getByLabel("Date", { exact: true }).fill(slot.day);
  await page.getByLabel("Start time").fill("16:30");
  await page.getByLabel("Allow outside working hours").check();
  await page.getByRole("button", { name: "Create booking" }).click();
  await expect(page.getByText(/overlaps another appointment/)).toBeVisible();

  await page.goto(url);
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Reason", { exact: true }).fill("Test clean-up");
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(page.getByText(/Cancelled on .*Reason: Test clean-up/)).toBeVisible();
});

test("admin can see every section on a phone without horizontal overflow", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const path of ["/admin", "/admin/calendar", "/admin/calendar?view=day", "/admin/bookings", "/admin/customers", "/admin/treatments", "/admin/promotions", "/admin/gallery", "/admin/reviews", "/admin/messages", "/admin/settings", "/admin/settings?tab=hours"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
