import { expect, test } from "@playwright/test";

async function startScenario(page: import("@playwright/test").Page, scenario: string) {
  await page.goto("/");
  await page.getByTestId("scenario-select").selectOption(scenario);
  await page.getByTestId("start-embedded-button").click();
  await expect(page.getByTestId("overlay-mounted")).toHaveText("true");
  await expect(page.getByTestId("runtime-state")).toHaveText("READY");
}

async function driveHostActivity(page: import("@playwright/test").Page) {
  await page.getByTestId("cta-button").click();
  await page.getByTestId("email-input").fill("person@example.com");
  await page.getByTestId("plan-select").selectOption("pro");
  await page.getByTestId("submit-button").click();
}

test("happy path: trigger -> overlay -> interview active -> events persisted -> complete", async ({
  page,
}) => {
  await startScenario(page, "happy_path");

  await expect(page.getByTestId("interview-state")).toHaveText("active");

  await driveHostActivity(page);
  await page.getByTestId("history-button").click();
  await page.getByTestId("hash-button").click();
  await page.getByTestId("flush-button").click({ force: true });

  await expect(page.getByTestId("persisted-event-count")).not.toHaveText("0");
  await expect(page.getByTestId("route")).toHaveText("/checkout#confirmation");

  await page.getByTestId("complete-button").click({ force: true });
  await expect(page.getByTestId("completion-count")).toHaveText("1");
  await expect(page.getByTestId("interview-state")).toHaveText("ended");
});

test("invalid origin is rejected and runtime stays safe", async ({ page }) => {
  await startScenario(page, "reject_origin");
  await driveHostActivity(page);
  await page.getByTestId("flush-button").click({ force: true });

  await expect(page.getByTestId("persisted-event-count")).toHaveText("0");
  await expect(page.getByTestId("rejection-reasons")).toContainText("invalid_origin");
  await expect(page.getByTestId("interview-state")).toHaveText("safe_rejecting");
});

test("invalid or missing environment payload is rejected", async ({ page }) => {
  await startScenario(page, "reject_environment");
  await driveHostActivity(page);
  await page.getByTestId("flush-button").click({ force: true });

  await expect(page.getByTestId("persisted-event-count")).toHaveText("0");
  await expect(page.getByTestId("rejection-reasons")).toContainText("invalid_environment");
});

test("stale session rejects post-complete batches", async ({ page }) => {
  await startScenario(page, "stale_session");
  await driveHostActivity(page);
  await page.getByTestId("flush-button").click({ force: true });
  await expect(page.getByTestId("persisted-event-count")).not.toHaveText("0");

  await page.getByTestId("complete-button").click({ force: true });
  await expect(page.getByTestId("interview-state")).toHaveText("ended");

  await page.getByTestId("post-complete-batch-button").click({ force: true });
  await expect(page.getByTestId("rejection-reasons")).toContainText("stale_session");
});

test("reconnect path resumes ingestion after offline interval", async ({ page }) => {
  await startScenario(page, "reconnect");
  await expect(page.getByTestId("embedded-online")).toHaveText("false");

  await driveHostActivity(page);
  await page.getByTestId("flush-button").click({ force: true });
  await expect(page.getByTestId("queued-batch-count")).not.toHaveText("0");

  await page.getByTestId("network-online-button").click({ force: true });
  await expect(page.getByTestId("embedded-online")).toHaveText("true");
  await expect(page.getByTestId("queued-batch-count")).toHaveText("0");
  await expect(page.getByTestId("persisted-event-count")).not.toHaveText("0");

  await driveHostActivity(page);
  await page.getByTestId("flush-button").click({ force: true });
  await expect(page.getByTestId("persisted-event-count")).not.toHaveText("0");
});
