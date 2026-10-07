import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

const ORIGIN = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin;

// Repeated runs from one machine would otherwise hit the real per-IP limits.
test.beforeEach(async () => {
  await db`DELETE FROM rate_limits WHERE bucket LIKE 'review:%' OR bucket LIKE 'contact%'`;
});

test("contact form validates, stores the enquiry and confirms receipt", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Please enter your name.")).toBeVisible();
  const email = `contact-${Date.now()}@example.test`;
  await page.getByLabel("Name").fill("Lina");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Message").fill("Do you do gel toes as well as hands?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Thank you, your message has been received.")).toBeVisible();
  const [q] = await db`SELECT message FROM enquiries WHERE email = ${email}`;
  expect(q.message).toContain("gel toes");
});

test("review link: invalid upload is rejected, valid review is stored as pending", async ({ page, request }) => {
  const [t] = await db`SELECT id FROM technicians WHERE is_default`;
  const email = `review-${Date.now()}@example.test`;
  const [c] = await db`INSERT INTO customers (email, name) VALUES (${email}, 'Mira Test') RETURNING id`;
  const [b] = await db`
    INSERT INTO bookings (reference, technician_id, customer_id, status, starts_at, ends_at, buffer_minutes, customer_name, customer_email, subtotal_pence, total_pence, source)
    VALUES (${"RN-E2E" + randomBytes(3).toString("hex").toUpperCase()}, ${t.id}, ${c.id}, 'completed', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 15, 'Mira Test', ${email}, 3000, 3000, 'admin') RETURNING id`;
  const token = randomBytes(32).toString("base64url");
  await db`INSERT INTO booking_access_tokens (token_hash, booking_id, purpose, expires_at) VALUES (${createHash("sha256").update(token).digest()}, ${b.id}, 'review', now() + interval '1 day')`;

  const bad = await request.post(`/api/review/${token}`, {
    headers: { origin: ORIGIN },
    multipart: { displayName: "Mira", quote: "Lovely appointment and great shape", consent: "yes", photo: { name: "nails.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really an image") } },
  });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toMatch(/supported image/);

  await page.goto(`/review/${token}`);
  await page.getByLabel("Your review").fill("Lovely appointment and great shape, thank you!");
  await page.getByRole("checkbox", { name: /happy for this review/ }).check();
  await page.getByRole("button", { name: "Send review" }).click();
  await expect(page.getByText("Thank you for your review.")).toBeVisible();
  const [r] = await db`SELECT status, source FROM testimonials WHERE booking_id = ${b.id}`;
  expect(r).toMatchObject({ status: "pending", source: "customer" });
  const again = await request.post(`/api/review/${token}`, { headers: { origin: ORIGIN }, multipart: { displayName: "Mira", quote: "Trying to post a second time", consent: "yes" } });
  expect(again.status()).toBe(409);
  const pub = await request.get("/reviews");
  expect(await pub.text()).not.toContain("great shape, thank you");
});

test("cross-site POSTs to booking endpoints are refused", async ({ request }) => {
  const res = await request.post("/api/booking/hold", { headers: { origin: "https://evil.example" }, data: { treatmentId: 1, extraIds: [], startsAt: new Date().toISOString() } });
  expect(res.status()).toBe(403);
});

test("confirming without a valid hold creates nothing", async ({ request }) => {
  // Requires a real hold; the confirm endpoint still validates the hold first, so any
  // unknown hold returns a safe error and never creates a booking.
  const res = await request.post("/api/booking/confirm", {
    headers: { origin: ORIGIN },
    data: { holdId: "00000000-0000-4000-8000-000000000000", idempotencyKey: "00000000-0000-4000-8000-000000000001", name: "X Y", email: "x@example.test", phone: "07700900123", expectedTotalPence: 1, acceptedTerms: true },
  });
  expect([404, 410]).toContain(res.status());
});
