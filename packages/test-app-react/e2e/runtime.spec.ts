import { expect, test } from "@playwright/test";

test("launches with explicit host context and auto-finalizes once on verified completion", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("launch-button").click();
  await expect(page.getByTestId("launch-context")).toContainText('"version":1');
  await expect(page.getByTestId("launch-context")).toContainText('"id":"northstar_checkout_v1"');
  await page.getByTestId("complete-button").click();
  await expect(page.getByTestId("activity-evidence-count")).toHaveText("1");
  await expect(page.getByTestId("finalization-count")).toHaveText("1");
  await expect(page.getByTestId("recorder-state")).toHaveText("completed");
});
