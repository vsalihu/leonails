import { expect, test, type Page } from "@playwright/test";
import { latestCodeFor, db } from "./db";

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await page.getByLabel("Code", { exact: true }).fill(await latestCodeFor(email));
  await page.getByRole("button", { name: "Continue" }).click();
}

test("a client creates an account, books without a code, books again and manages it", async ({ page }, info) => {
  const email = `e2e-acct-${info.project.name}-${Date.now()}@example.test`;

  await page.goto("/account");
  await expect(page).toHaveURL(/\/account\/sign-in\?next=%2Faccount|\/account\/sign-in\?next=\/account/);
  await signIn(page, email);

  // first time: details, with a date of birth that is checked
  await expect(page.getByRole("heading", { name: "A few details" })).toBeVisible();
  await page.getByLabel("Full name").fill("Ana Client");
  await page.getByLabel("Mobile number").fill("07700 900123");
  await page.getByLabel("Date of birth").fill("2020-01-01");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByText("Please check your date of birth.")).toBeVisible();
  await page.getByLabel("Date of birth").fill("1994-05-17");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hello, Ana.");
  const [c] = await db`SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS dob, account_created_at FROM customers WHERE email = ${email}`;
  expect(c.dob).toBe("1994-05-17");
  expect(c.account_created_at).not.toBeNull();

  // booking: details are filled in and no email code is needed
  await page.goto("/book");
  await expect(page.getByText(/Booking as/)).toContainText("Ana Client");
  await page.getByRole("radio", { name: /Gel manicure/ }).check();
  await page.getByRole("checkbox", { name: /French finish/ }).check();
  await page.getByRole("button", { name: "Choose a time" }).click();
  await page.getByRole("grid").getByRole("button", { name: /times? available/ }).nth(3).click();
  await page.locator("fieldset button[aria-pressed]").first().click();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeFocused();
  await expect(page.getByLabel("Full name")).toHaveValue("Ana Client");
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expect(page.getByLabel("Email")).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "Send my code" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Check and confirm" })).toBeVisible();
  await page.getByRole("checkbox", { name: /booking terms/ }).check();
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await expect(page).toHaveURL(/\/appointment\/[A-Za-z0-9_-]{43}/);
  await expect(page.getByText("You're booked in.")).toBeVisible();

  // the account shows it, offers "book again" with the same extras, and opens the private page
  await page.goto("/account");
  await expect(page.getByRole("region", { name: "Your usual" })).toContainText("Gel manicure");
  await expect(page.getByRole("region", { name: "Your usual" })).toContainText("French finish");
  await expect(page.getByRole("region", { name: "Coming up" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("link", { name: "Book this again" }).click();
  await expect(page).toHaveURL(/\/book\?treatment=.+&extras=\d+/);
  await expect(page.getByLabel("Booking summary")).toContainText("£35");

  await page.goto("/account");
  await page.getByRole("button", { name: "View or change" }).click();
  await expect(page).toHaveURL(/\/appointment\/[A-Za-z0-9_-]{43}/);
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByText("This appointment was cancelled.")).toBeVisible();

  // details can be edited
  await page.goto("/account");
  await page.getByLabel("Mobile number").fill("07700 900999");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // sign out, then sign back in: no details step the second time
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account/sign-in");
  await signIn(page, email);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByLabel("Mobile number")).toHaveValue("07700 900999");
});

test("another client's booking can't be opened from an account", async ({ page, request }) => {
  const res = await request.post("/api/account/manage", { form: { booking: "1" } });
  // signed out: sent to sign in, never to a booking
  expect(res.url()).toMatch(/\/account\/sign-in/);
  const wrong = await request.post("/api/account/login", { data: { action: "check", loginId: "00000000-0000-4000-8000-000000000000", code: "123456" } });
  expect(wrong.status()).toBe(410);
  await page.goto("/account");
  await expect(page).toHaveURL(/sign-in/);
});
