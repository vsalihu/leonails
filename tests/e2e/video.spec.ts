import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { db } from "./db";

const ORIGIN = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin;

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "rugile@example.test";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "dev-password-1234";

test("admin uploads hero films; homepage plays them with a pause control; ranges work; reduced motion shows a still frame", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop");
  // Restore whatever films the site had before this test.
  const before = await db`SELECT slot, media_id FROM site_images WHERE slot IN ('home.hero.video', 'home.hero.video.mobile')`;
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

  // the same clip as the portrait film for phones
  await page.reload();
  await card.getByLabel("Use on website as (optional)").selectOption("home.hero.video.mobile");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();

  await page.goto("/");
  const video = page.locator(".hero-film video");
  await expect(video).toHaveAttribute("aria-label", "Video: Glossy almond nails on leopard silk");
  // playback is started from JS (never the autoplay attribute) so reduced-motion visitors never see motion
  await expect(video).not.toHaveAttribute("autoplay", /.*/);
  await expect(video).toHaveJSProperty("muted", true);
  await expect(page.getByRole("button", { name: "Pause video" })).toBeVisible();
  await expect(video.locator("source")).toHaveCount(2);
  await expect(video.locator("source").first()).toHaveAttribute("media", "(max-width: 1023px)");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const src = await video.locator("source").last().getAttribute("src");
  const ranged = await page.request.get(src!, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(100);
  expect(ranged.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);

  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const calm = await ctx.newPage();
  await calm.goto("/");
  const still = calm.locator(".hero-film video");
  await expect(still).toBeAttached();
  await expect(still).toHaveJSProperty("paused", true);
  await expect(calm.getByRole("button", { name: "Pause video" })).toHaveCount(0);
  await ctx.close();

  await db`DELETE FROM site_images WHERE slot IN ('home.hero.video', 'home.hero.video.mobile')`;
  for (const r of before) await db`INSERT INTO site_images (slot, media_id) VALUES (${r.slot}, ${r.media_id})`;
});
