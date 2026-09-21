import { expect, type Page, test } from "@playwright/test";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/** Signs in through a real magic link from the mock-bot server. */
async function login(page: Page) {
  const response = await page.request.get(`${apiUrl}/__dev/login-link`);
  expect(response.ok()).toBe(true);
  const { url } = (await response.json()) as { url: string };
  const callback = new URL(url);
  await page.goto(`${callback.pathname}${callback.search}`);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("redirects to the login page without a session", async ({ page }) => {
  await page.goto("/users");
  await expect(page).toHaveURL(/\/login\?next=%2Fusers/);
  await expect(page.getByRole("heading", { name: /Sign in/ })).toBeVisible();
  await expect(page.getByText("/admin", { exact: true })).toBeVisible();
});

test("logs in with a magic link and sees the dashboard", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Total users")).toBeVisible();
  await page.getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
});

test("an expired link is rejected", async ({ page }) => {
  await page.goto("/auth/callback?token=this-token-does-not-exist-anywhere");
  await expect(page.getByText(/invalid or has expired/)).toBeVisible();
});

test("composes, previews and sends a broadcast", async ({ page }) => {
  await login(page);
  await page.goto("/broadcasts/new");

  const message = `<b>Smoke test</b> ${Date.now()}`;
  await page.getByLabel("Message", { exact: true }).fill(message);
  await page.getByLabel("Button text (optional)").fill("Open");
  await page.getByLabel("Button URL").fill("https://example.com");

  // Live Telegram-like preview.
  await expect(page.locator("strong", { hasText: "Smoke test" })).toBeVisible();

  await page.getByRole("button", { name: "Send preview to me" }).click();
  await expect(page.getByText("Preview sent to your Telegram")).toBeVisible();
  await expect(page).toHaveURL(/\/broadcasts\/[a-z0-9]+$/);

  await page.getByRole("button", { name: "Start broadcast" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Start broadcast" }).click();
  await expect(page.getByText("Completed")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/of \d+ handled/)).toBeVisible();
});
