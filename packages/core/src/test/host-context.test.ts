import { describe, expect, it } from "vitest";
import { HOST_CONTEXT_V1_LIMITS, validateHostContext } from "../index.js";

const validHostContext = {
  scenario: { id: "northstar_checkout_v1", label: "Northstar checkout" },
  state: { checkoutStep: "review", promoEntryAvailable: true },
  surface: {
    id: "checkout_review",
    label: "Checkout review",
    routeTemplate: "/checkout",
  },
  task: { id: "apply_promo_code", label: "Apply a promotional code" },
  version: 1 as const,
};

describe("validateHostContext", () => {
  it("accepts and normalizes the frozen host-context v1 shape", () => {
    expect(
      validateHostContext({
        ...validHostContext,
        scenario: {
          ...validHostContext.scenario,
          label: " Northstar checkout ",
        },
        state: { checkoutStep: " review ", promoEntryAvailable: true },
      }),
    ).toEqual(validHostContext);
  });

  it.each([
    { ...validHostContext, version: 2 },
    { ...validHostContext, rawUrl: "https://shop.example/checkout" },
    {
      ...validHostContext,
      scenario: { ...validHostContext.scenario, unexpected: true },
    },
    {
      ...validHostContext,
      surface: { ...validHostContext.surface, selector: "#promo" },
    },
    {
      ...validHostContext,
      task: { ...validHostContext.task, inputValue: "not-allowed" },
    },
  ])("fails closed for unknown versions and object keys %#", (value) => {
    expect(validateHostContext(value)).toBeNull();
  });

  it.each([
    "email",
    "phone",
    "fullName",
    "userId",
    "visitor_id",
    "sessionId",
    "accountId",
    "shippingAddress",
    "authToken",
    "password",
    "promoCode",
    "paymentCard",
    "currentUrl",
    "rawPath",
    "queryString",
    "rawHtml",
    "domText",
    "inputValue",
    "cssSelector",
    "localStorage",
    "ipAddress",
  ])("rejects reserved private state key %s", (privateKey) => {
    expect(
      validateHostContext({
        ...validHostContext,
        state: { [privateKey]: "private" },
      }),
    ).toBeNull();
  });

  it.each([
    "person@example.com",
    "https://shop.example/checkout?token=secret",
    "<div>private page text</div>",
    "192.168.10.20",
    "+1 (415) 555-2671",
    "/html/body/main/input",
    "4111 1111 1111 1111",
  ])("rejects private strings %s", (privateValue) => {
    expect(
      validateHostContext({
        ...validHostContext,
        state: { checkoutState: privateValue },
      }),
    ).toBeNull();
  });

  it("rejects nested state and every frozen count/value/size bound", () => {
    const tooManyFields = Object.fromEntries(
      Array.from({ length: HOST_CONTEXT_V1_LIMITS.maxStateFields + 1 }, (_, index) => [
        `safeField${index}`,
        true,
      ]),
    );
    const oversizedState = Object.fromEntries(
      Array.from({ length: HOST_CONTEXT_V1_LIMITS.maxStateFields }, (_, index) => [
        `safeField${index}${"x".repeat(30)}`,
        "v".repeat(HOST_CONTEXT_V1_LIMITS.maxStateStringLength),
      ]),
    );

    expect(
      validateHostContext({
        ...validHostContext,
        state: { nested: { value: true } },
      }),
    ).toBeNull();
    expect(validateHostContext({ ...validHostContext, state: tooManyFields })).toBeNull();
    expect(
      validateHostContext({
        ...validHostContext,
        state: {
          itemCount: HOST_CONTEXT_V1_LIMITS.maxStateNumberMagnitude + 1,
        },
      }),
    ).toBeNull();
    expect(validateHostContext({ ...validHostContext, state: oversizedState })).toBeNull();
  });

  it.each([
    {
      ...validHostContext,
      scenario: { ...validHostContext.scenario, id: "UPPERCASE" },
    },
    {
      ...validHostContext,
      scenario: { ...validHostContext.scenario, label: "x".repeat(121) },
    },
    {
      ...validHostContext,
      surface: {
        ...validHostContext.surface,
        routeTemplate: "/checkout?step=review",
      },
    },
    {
      ...validHostContext,
      task: { ...validHostContext.task, label: "x".repeat(161) },
    },
  ])("rejects malformed or oversized contract values %#", (value) => {
    expect(validateHostContext(value)).toBeNull();
  });
});
