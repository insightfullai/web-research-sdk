import { expect, type FrameLocator, type Page, test } from "@playwright/test";

const STUDY_HOST = "#insightfull-study-42";

async function openInterview(page: Page): Promise<FrameLocator> {
  await expect(page.getByTestId("sdk-status")).toHaveText("ready");
  await page.getByTestId("launch-button").click();
  const interview = page.frameLocator('iframe[title="Checkout interview"]');
  await expect(interview.getByRole("heading", { name: "Help us improve checkout" })).toBeVisible();
  return interview;
}

async function acceptInterview(interview: FrameLocator): Promise<void> {
  await interview.getByRole("button", { name: "Start interview" }).click();
  await expect(interview.getByRole("heading", { name: "You stay in control" })).toBeVisible();
  await interview.getByRole("button", { name: "Allow microphone and join" }).click();
  await expect(interview.getByText("Task 1 of 2")).toBeVisible();
}

test("runs the complete participant journey with customized default appearance", async ({
  page,
}) => {
  await page.goto("/?mode=customized");
  await expect(page.getByTestId("sdk-status")).toHaveText("ready");
  await page.getByTestId("record-button").click();
  const interview = await openInterview(page);

  const host = page.locator(STUDY_HOST);
  await expect(host).toHaveAttribute("data-placement", "bottom-left");
  await expect(host).toHaveCSS("width", "430px");
  await expect(page.getByTestId("launch-context")).toContainText('"id":"northstar_checkout_v1"');

  await expect(interview.getByTestId("recording-session-status")).toHaveText(
    "Privacy recording active",
  );
  await acceptInterview(interview);

  await interview.getByRole("button", { name: "Minimize and try it" }).click();
  await expect(host).toHaveAttribute("data-display-state", "minimized");
  await expect(page.getByText("Continue checkout interview")).toBeVisible();
  await page.getByTestId("add-plan").click();
  await expect(page.getByTestId("add-plan")).toHaveText("Annual plan added");

  await page.getByRole("button", { name: "Expand Checkout interview" }).click();
  await expect(interview.getByText("Task 1 of 2")).toBeVisible();
  await interview.getByRole("button", { name: "I completed this task" }).click();
  await expect(interview.getByText("Task 2 of 2")).toBeVisible();

  await interview.getByRole("button", { name: "Minimize and try it" }).click();
  await page.getByTestId("apply-promo").click();
  await expect(page.getByTestId("order-total")).toHaveText("$124.00");
  await page.getByRole("button", { name: "Expand Checkout interview" }).click();
  await interview.getByRole("button", { name: "I completed this task" }).click();

  await expect(interview.getByText("Follow-up · 1 of 1")).toBeVisible();
  await interview.getByRole("button", { name: "Finish interview" }).click();
  await expect(interview.getByRole("heading", { name: "Thanks — you’re all set" })).toBeVisible();
  await expect(page.getByTestId("activity-evidence-count")).toHaveText("1");
  await expect(page.getByTestId("response-count")).toHaveText("1");
  await expect(page.getByTestId("finalization-count")).toHaveText("1");
});

test("explains eligibility without side effects before presenting the interview", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("sdk-status")).toHaveText("ready");

  await page.getByTestId("explain-button").click();

  await expect(page.getByTestId("dry-run-outcome")).toHaveText("matched");
  await expect(page.getByTestId("dry-run-reason")).toHaveText("matched");
  await expect(page.getByTestId("dry-run-study")).toHaveText("42");
  await expect(page.getByTestId("live-delivery-outcome")).toHaveText("none");
  await expect(page.locator(STUDY_HOST)).not.toBeAttached();

  await page.getByTestId("launch-button").click();

  await expect(page.getByTestId("live-delivery-outcome")).toHaveText("presented");
  await expect(page.getByTestId("live-delivery-reason")).toHaveText("matched");
  await expect(page.locator(STUDY_HOST)).toBeVisible();
});

test("keeps the iframe alive while a fully custom host renderer minimizes and resumes", async ({
  page,
}) => {
  await page.goto("/?mode=headless");
  const interview = await openInterview(page);
  await acceptInterview(interview);

  await expect(page.getByTestId("headless-container")).toBeVisible();
  await interview.getByRole("button", { name: "Minimize and try it" }).click();
  await expect(page.getByTestId("headless-container")).toBeHidden();
  await expect(page.getByTestId("headless-pill")).toBeVisible();
  await page.getByTestId("add-plan").click();
  await page.getByRole("button", { name: "Return to checkout interview" }).click();
  await expect(interview.getByText("Task 1 of 2")).toBeVisible();

  await page.getByRole("button", { exact: true, name: "Minimize" }).click();
  await expect(page.getByTestId("headless-pill")).toBeVisible();
  await page.getByTestId("host-expand").click();
  await expect(interview.getByText("Task 1 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByTestId("headless-container")).not.toBeAttached();
  await expect(page.getByTestId("cleanup-count")).toHaveText("1");
});

test("reset clears active research and rotates the anonymous participant", async ({ page }) => {
  await page.goto("/");
  await openInterview(page);
  const originalVisitorId = await page.getByTestId("visitor-id").textContent();

  await page.getByTestId("reset-button").click();

  await expect(page.getByTestId("reset-status")).toHaveText("reset-complete");
  await expect(page.locator(STUDY_HOST)).not.toBeAttached();
  await expect(page.getByTestId("visitor-id")).not.toHaveText(originalVisitorId ?? "");
});

test("surfaces unavailable configuration without blocking the host product", async ({ page }) => {
  await page.goto("/?mode=unavailable");
  await expect(page.getByTestId("sdk-status")).toHaveText("unavailable");
  await expect(page.getByRole("heading", { name: "Choose your plan" })).toBeVisible();
  await page.getByTestId("launch-button").click();
  await expect(page.locator(STUDY_HOST)).not.toBeAttached();
});
