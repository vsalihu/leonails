import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { db } from "./db";

const ORIGIN = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin;

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "rugile@example.test";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "dev-password-1234";

test("admin uploads a hero video; homepage plays it with a pause control; ranges work; reduced motion shows the still", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // invalid "video" is rejected by signature
  const bad = await page.request.post("/api/admin/media", {
    headers: { origin: ORIGIN },
    multipart: { usage: "site", file: { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("definitely not a video") } },
  });
  expect(bad.status()).toBe(422);

  const res = await page.request.post("/api/admin/media", {
    headers: { origin: ORIGIN },
    multipart: { usage: "site", file: { name: "hero.mp4", mimeType: "video/mp4", buffer: readFileSync("tests/e2e/fixtures/hero-test.mp4") } },
  });
  expect(res.status()).toBe(200);
  const { id } = await res.json();

  await page.goto("/admin/gallery?show=site");
  const card = page.locator("li", { has: page.locator(`input[name=id][value="${id}"]`) }).first();
  await card.getByLabel("Description (alt text)").fill("Glossy almond nails on leopard silk");
  await card.getByLabel("Use on website as (optional)").selectOption("home.hero.video");
  await card.getByLabel("Published").check();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();

  await page.goto("/");
  const video = page.locator(".hero-image video");
  await expect(video).toHaveAttribute("autoplay", "");
  await expect(page.getByRole("button", { name: "Pause video" })).toBeVisible();
  const src = await video.locator("source").getAttribute("src");
  const ranged = await page.request.get(src!, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(100);
  expect(ranged.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);

  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const calm = await ctx.newPage();
  await calm.goto("/");
  await expect(calm.locator(".hero-image video")).toHaveCount(0);
  await expect(calm.locator(".hero-image img")).toBeVisible();
  await ctx.close();

  // clean up so the placeholder hero image is used again
  await db`DELETE FROM site_images WHERE slot = 'home.hero.video'`;
});
