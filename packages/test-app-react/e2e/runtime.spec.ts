import { expect, test } from "@playwright/test";

test("captures browser events and flushes them into the local sink", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("cta-button").click();
  await page.getByTestId("email-input").fill("person@example.com");
  await page.getByTestId("plan-select").selectOption("pro");
  await page.getByTestId("submit-button").click();
  await page.getByTestId("history-button").click();
  await page.getByTestId("hash-button").click();
  await page.getByTestId("flush-button").click();

  await expect(page.getByTestId("batch-count")).toHaveText("1");
  await expect(page.getByTestId("captured-event-names")).toContainText("dom.click");
  await expect(page.getByTestId("captured-event-names")).toContainText("dom.input");
  await expect(page.getByTestId("captured-event-names")).toContainText("dom.change");
  await expect(page.getByTestId("captured-event-names")).toContainText("dom.submit");
  await expect(page.getByTestId("captured-event-names")).toContainText("navigation");
  await expect(page.getByTestId("route")).toHaveText("/checkout#confirmation");
  await expect(page.getByTestId("latest-batch")).toContainText('"reason": "manual_flush"');

  await page.getByTestId("complete-button").click();
  await expect(page.getByTestId("completion-count")).toHaveText("1");
});
